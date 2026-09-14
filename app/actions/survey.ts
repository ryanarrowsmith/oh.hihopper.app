'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { tell } from '@/lib/notify'
import { loadSurvey, lineFor, conditionTotals } from '@/lib/survey'
import type { Result } from '@/app/actions/admin'

/**
 * The site survey, as writes.
 *
 * Nothing here re-checks permission in JavaScript. Every write goes through the
 * signed-in person's own session and `internal.hopper_fence_edits(account, job,
 * 'survey')` is what permits or refuses it — which also means the seal beats an
 * administrator, because that is the one function every write path asks.
 *
 * AN RLS-REFUSED UPDATE MATCHES ZERO ROWS RATHER THAN RAISING, so every write
 * below looks at what came back. "Saved" when nothing was written is the worst
 * possible answer on a screen whose whole job is to be believed later.
 */

async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId, person: session.personId }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const num = (f: FormData, k: string) => {
  const v = str(f, k); if (!v) return null
  const n = Number(v.replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refused(msg: string) {
  if (/row-level security|violates row-level/i.test(msg)) {
    return 'The survey is not yours to fill in, or it has been closed.'
  }
  return msg
}

/** The survey row, made on first touch rather than when the job is signed —
 *  a job that never reaches a survey should not carry an empty one. */
async function openSurvey(db: any, account: string, job: string) {
  const had = await db.schema('hopper').from('fence_survey')
    .select('id').eq('account_id', account).eq('job_id', job).maybeSingle()
  if (had.data?.id) return { id: had.data.id as string, error: null as string | null }
  const made = await db.schema('hopper').from('fence_survey')
    .insert({ account_id: account, job_id: job }).select('id').maybeSingle()
  if (made.error) return { id: null, error: refused(made.error.message) }
  if (!made.data) return { id: null, error: 'The survey is not yours to open.' }
  return { id: made.data.id as string, error: null }
}

// ------------------------------------------------------------- what it measured
/**
 * The walked lengths, all of them in one post, the way the drawing saves.
 *
 * A blank field means "nobody corrected this one", which is different from
 * zero: the row is removed rather than stored as null, so the screen shows the
 * drawn figure standing on its own rather than a correction of nothing.
 */
export async function saveWalked(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const opened = await openSurvey(db, account, job)
  if (opened.error) return { ok: false, message: opened.error }

  let sent: { run_id: string; walked?: number | null; grade?: number | null
              measured_by?: string | null; note?: string | null }[]
  try { sent = JSON.parse(str(form, 'runs')) } catch {
    return { ok: false, message: 'The measurements did not arrive in one piece. Nothing was saved.' }
  }
  if (!Array.isArray(sent)) {
    return { ok: false, message: 'The measurements did not arrive in one piece. Nothing was saved.' }
  }

  const keep: string[] = []
  const rows = []
  for (const r of sent) {
    if (!r.run_id || !uuid.test(r.run_id)) continue
    const walked = r.walked == null ? null : Number(r.walked)
    const grade = r.grade == null ? null : Number(r.grade)
    const empty = (walked == null || !Number.isFinite(walked) || walked <= 0)
      && (grade == null || !Number.isFinite(grade))
      && !r.note
    if (empty) continue
    keep.push(r.run_id)
    rows.push({
      account_id: account, job_id: job, run_id: r.run_id,
      walked_ft: walked != null && Number.isFinite(walked) && walked > 0 ? walked : null,
      grade_pct: grade != null && Number.isFinite(grade) && Math.abs(grade) <= 60 ? grade : null,
      measured_by: ['wheel', 'laser', 'plans', 'typed'].includes(String(r.measured_by))
        ? String(r.measured_by) : 'wheel',
      note: r.note || null,
    })
  }

  if (rows.length) {
    const { data, error } = await db.schema('hopper').from('fence_survey_run')
      .upsert(rows, { onConflict: 'run_id' }).select('id')
    if (error) return { ok: false, message: refused(error.message) }
    if ((data ?? []).length === 0) {
      return { ok: false, message: 'Nothing was saved. The survey is either closed or not yours.' }
    }
  }

  // Rows the screen no longer sends — a figure somebody cleared.
  const gone = db.schema('hopper').from('fence_survey_run')
    .delete().eq('account_id', account).eq('job_id', job)
  await (keep.length ? gone.not('run_id', 'in', `(${keep.join(',')})`) : gone)

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: rows.length
      ? `Walked the line: ${rows.length} run${rows.length === 1 ? '' : 's'} measured on site`
      : 'Cleared the walked measurements',
  })
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}`)
  return { ok: true, message: 'Saved.' }
}

// ------------------------------------------------------------ what it had on it
/**
 * One condition, on or off, with its quantity.
 *
 * `where` says which side of the signature this is: the estimate's assumption,
 * or the survey's finding. They are separate tables answering to separate
 * policies, and the difference between them is what the screen shows.
 */
export async function setCondition(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const condition = str(form, 'condition_id')
  const side = str(form, 'where') === 'quote' ? 'quote' : 'survey'
  if (!uuid.test(job) || !uuid.test(condition)) {
    return { ok: false, message: 'That is not a condition on this job.' }
  }
  const table = side === 'quote' ? 'fence_job_condition' : 'fence_survey_condition'

  if (side === 'survey') {
    const opened = await openSurvey(db, account, job)
    if (opened.error) return { ok: false, message: opened.error }
  }

  const q = db.schema('hopper').from(table)

  if (str(form, 'on') !== 'on') {
    const { error } = await q.delete()
      .eq('account_id', account).eq('job_id', job).eq('condition_id', condition)
    if (error) return { ok: false, message: refused(error.message) }
    revalidatePath(`/fence/${job}/survey`)
    revalidatePath(`/fence/${job}/estimate`)
    return { ok: true, message: 'Taken off.' }
  }

  const qty = num(form, 'qty')
  const { data, error } = await q.upsert({
    account_id: account, job_id: job, condition_id: condition,
    qty: qty != null && qty >= 0 ? qty : null,
    detail: nul(form, 'detail'),
  }, { onConflict: 'job_id,condition_id' }).select('id')

  if (error) return { ok: false, message: refused(error.message) }
  if ((data ?? []).length === 0) {
    return { ok: false, message: side === 'quote'
      ? 'The estimate is sealed, so what it assumed can no longer be changed.'
      : 'Nothing was saved. The survey is either closed or not yours.' }
  }
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: 'Saved.' }
}

// --------------------------------------------------- getting on site, and 811
export async function saveAccess(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const opened = await openSurvey(db, account, job)
  if (opened.error) return { ok: false, message: opened.error }

  /* THE LOCATE IS DATES, NOT A TICK. It is the only field on this screen that
     can stop a job legally: dig_from gates scheduling and locate_expires is
     what catches a job that slipped three weeks and would have been dug on a
     dead ticket. So an expiry before the dig date is refused rather than
     stored — a locate that expires before you may dig is not a typo anybody
     wants discovered on site. */
  const from = nul(form, 'dig_from'), ends = nul(form, 'locate_expires')
  if (from && ends && ends < from) {
    return { ok: false, message: 'The locate expires before the clear-to-dig date. One of those dates is wrong.' }
  }

  const { data, error } = await db.schema('hopper').from('fence_survey').update({
    locate_ticket: nul(form, 'locate_ticket'),
    dig_from: from, locate_expires: ends,
    access: nul(form, 'access'),
    ask_for: nul(form, 'ask_for'),
    utilities: nul(form, 'utilities'),
  }).eq('account_id', account).eq('job_id', job).select('id')

  if (error) return { ok: false, message: refused(error.message) }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was saved. The survey is either closed or not yours.' }
  }
  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: 'Recorded site access and the utility locate',
  })
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}`)
  return { ok: true, message: 'Saved.' }
}

