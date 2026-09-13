'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'
import { loadMeasure, loadRecipe } from '@/lib/takeoff'
import { priceIt } from '@/lib/price'
import { loadRates, loadRights } from '@/lib/fence'

/**
 * Fence Builder's reference data, as writes.
 *
 * Same rule as everywhere else in Hopper: every write goes through the
 * signed-in person's own session, so `internal.hopper_may_manage` is what
 * permits or refuses it. Nothing here re-checks permission in JavaScript. A
 * second copy of "who may do this" is a second place to be wrong, and only one
 * of them is the copy the database believes.
 *
 * The rate book is the one worth a word of warning: `cost` and `markup` live in
 * `fence_rate_cost`, behind their own policy, and only somebody who administers
 * the account may write them. The screen does not draw those fields to anybody
 * else; a post that carries them anyway is refused by the database, which is
 * the backstop rather than the plan.
 */

async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const on = (f: FormData, k: string) => str(f, k) === 'on'
const num = (f: FormData, k: string) => {
  const v = str(f, k); if (!v) return null
  const n = Number(v.replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function refused(msg: string, thing: string) {
  if (/row-level security|violates row-level/i.test(msg)) {
    return `You don’t have permission to change the ${thing} on this account.`
  }
  if (/duplicate key/i.test(msg)) return `That code is already in the ${thing}.`
  if (/permission denied for column/i.test(msg)) {
    return 'That figure is a cost, and you are not able to see or set costs here.'
  }
  return msg
}

/**
 * One row in, one sentence out.
 *
 * Every list on this panel is the same act: insert when there is no id, update
 * when there is, say what happened in the ledger, and redraw the panel. The
 * variation between them is which columns -- so that is the only thing each
 * caller below spells out.
 */
async function put(
  table: string, id: string | null, patch: Record<string, unknown>,
  say: { thing: string; name: string; also?: string[] },
): Promise<Result> {
  const { db, account } = await ctx()
  const q = db.schema('hopper').from(table)

  const { data, error } = id
    ? await q.update(patch).eq('id', id).eq('account_id', account).select('id').maybeSingle()
    : await q.insert({ ...patch, account_id: account }).select('id').single()

  if (error) return { ok: false, message: refused(error.message, say.thing) }
  // An update that matched nothing was permitted and still changed nothing,
  // which on this panel means the row belongs to another account or has since
  // been removed. Saying "saved" would be a lie.
  if (id && !data) return { ok: false, message: 'That row is no longer here. Reload the panel.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: say.name, object_id: data?.id ?? id,
    summary: id ? `Changed ${say.name} in the ${say.thing}`
                : `Added ${say.name} to the ${say.thing}`,
  })
  revalidatePath('/admin/fence')
  for (const p of say.also ?? []) revalidatePath(p)
  return { ok: true, message: id ? `${say.name} saved.` : `${say.name} added.` }
}

// --------------------------------------------------------------- people
export async function setFencePerson(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = nul(form, 'id')
  const person = nul(form, 'person_id')
  const role = str(form, 'job_role')
  if (!role) return { ok: false, message: 'Say which job they do.' }
  if (!id && !person) return { ok: false, message: 'Say who.' }

  // Which language somebody reads is a fact about the person, not about this
  // module -- it moved to hopper.person in 0114 for exactly that reason -- so
  // the field appears here, where it is useful, and writes there.
  const lang = str(form, 'lang')
  if (person && (lang === 'en' || lang === 'es')) {
    const { error } = await db.schema('hopper').from('person')
      .update({ lang }).eq('id', person).eq('account_id', account)
    if (error) return { ok: false, message: refused(error.message, 'roster') }
  }

  // The ledger line names the person. The add popover posts an id, not a name,
  // so the name is read rather than left as "somebody" in a year's history.
  let name = str(form, 'name')
  if (!name && person) {
    const { data } = await db.schema('hopper').from('person')
      .select('full_name').eq('id', person).eq('account_id', account).maybeSingle()
    name = (data as any)?.full_name ?? 'somebody'
  }

  return put('fence_person', id, id ? { job_role: role } : { person_id: person, job_role: role },
    { thing: 'Fence Builder roster', name: name || 'somebody' })
}

export async function dropFencePerson(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  const name = str(form, 'name') || 'somebody'
  const { error } = await db.schema('hopper').from('fence_person')
    .delete().eq('id', id).eq('account_id', account)
  if (error) return { ok: false, message: refused(error.message, 'Fence Builder roster') }

  await logAudit(db, { account_id: account, kind: 'fence', object: name,
    summary: `Took ${name} off Fence Builder` })
  revalidatePath('/admin/fence')
  // Their jobs, notes and photographs stay. This is a key, not a record.
  return { ok: true, message: `${name} no longer opens Fence Builder.` }
}

// --------------------------------------------------------------- rate book
export async function setRate(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = nul(form, 'id')
  const code = str(form, 'code').toUpperCase()
  if (!code) return { ok: false, message: 'A rate needs a code.' }

  const patch: Record<string, unknown> = {
    code, kind: str(form, 'kind') || 'material',
    grp: nul(form, 'grp'), cls: nul(form, 'cls'),
    name_en: str(form, 'name_en'), name_es: nul(form, 'name_es'),
    uom: str(form, 'uom') || 'ea',
    active: on(form, 'active'),
  }
  // A figure checked against an invoice today stops being a placeholder. The
  // date is the claim; `source` follows it rather than being set by hand.
  if (on(form, 'verified')) {
    patch.verified_on = new Date().toISOString().slice(0, 10)
    patch.source = 'invoice'
  }

  const saved = await put('fence_rate', id, patch,
    { thing: 'rate book', name: code, also: ['/fence/rates'] })
  if (!saved.ok) return saved

  // The cost side is its own row in its own table. Absent, not blank: a form
  // posted by somebody who cannot see costs carries neither field, and must not
  // reset a figure it never showed. `sell` follows by trigger, so the two can
  // never disagree.
  const cost = num(form, 'cost'), markup = num(form, 'markup')
  if (cost === null && markup === null) return saved

  const rate = id ?? (await db.schema('hopper').from('fence_rate')
    .select('id').eq('account_id', account).eq('code', code).maybeSingle()).data?.id
  if (!rate) return saved

  const had = await db.schema('hopper').from('fence_rate_cost')
    .select('cost, markup').eq('account_id', account).eq('rate_id', rate).maybeSingle()

  const { error } = await db.schema('hopper').from('fence_rate_cost').upsert({
    account_id: account, rate_id: rate,
    cost: cost ?? Number(had.data?.cost ?? 0),
    markup: markup ?? Number(had.data?.markup ?? 1),
  }, { onConflict: 'account_id,rate_id' })

  if (error) return { ok: false, message: refused(error.message, 'rate book') }
  revalidatePath('/admin/fence'); revalidatePath('/fence/rates')
  return { ok: true, message: `${code} saved.` }
}

// --------------------------------------------------------------- specs, gates
export async function setSpec(_p: Result | null, form: FormData): Promise<Result> {
  const code = str(form, 'code').toUpperCase()
  if (!code) return { ok: false, message: 'A spec needs a code.' }
  return put('fence_spec', nul(form, 'id'), {
    code, cls: str(form, 'cls') || 'permanent',
    name_en: str(form, 'name_en'), name_es: nul(form, 'name_es'),
    height_ft: num(form, 'height_ft'), spacing_ft: num(form, 'spacing_ft'),
    note: nul(form, 'note'), active: on(form, 'active'),
  }, { thing: 'spec list', name: code })
}

export async function setGateType(_p: Result | null, form: FormData): Promise<Result> {
  const code = str(form, 'code').toUpperCase()
  if (!code) return { ok: false, message: 'A gate needs a code.' }
  return put('fence_gate_type', nul(form, 'id'), {
    code, cls: str(form, 'cls') || 'permanent',
    name_en: str(form, 'name_en'), name_es: nul(form, 'name_es'),
    width_ft: num(form, 'width_ft'), rate_code: nul(form, 'rate_code'),
    active: on(form, 'active'),
  }, { thing: 'gate catalog', name: code })
}

// --------------------------------------------------------------- glossary
export async function setTerm(_p: Result | null, form: FormData): Promise<Result> {
  const en = str(form, 'en'), es = str(form, 'es')
  if (!en || !es) return { ok: false, message: 'A term needs both words. Half a pair is what the glossary exists to prevent.' }
  return put('fence_glossary', nul(form, 'id'),
    { en, es, note: nul(form, 'note') }, { thing: 'glossary', name: en })
}

// --------------------------------------------------------------- crews
export async function setCrew(_p: Result | null, form: FormData): Promise<Result> {
  const name = str(form, 'name')
  if (!name) return { ok: false, message: 'A crew needs a name.' }
  return put('fence_crew', nul(form, 'id'), {
    name, foreman_id: nul(form, 'foreman_id'),
    lang: str(form, 'lang') === 'en' ? 'en' : 'es',
    badged: on(form, 'badged'), size: num(form, 'size'),
    active: on(form, 'active'),
  }, { thing: 'crew list', name })
}

// --------------------------------------------------------- codes and billing
export async function setChargeCode(_p: Result | null, form: FormData): Promise<Result> {
  const code = str(form, 'code').toUpperCase()
  if (!code) return { ok: false, message: 'A charge code needs a code.' }
  const recurring = on(form, 'recurring')
  return put('fence_charge_code', nul(form, 'id'), {
    code, description: str(form, 'description'),
    recurring, cycle_days: recurring ? num(form, 'cycle_days') : null,
    note: nul(form, 'note'), target_id: nul(form, 'target_id'),
    // Somebody who has been through this row and saved it has checked it
    // against something. The provisional mark is theirs to clear.
    provisional: on(form, 'provisional'),
    sort: num(form, 'sort') ?? 0, active: on(form, 'active'),
  }, { thing: 'charge codes', name: code })
}

export async function setTarget(_p: Result | null, form: FormData): Promise<Result> {
  const name = str(form, 'name')
  if (!name) return { ok: false, message: 'A billing target needs a name.' }
  return put('fence_billing_target', nul(form, 'id'), {
    name, to_email: nul(form, 'to_email'),
    instructions: nul(form, 'instructions'), active: on(form, 'active'),
  }, { thing: 'billing target', name })
}

// --------------------------------------------------------------- settings
export async function setFenceSettings(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()

  const floor = num(form, 'margin_floor')
  const waste = num(form, 'waste_pct')
  if (floor === null || floor < 0 || floor > 95) {
    return { ok: false, message: 'The margin floor is a percentage between 0 and 95.' }
  }
  if (waste === null || waste < 0 || waste > 25) {
    return { ok: false, message: 'Waste is a percentage, and 25% of it would be a different problem.' }
  }

  const { error } = await db.schema('hopper').from('fence_settings').upsert({
    account_id: account, margin_floor: floor, waste_pct: waste,
    link_expires: on(form, 'link_expires'), updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id' })
  if (error) return { ok: false, message: refused(error.message, 'pricing settings') }

  // The cost half is a different table with a different rule. Absent, not
  // blank: somebody who cannot read what an hour costs us posts a form without
  // those two fields and must not blank them by saving the rest.
  const rate = num(form, 'crew_rate'), markup = num(form, 'labor_markup')
  if (rate !== null || markup !== null) {
    const had = await db.schema('hopper').from('fence_cost_settings')
      .select('crew_rate, labor_markup').eq('account_id', account).maybeSingle()
    const { error: e2 } = await db.schema('hopper').from('fence_cost_settings').upsert({
      account_id: account,
      crew_rate: rate ?? Number(had.data?.crew_rate ?? 96),
      labor_markup: markup ?? Number(had.data?.labor_markup ?? 1.85),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id' })
    if (e2) return { ok: false, message: refused(e2.message, 'pricing settings') }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: 'Pricing settings',
    summary: `Set the margin floor to ${floor}% and waste to ${waste}%`,
    payload: { margin_floor: floor, waste_pct: waste, link_expires: on(form, 'link_expires') },
  })
  revalidatePath('/admin/fence')
  return { ok: true, message: 'Pricing settings saved.' }
}

// ------------------------------------------------------------------- the line
/**
 * The runs of one job, as drawn.
 *
 * Written whole: what arrives is the complete set of runs for this job, so a run
 * removed on the screen is removed here. The client supplies each run's id — a
 * uuid it made itself — which is what makes saving twice idempotent instead of
 * inserting the line again every two seconds.
 *
 * Everything in `runs` came from a browser, so nothing in it is trusted: the
 * shape, the ranges and the counts are checked here, and `fence_run`'s own check
 * constraint catches a transposed pair the way nothing in JavaScript can.
 *
 * Whether this person may draw at all is the database's answer, not this
 * function's. `fence_run`'s policy is `hopper_fence_edits(..., 'estimate')`, so a
 * project manager and a sealed estimate are both refused — by matching no rows
 * rather than by raising, which is why a write that changes nothing says so.
 */
export async function saveRuns(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  type In = { id?: string | null; label?: string; points?: unknown; closed?: boolean
              grade?: number | null; plan_ft?: number; sort?: number
              measured_by?: string | null }
  let sent: In[]
  try { sent = JSON.parse(str(form, 'runs')) } catch { return { ok: false, message: 'The line did not arrive in one piece. Nothing was saved.' } }
  if (!Array.isArray(sent)) return { ok: false, message: 'The line did not arrive in one piece. Nothing was saved.' }
  if (sent.length > 24) return { ok: false, message: 'Twenty-four runs is the limit on one job.' }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const rows = []
  for (const [i, r] of sent.entries()) {
    if (!r.id || !uuid.test(r.id)) return { ok: false, message: 'A run arrived without a usable id.' }
    const pts = Array.isArray(r.points) ? r.points : []
    if (pts.length > 500) return { ok: false, message: 'A run of more than 500 points is a tracing, not a fence line.' }
    const clean: [number, number][] = []
    for (const p of pts) {
      if (!Array.isArray(p) || p.length !== 2) return { ok: false, message: 'A point arrived in the wrong shape.' }
      const lng = Number(p[0]), lat = Number(p[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)
          || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
        return { ok: false, message: 'A point arrived outside the world.' }
      }
      clean.push([lng, lat])
    }
    const grade = r.grade == null ? null : Number(r.grade)
    rows.push({
      id: r.id, account_id: account, job_id: job,
      label: (r.label ?? `Run ${i + 1}`).toString().slice(0, 40),
      // A line of one point measures nothing, and the check constraint refuses
      // an array of one — so a run still being started is stored without its
      // geometry rather than rejected.
      points: clean.length >= 2 ? clean : null,
      plan_ft: Number.isFinite(Number(r.plan_ft)) ? Number(r.plan_ft) : 0,
      grade_pct: grade !== null && Number.isFinite(grade) && Math.abs(grade) <= 60 ? grade : null,
      closed_loop: !!r.closed,
      // The screen says how the length was arrived at; the column's check
      // constraint says which words are allowed, and anything else is dropped
      // rather than argued with.
      measured_by: ['aerial', 'wheel', 'laser', 'plans', 'typed']
        .includes(String(r.measured_by)) ? String(r.measured_by)
        : clean.length >= 2 ? 'aerial' : null,
      sort: Number.isFinite(Number(r.sort)) ? Number(r.sort) : i,
    })
  }

  if (rows.length) {
    const { data, error } = await db.schema('hopper').from('fence_run')
      .upsert(rows, { onConflict: 'id' }).select('id')
    if (error) return { ok: false, message: refused(error.message, 'measure') }
    if ((data ?? []).length === 0) {
      return { ok: false, message: 'Nothing was saved. The estimate is either sealed or not yours to edit.' }
    }
  }

  // Runs the screen no longer has. Deleting by "not in the list" rather than by
  // id keeps the two in step even if a save was missed.
  const keep = rows.map((r) => r.id)
  const gone = db.schema('hopper').from('fence_run')
    .delete().eq('account_id', account).eq('job_id', job)
  await (keep.length ? gone.not('id', 'in', `(${keep.join(',')})`) : gone)

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: rows.length
      ? `Measured the line: ${rows.length} run${rows.length === 1 ? '' : 's'}, `
        + `${Math.round(rows.reduce((s, r) => s + r.plan_ft, 0))} ft in plan`
      : 'Cleared the measure',
  })
  revalidatePath(`/fence/${job}`)
  revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: 'Saved.' }
}

// ---------------------------------------------------------------- what goes in
/**
 * The class and the spec, which between them narrow everything downstream — the
 * catalog, the gates, the labor task, the tools on the crew ticket and the charge
 * codes. Class first is not a UI flourish: a temporary-fence job priced off a
 * permanent spec is a quote nobody can build.
 */
export async function setJobSpec(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const cls = str(form, 'cls')
  const spec = nul(form, 'spec_code')
  if (!job || !cls) return { ok: false, message: 'Nothing to save.' }

  // The spec has to belong to the class. Both come from the same form, so this
  // is the one place the pair can be checked before it is stored.
  if (spec) {
    const { data } = await db.schema('hopper').from('fence_spec')
      .select('cls').eq('account_id', account).eq('code', spec).maybeSingle()
    const has = (data as any)?.cls
    if (has && has !== cls) {
      return { ok: false, message: `${spec} is a ${has} spec, so it cannot go on a ${cls} job.` }
    }
  }

  const { data, error } = await db.schema('hopper').from('fence_job')
    .update({ cls, spec_code: spec }).eq('account_id', account).eq('id', job)
    .select('ref').maybeSingle()
  if (error) return { ok: false, message: refused(error.message, 'job') }
  if (!data) return { ok: false, message: 'Nothing was saved. The job is either sealed or not yours to edit.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (data as any).ref, object_id: job,
    summary: `Set ${(data as any).ref} to ${cls}${spec ? `, ${spec}` : ''}`,
  })
  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: 'Saved.' }
}

