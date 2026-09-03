'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { tellMentioned } from '@/lib/notify'

export type Result = { ok: boolean; message: string }

async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId, person: session.personId }
}

/**
 * The cap the database enforces, said once here too.
 *
 * It was 3 in both writers and stayed 3 when the chart kit went to ten -- so a
 * form offering ten measures would have written three and dropped the rest
 * without a word. The check constraint would not have caught it either: fewer
 * measures than allowed is always valid.
 */
const MEASURE_MAX = 10

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null

/**
 * Postgres speaks for itself where it can. These are the two refusals a person
 * can actually cause from a form, turned into the sentence they need rather
 * than the one the driver produced.
 */
function refused(message: string, thing: string) {
  if (/duplicate key/i.test(message)) return `There is already a ${thing} with that name here.`
  if (/violates row-level security|permission denied/i.test(message)) {
    return `You cannot add a ${thing} there.`
  }
  if (/report_snapshot_shape/i.test(message)) {
    return 'An uploaded or pasted source is a snapshot, so it cannot carry a refresh schedule.'
  }
  return message
}

// ---------------------------------------------------------------- categories

export async function createCategory(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const department_id = str(form, 'department_id')
  const name = str(form, 'name')
  // A category belongs to exactly one department -- it is a kind of report THAT
  // department runs -- so the department is not optional and the button says so
  // rather than the save explaining it afterwards.
  if (!department_id) return { ok: false, message: 'Choose the department this belongs to first.' }
  if (!name) return { ok: false, message: 'A category needs a name.' }

  const { error } = await db.schema('hopper').from('report_category')
    .insert({ account_id: account, department_id, name })
  if (error) return { ok: false, message: refused(error.message, 'category') }

  revalidatePath('/reporting'); revalidatePath('/reporting/categories')
  return { ok: true, message: `${name} added.` }
}

export async function deleteCategory(_p: Result | null, form: FormData): Promise<Result> {
  const { db } = await ctx()
  const id = str(form, 'id')
  // Enforced on the button, but a form can still be sent twice. The count is
  // the honest answer either way.
  const { count } = await db.schema('hopper').from('report')
    .select('id', { count: 'exact', head: true }).eq('category_id', id)
  if (count) {
    return { ok: false, message: `${count} report${count === 1 ? '' : 's'} still sit${count === 1 ? 's' : ''} in that category. Move them first.` }
  }
  const { error } = await db.schema('hopper').from('report_category').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/reporting/categories')
  return { ok: true, message: 'Removed.' }
}

// ------------------------------------------------------------------- reports

/**
 * Register a report: a pointer, not data.
 *
 * The note is required before anything saves. A report that quietly changed
 * shape is worse than no report at all, and the only moment anybody knows why
 * it changed is right now.
 */