// -------------------------------------------------------------- the one decision
/**
 * Closing it, and the only decision on the screen.
 *
 * Ryan, 14 Sep: nothing reaches the customer automatically. The difference
 * between the signed price and what the site turned out to be is sometimes
 * worth eating and sometimes worth a conversation, and only the person who just
 * walked the site knows which. So this records WHICH, tells the salesperson,
 * and stops. Writing to the customer is a separate act somebody presses.
 */
export async function closeSurvey(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const job = str(form, 'job_id')
  const outcome = str(form, 'outcome')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }
  if (outcome !== 'absorb' && outcome !== 'review') {
    return { ok: false, message: 'Say whether we absorb the difference or the customer reviews it.' }
  }

  const read = await loadSurvey(account, job)
  if (!read.survey) return { ok: false, message: 'There is nothing filled in to close yet.' }
  if (read.survey.closed_at) return { ok: false, message: 'This survey is already closed.' }

  const { sell, gaps } = conditionTotals(read.conditions, read.found)
  const drawnFt = Math.round(read.measure.sums.fenceFt)
  const walkedFt = Math.round(read.after.fenceFt)

  const { data, error } = await db.schema('hopper').from('fence_survey').update({
    outcome, note: nul(form, 'note'),
    closed_at: new Date().toISOString(), closed_by: person,
  }).eq('account_id', account).eq('job_id', job).is('closed_at', null).select('id')

  if (error) return { ok: false, message: refused(error.message) }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was closed. The survey is either already closed or not yours.' }
  }

  /* The job moves on. Only forward: a survey closed on a job somebody has
     already scheduled must not drag it backwards. */
  await db.schema('hopper').from('fence_job')
    .update({ stage: 'schedule' })
    .eq('account_id', account).eq('id', job).eq('stage', 'survey')

  await tellSales(db, account, job, {
    outcome, sell, drawnFt, walkedFt, gaps: gaps.length,
  })

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: outcome === 'absorb'
      ? `Closed the survey — we absorb ${money(sell)} of site conditions`
      : `Closed the survey — ${money(sell)} of site conditions go back to the customer`,
  })
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}`)
  revalidatePath('/fence')
  return {
    ok: true,
    message: outcome === 'absorb'
      ? 'Closed. The job books at the signed price and sales has been told.'
      : 'Closed. Sales has been told to take the revised figure back to the customer.',
  }
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Whoever sold it hears first, because they are the one who has to speak to
 *  the customer. The bell and the mail together — the bell for somebody already
 *  in Hopper, the mail for somebody who is not. */
async function tellSales(
  db: any, account: string, job: string,
  it: { outcome: string; sell: number; drawnFt: number; walkedFt: number; gaps: number },
) {
  const { data: jobRow } = await db.schema('hopper').from('fence_job')
    .select('ref, name, created_by').eq('account_id', account).eq('id', job).maybeSingle()
  const { data: sellers } = await db.schema('hopper').from('fence_person')
    .select('person_id').eq('account_id', account).eq('job_role', 'sales')

  const ids = new Set(((sellers ?? []) as any[]).map((p) => p.person_id))
  if (jobRow?.created_by) ids.add(jobRow.created_by)
  if (!ids.size) return

  const ft = it.walkedFt === it.drawnFt ? `${it.walkedFt} ft, as drawn`
    : `${it.walkedFt} ft against ${it.drawnFt} drawn`
  const body = it.outcome === 'absorb'
    ? `The survey is closed. ${money(it.sell)} of site conditions, and we are absorbing them — `
      + `the customer keeps the price they signed. The line measured ${ft}.`
    : `The survey is closed. ${money(it.sell)} of site conditions need to go back to the customer `
      + `before this is built. The line measured ${ft}.`

  const title = `${jobRow?.ref ?? 'A job'} — survey closed`
  for (const id of ids) {
    /* 'status' rather than a kind of its own: notification.kind carries a
       CHECK naming every kind, so inventing one here would be a migration and
       a renderer change for a bell that already says the right thing. */
    await tell(id, 'status', title, `/fence/${job}/survey`, {
      body: it.gaps ? `${body} ${it.gaps} of them have no rate book line yet.` : body,
      object: jobRow?.name ?? null, objectId: job,
    })
  }
}