/**
 * The gates, written whole like the runs.
 *
 * A gate is an opening, so it does two things to the takeoff at once: it takes
 * its width out of the fence line and it puts two terminal posts back in. Which
 * is why the quantity lives here rather than being counted off the drawing.
 */
export async function setGates(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  type In = { type_code?: string; qty?: number }
  let sent: In[]
  try { sent = JSON.parse(str(form, 'gates')) } catch { return { ok: false, message: 'The gates did not arrive in one piece.' } }
  if (!Array.isArray(sent) || sent.length > 40) {
    return { ok: false, message: 'The gates did not arrive in one piece.' }
  }

  const codes = sent.map((g) => (g.type_code ?? '').toString()).filter(Boolean)
  const { data: known } = await db.schema('hopper').from('fence_gate_type')
    .select('code').eq('account_id', account).in('code', codes.length ? codes : ['-'])
  const ok = new Set(((known ?? []) as any[]).map((t) => t.code))

  const rows = sent
    .filter((g) => g.type_code && ok.has(g.type_code) && Number(g.qty) > 0)
    .map((g) => ({
      account_id: account, job_id: job,
      type_code: g.type_code as string,
      qty: Math.min(99, Math.max(1, Math.round(Number(g.qty)))),
    }))

  // Whole-set again: the screen holds every gate on the job, so what is gone from
  // it is gone. There is no transaction across two REST calls, so the NEW rows go
  // in before the old ones come out -- a failed insert then loses nothing, where
  // delete-then-insert would have emptied the list and stopped.
  const before = await db.schema('hopper').from('fence_gate')
    .select('id').eq('account_id', account).eq('job_id', job)
  const old = ((before.data ?? []) as any[]).map((g) => g.id)

  if (rows.length) {
    const { data, error } = await db.schema('hopper').from('fence_gate')
      .insert(rows).select('id')
    if (error) return { ok: false, message: refused(error.message, 'gates') }
    if ((data ?? []).length === 0) {
      return { ok: false, message: 'Nothing was saved. The estimate is either sealed or not yours to edit.' }
    }
  }

  if (old.length) {
    const { error: gone } = await db.schema('hopper').from('fence_gate')
      .delete().eq('account_id', account).eq('job_id', job).in('id', old)
    if (gone) {
      return { ok: false, message:
        'The new gates were saved, but the ones they replace are still there. '
        + 'Reload and remove the duplicates.' }
    }
  } else if (!rows.length) {
    // Nothing before, nothing now. Saying "saved" would be a lie about a write
    // that never happened, and a refusal would be a lie about a failure.
    return { ok: true, message: 'No gates on this job.' }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: rows.length
      ? `Set the gates: ${rows.reduce((s, r) => s + r.qty, 0)} in ${rows.length} kind${rows.length === 1 ? '' : 's'}`
      : 'Removed every gate',
  })
  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: 'Saved.' }
}