export async function createReport(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()

  const name = str(form, 'name')
  const entity_id = str(form, 'entity_id')
  const department_id = str(form, 'department_id')
  const category_id = str(form, 'category_id')
  const source_kind = str(form, 'source_kind') || 'google_sheet'
  const source_url = nul(form, 'source_url')
  const note = str(form, 'note')

  if (!name) return { ok: false, message: 'The report needs a name.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }
  if (!department_id) return { ok: false, message: 'Choose the department it belongs to.' }
  if (!category_id) return { ok: false, message: 'Choose a category.' }
  if (!note) return { ok: false, message: 'Say what this report is for before saving it.' }

  const snapshot = source_kind === 'upload' || source_kind === 'paste'
  if (!snapshot && !source_url) return { ok: false, message: 'Where does the data live?' }

  const measures = form.getAll('measure').map((m) => m.toString().trim()).filter(Boolean).slice(0, MEASURE_MAX)

  const { data, error } = await db.schema('hopper').from('report').insert({
    account_id: account, entity_id, department_id, category_id, name,
    source_kind, source_url, source_tab: nul(form, 'source_tab'),
    workbook_title: nul(form, 'workbook_title'),
    // A snapshot says so permanently: it never claims a schedule, and the
    // database refuses the combination rather than trusting this line.
    refresh: snapshot ? 'none' : (str(form, 'refresh') || 'daily'),
    snapshot_at: snapshot ? new Date().toISOString() : null,
    restricted: form.get('restricted') === 'on',
    chart_type: str(form, 'chart_type') || 'line',
    chart_x: nul(form, 'chart_x'),
    chart_measures: measures.length ? measures : null,
    // A picked file, when the sheet is private. Null keeps the open door, which
    // is still the one to prefer: no credential is involved in it at all.
    google_file_id: nul(form, 'google_file_id'),
    // How many of the most recent readings the chart draws. Empty means every
    // reading the date range holds, which is what every report meant before
    // this existed -- so an untouched form changes nothing.
    chart_points: (() => {
      const n = Number(str(form, 'chart_points'))
      return Number.isFinite(n) && n >= 2 && n <= 500 ? Math.round(n) : null
    })(),
    date_column: nul(form, 'date_column'),
    created_by: person, updated_by: person,
  }).select('id').single()

  if (error) return { ok: false, message: refused(error.message, 'report') }

  await db.schema('hopper').from('report_note')
    .insert({ account_id: account, report_id: data.id, body: note, author_id: person })

  await logAudit(db, { account_id: account, kind: 'report', object: name,
    object_id: data.id, summary: `Registered the report ${name}`, note })

  revalidatePath('/reporting')
  return { ok: true, message: `${name} registered. Nothing has been read yet — refresh it to fetch the first numbers.` }
}

export async function updateReport(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = str(form, 'id')
  const name = str(form, 'name')
  const note = str(form, 'note')
  if (!id || !name) return { ok: false, message: 'Nothing to save.' }
  if (!note) return { ok: false, message: 'Say what changed before saving it.' }

  const measures = form.getAll('measure').map((m) => m.toString().trim()).filter(Boolean).slice(0, MEASURE_MAX)

  const { error } = await db.schema('hopper').from('report').update({
    name,
    source_url: nul(form, 'source_url'),
    source_tab: nul(form, 'source_tab'),
    refresh: str(form, 'refresh') || 'daily',
    restricted: form.get('restricted') === 'on',
    chart_type: str(form, 'chart_type') || 'line',
    // What goes along the bottom is the date column in every path there is, so
    // a form that only asks once is not hiding a second question. Without this
    // the edit form -- which has no chart_x field -- silently cleared it.
    chart_x: nul(form, 'chart_x') ?? nul(form, 'date_column'),
    chart_measures: measures.length ? measures : null,
    // A picked file, when the sheet is private. Null keeps the open door, which
    // is still the one to prefer: no credential is involved in it at all.
    google_file_id: nul(form, 'google_file_id'),
    // How many of the most recent readings the chart draws. Empty means every
    // reading the date range holds, which is what every report meant before
    // this existed -- so an untouched form changes nothing.
    chart_points: (() => {
      const n = Number(str(form, 'chart_points'))
      return Number.isFinite(n) && n >= 2 && n <= 500 ? Math.round(n) : null
    })(),
    date_column: nul(form, 'date_column'),
    updated_by: person, updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return { ok: false, message: refused(error.message, 'report') }

  // Two records of one edit, and they answer different questions. The note is
  // what the person SAID -- it sits on the report's own page, in their words,
  // for whoever is reading the report next. The ledger entry is what HAPPENED,
  // kept for seven years, and it carries the note so the reason travels with
  // the change rather than living only on a screen somebody has to think to
  // open. An edit that changed a number's source and left no reason anywhere is
  // exactly the change nobody can account for later.
  await db.schema('hopper').from('report_note')
    .insert({ account_id: account, report_id: id, body: note, author_id: person })

  await logAudit(db, { account_id: account, kind: 'report', object: name,
    object_id: id, summary: `Edited the report ${name}`, note })

  // Anybody the note names hears about it. After the write, never before: a
  // notification about a change that did not save is worse than none.
  await tellMentioned(note, {
    title: `You were mentioned on ${name}`,
    href: `/reporting/${id}`, object: 'report', objectId: id,
  })

  revalidatePath('/reporting'); revalidatePath(`/reporting/${id}`)
  return { ok: true, message: 'Saved.' }
}

// ------------------------------------------------------------------ refresh

/**
 * Go and look, now.
 *
 * The reading itself happens in the read-report edge function, which is the
 * only thing holding a key that may write a reading -- so this hands the
 * person's OWN token along and lets that function decide, through RLS, whether
 * they were allowed to ask. Hopper's web server never gets to write a number.
 */
export async function refreshReport(_p: Result | null, form: FormData): Promise<Result> {
  const db = supabaseServer()
  const id = str(form, 'id')
  if (!id) return { ok: false, message: 'Which report?' }

  const { data: { session } } = await db.auth.getSession()
  if (!session) return { ok: false, message: 'Sign in again — your session has expired.' }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  let res: Response
  try {
    res = await fetch(`${base}/functions/v1/read-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ report_id: id }),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, message: 'Hopper could not reach the reader. Try again in a moment.' }
  }

  const out = await res.json().catch(() => ({}))
  revalidatePath('/reporting'); revalidatePath(`/reporting/${id}`)

  if (out?.ok) {
    const n = out.rows ?? 0
    return { ok: true, message: `Read ${n.toLocaleString()} row${n === 1 ? '' : 's'}.` }
  }
  // The failure is already kept as a failure on the report. This just repeats
  // it to the person who asked, in the same words.
  return { ok: false, message: out?.failure ?? out?.error ?? 'The look failed and Hopper does not know why.' }
}