// ------------------------------------------------------------ onto the quote
/**
 * Freeze this estimate as an option somebody can be shown.
 *
 * The price is RECOMPUTED here, from the runs and gates in the database, using
 * the book as it stands this second. Nothing about the figure comes from the
 * form: a posted total is a total the browser chose, and the browser is not
 * where prices are decided.
 *
 * What gets frozen is the whole argument, not just the answer — the measure, the
 * quantities and the sell lines go onto the option where anybody on the job can
 * read them, and the cost side goes into `fence_option_cost` behind the cost
 * policy. A year from now the book will have moved and this quote will still
 * explain itself.
 */
export async function putOnQuote(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  const [m, recipe, book, rights] = await Promise.all([
    loadMeasure(account, job),
    loadRecipe(account),
    loadRates(account),
    loadRights(account),
  ])
  if (!m.job) return { ok: false, message: 'That job is not here.' }
  if (m.sums.fenceFt <= 0) {
    return { ok: false, message: 'Nothing is measured yet, so there is nothing to price.' }
  }
  if (!m.spec) return { ok: false, message: 'Choose a fence type first — the price comes off the spec.' }

  const priced = priceIt({
    takeoff: m.sums, gates: m.gates, spec: m.spec, recipe,
    rates: book.rates, wastePct: m.wastePct, seesCost: rights.mayReadCosts,
  })
  if (priced.sell <= 0) {
    return { ok: false, message: 'The book priced this at nothing. Fix the gaps before quoting it.' }
  }

  const label = str(form, 'label')
    || `${m.spec.name_en} · ${Math.round(m.sums.fenceFt).toLocaleString('en-US')} ft`
  const belowFloor = priced.margin != null && priced.margin < m.marginFloor

  const { data: option, error } = await db.schema('hopper').from('fence_option').insert({
    account_id: account, job_id: job,
    label: label.slice(0, 80),
    spec_code: m.spec.code,
    price: priced.sell,
    priced_at: new Date().toISOString(),
    note: belowFloor
      ? `Below the ${m.marginFloor}% margin floor at ${priced.margin}%. Needs releasing.`
      : nul(form, 'note'),
    // Quantities and sell, never cost. This is the half everybody on the job may
    // read, and it is the half that answers "where did 104 line posts come from".
    takeoff: {
      priced_on: new Date().toISOString().slice(0, 10),
      spec: m.spec.code, cls: m.job.cls,
      waste_pct: m.wastePct,
      measure: {
        plan_ft: Math.round(m.sums.planFt * 10) / 10,
        slope_ft: Math.round(m.sums.slopeFt * 10) / 10,
        opening_ft: Math.round(m.sums.openingFt * 10) / 10,
        fence_ft: Math.round(m.sums.fenceFt * 10) / 10,
        line_posts: m.sums.linePosts,
        terminal_posts: m.sums.terminalPosts,
        corner_posts: m.sums.cornerPosts,
        runs: m.sums.runs,
      },
      lines: priced.lines.map((l) => ({
        code: l.code, name: l.name, uom: l.uom, per: l.per,
        qty: l.qty, sell: l.sell, extended: l.extended, gap: l.gap,
      })),
      sell: priced.sell,
      per_foot: priced.perFoot,
      gaps: priced.gaps,
      below_floor: belowFloor,
    },
  }).select('id, label').single()

  if (error) return { ok: false, message: refused(error.message, 'estimate') }
  if (!option) return { ok: false, message: 'Nothing was saved. The estimate is either sealed or not yours to edit.' }

  // The cost side, when this person may see it at all. A quote frozen by
  // somebody who cannot read costs freezes no costs -- which is correct and
  // worth knowing, so it is said rather than left to be discovered.
  if (priced.cost != null) {
    await db.schema('hopper').from('fence_option_cost').insert({
      account_id: account, option_id: (option as any).id,
      detail: {
        cost: priced.cost, margin: priced.margin,
        lines: priced.lines.map((l) => ({ code: l.code, qty: l.qty, cost: l.cost,
                                          extended_cost: l.extendedCost })),
      },
    })
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (option as any).label, object_id: job,
    summary: `Priced ${m.job.ref} at $${priced.sell.toLocaleString('en-US')}`
      + ` over ${Math.round(m.sums.fenceFt)} ft`
      + (belowFloor ? `, below the ${m.marginFloor}% floor` : ''),
    payload: { fence_ft: Math.round(m.sums.fenceFt), sell: priced.sell,
               below_floor: belowFloor, gaps: priced.gaps.length },
  })

  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/estimate`)
  return {
    ok: true,
    message: priced.cost == null
      ? `On the quote at $${priced.sell.toLocaleString('en-US')}. The cost side was not frozen with it, because costs are not shown to you.`
      : belowFloor
        ? `On the quote at $${priced.sell.toLocaleString('en-US')} — ${priced.margin}%, under the ${m.marginFloor}% floor. It is marked as needing a release.`
        : `On the quote at $${priced.sell.toLocaleString('en-US')}.`,
  }
}
