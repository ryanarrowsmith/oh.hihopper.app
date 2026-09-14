'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'
import { loadMeasure, loadRecipe } from '@/lib/takeoff'
import { priceIt } from '@/lib/price'
import { loadRates, loadRights, loadJob } from '@/lib/fence'
import { geocode, whyNoPin } from '@/lib/mapbox'
import { buildSheet as buildSheetFrom, mergeSheet, whatBlocks } from '@/lib/handoff'
import { loadBilling } from '@/lib/billing'
import { SPINE, draft, spineOf, type Part } from '@/lib/sow'
import { aiReady, askClaude, firstJson, MODEL } from '@/lib/ai'
import { factsFor, englishPrompt, spanishPrompt, figureCheck, mustKeepOf,
         numbersEverywhere, SYSTEM } from '@/lib/sow-ai'

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
    // What it PRICES from and what it BILLS under are two different books, and a
    // gate is the only thing in the module that needs both.
    charge_code: nul(form, 'charge_code'),
    active: on(form, 'active'),
  }, { thing: 'gate catalog', name: code })
}

/**
 * Which charge code a class of work rolls up into.
 *
 * One rule per class per bucket, which is what the unique index says and what
 * makes the roll-up derivable rather than a search. An ABSENT gate rule is a
 * statement rather than an omission: a temporary fence rental includes its panel
 * gates, so temporary has no gate rule and its gates bill inside the fence line.
 * Retiring a rule is how you say that.
 */
export async function setChargeRule(_p: Result | null, form: FormData): Promise<Result> {
  const cls = str(form, 'cls')
  const takes = str(form, 'takes')
  const code = str(form, 'charge_code').toUpperCase()
  if (!['permanent', 'temporary', 'secure'].includes(cls)) {
    return { ok: false, message: 'A rule belongs to one class of work.' }
  }
  if (!['fence', 'gate'].includes(takes)) {
    return { ok: false, message: 'A rule collects either the fence or the gates.' }
  }
  if (!code) return { ok: false, message: 'A rule needs the code it rolls up into.' }
  return put('fence_charge_rule', nul(form, 'id'), {
    cls, takes, charge_code: code,
    note: nul(form, 'note'), active: on(form, 'active'),
  }, { thing: 'roll-up rules', name: `${cls} · ${takes} · ${code}` })
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
        // The gate TYPE, on a gate line. The charge code a gate bills under
        // hangs off the type, and two types share one rate code, so without
        // this the billing sheet cannot tell a walk gate from a slider.
        type_code: l.typeCode,
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

// ------------------------------------------------------------- the release
/**
 * Let a quote under the margin floor go out.
 *
 * A release is a ROW, not a change to the option: the price, the takeoff and the
 * lines are exactly what they were, with somebody's name and a time against them.
 * A release that quietly reprices is a release nobody can audit — and a policy
 * that could rewrite the price is a policy that will, one day, by accident.
 *
 * Who may is `internal.hopper_fence_release`, which is not the estimate's owner:
 * a salesperson releasing their own thin quote is the floor releasing itself.
 */
export async function releaseOption(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  const option = str(form, 'option_id')
  if (!option) return { ok: false, message: 'No option.' }

  const { data: row } = await db.schema('hopper').from('fence_option')
    .select('id, label, job_id, price').eq('account_id', account).eq('id', option).maybeSingle()
  if (!row) return { ok: false, message: 'That option is not here.' }

  const { data, error } = await db.schema('hopper').from('fence_option_release').upsert({
    account_id: account, option_id: option,
    released_by: session?.userId ?? null,
    released_at: new Date().toISOString(),
    note: nul(form, 'note'),
  }, { onConflict: 'account_id,option_id' }).select('option_id')

  if (error) return { ok: false, message: refused(error.message, 'release') }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Releasing a quote under the floor is not yours to do.' }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (row as any).label, object_id: (row as any).job_id,
    summary: `Released ${(row as any).label} below the margin floor`,
    note: nul(form, 'note'),
  })
  revalidatePath(`/fence/${(row as any).job_id}`)
  revalidatePath(`/fence/${(row as any).job_id}/estimate`)
  return { ok: true, message: 'Released. It can go to the customer.' }
}

// ------------------------------------------------------------- scope of work
/** The spine, and nothing else. A key the app did not write is not a heading. */
function partsFrom(form: FormData, lang: 'en' | 'es'): Part[] {
  return SPINE.map((s) => ({
    key: s.key,
    text: (form.get(`part_${lang}_${s.key}`) ?? '').toString()
      .replace(/\r\n/g, '\n').trim().slice(0, 8000),
  }))
}

const sameParts = (a: Part[], b: Part[]) =>
  a.length === b.length && a.every((p, i) => p.key === b[i].key && p.text === b[i].text)

/**
 * Write the scope — both languages, one act.
 *
 * ONE FORM, BECAUSE THE JOB IS A COMPARISON. Somebody making the Spanish true
 * reads one part against the other, so the screen puts them on the same row and
 * this saves them together. Two forms would have meant two Save buttons and two
 * columns that drift out of line the moment one side runs longer.
 *
 * EACH SIDE IS STAMPED ONLY IF IT CHANGED, which is what keeps the staleness
 * check honest: written_en later than written_es means the English moved and the
 * Spanish did not, and a crew reading the Spanish is reading the older of the
 * two. Saving both at once must not paper over that.
 *
 * A SIGNATURE DOES NOT SURVIVE AN EDIT. Somebody bilingual signs to say a crew
 * can build from these words; change the words and the signature is about words
 * that are no longer there. Saving without changing anything leaves it alone —
 * pressing Save to check it saved should not unsign a scope.
 */
export async function saveSow(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  const { data: had } = await db.schema('hopper').from('fence_sow')
    .select('id, parts_en, parts_es, signed_at')
    .eq('account_id', account).eq('job_id', job).maybeSingle()

  const nextEn = partsFrom(form, 'en'), nextEs = partsFrom(form, 'es')
  const movedEn = !sameParts(spineOf(((had as any)?.parts_en ?? []) as Part[]), nextEn)
  const movedEs = !sameParts(spineOf(((had as any)?.parts_es ?? []) as Part[]), nextEs)
  if (!movedEn && !movedEs) return { ok: true, message: 'Nothing had changed.' }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { account_id: account, job_id: job }
  if (movedEn) { patch.parts_en = nextEn; patch.written_en = now }
  if (movedEs) { patch.parts_es = nextEs; patch.written_es = now }
  if ((had as any)?.signed_at) { patch.signed_at = null; patch.signed_by = null }

  const { data, error } = (had as any)?.id
    ? await db.schema('hopper').from('fence_sow').update(patch)
        .eq('account_id', account).eq('id', (had as any).id).select('id').maybeSingle()
    : await db.schema('hopper').from('fence_sow').insert(patch).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'scope of work') }
  if (!data) return { ok: false, message: 'Nothing was saved. The scope is either sealed or not yours to edit.' }

  const which = movedEn && movedEs ? 'both languages' : movedEn ? 'the English' : 'the Spanish'
  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: `Wrote ${which} of the scope of work`,
  })
  revalidatePath(`/fence/${job}/sow`); revalidatePath(`/fence/${job}`)
  return {
    ok: true,
    message: (had as any)?.signed_at
      ? `Saved ${which}. The signature is cleared, because it was for the words that were there before.`
      : `Saved ${which}.`,
  }
}

/**
 * A first draft, from the job's own figures.
 *
 * It REPLACES the language it drafts, which is why the button says so. There is
 * no merge that would not be a guess about which half of a sentence was the
 * person's.
 */
export async function draftSow(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const lang = str(form, 'lang') === 'es' ? 'es' : 'en'
  if (!job) return { ok: false, message: 'No job.' }

  const [m, { data: terms }, { data: had }] = await Promise.all([
    loadMeasure(account, job),
    db.schema('hopper').from('fence_glossary').select('en, es').eq('account_id', account),
    db.schema('hopper').from('fence_sow').select('id, signed_at')
      .eq('account_id', account).eq('job_id', job).maybeSingle(),
  ])
  if (!m.job) return { ok: false, message: 'That job is not here.' }
  if (m.sums.fenceFt <= 0) {
    return { ok: false, message: 'Nothing is measured yet, so a draft would be a page of blanks.' }
  }

  const parts = draft({
    job: m.job, spec: m.spec, takeoff: m.sums, gates: m.gates,
    glossary: ((terms ?? []) as any[]).map((t) => ({ en: t.en, es: t.es })),
  }, lang)

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    account_id: account, job_id: job, drafted_at: now,
    [lang === 'es' ? 'parts_es' : 'parts_en']: parts,
    [lang === 'es' ? 'written_es' : 'written_en']: now,
  }
  if ((had as any)?.signed_at) { patch.signed_at = null; patch.signed_by = null }

  const { data, error } = (had as any)?.id
    ? await db.schema('hopper').from('fence_sow').update(patch)
        .eq('account_id', account).eq('id', (had as any).id).select('id').maybeSingle()
    : await db.schema('hopper').from('fence_sow').insert(patch).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'scope of work') }
  if (!data) return { ok: false, message: 'Nothing was saved. The scope is either sealed or not yours to edit.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: `Drafted the ${lang === 'es' ? 'Spanish' : 'English'} scope of work from the takeoff`,
  })
  revalidatePath(`/fence/${job}/sow`)
  return { ok: true, message: 'Drafted from the measure. Every word of it is yours to change.' }
}

/**
 * Sign it, meaning: a crew may build from these words.
 *
 * The signature is a person and a moment, and it belongs to the words that were
 * there when it was made. Nothing here checks whether the signer reads Spanish —
 * a database cannot know that, and pretending to check is worse than saying
 * plainly on the screen what signing means.
 */
export async function signSow(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  const { data: sow } = await db.schema('hopper').from('fence_sow')
    .select('id, parts_en, parts_es').eq('account_id', account).eq('job_id', job).maybeSingle()
  if (!sow) return { ok: false, message: 'There is no scope to sign yet.' }

  const filled = (p: any) => Array.isArray(p) && p.some((x: any) => (x?.text ?? '').trim())
  if (!filled((sow as any).parts_en) || !filled((sow as any).parts_es)) {
    return { ok: false, message: 'Both languages have to be written before it can be signed.' }
  }

  const { data, error } = await db.schema('hopper').from('fence_sow')
    .update({ signed_by: session?.userId ?? null, signed_at: new Date().toISOString() })
    .eq('account_id', account).eq('id', (sow as any).id).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'scope of work') }
  if (!data) return { ok: false, message: 'Nothing was saved. The scope is either sealed or not yours to edit.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: 'Signed the scope of work — a crew may build from it',
  })
  revalidatePath(`/fence/${job}/sow`); revalidatePath(`/fence/${job}`)
  return { ok: true, message: 'Signed. The crew ticket can carry it.' }
}

// ------------------------------------------------------- drafted by a model
/**
 * Ask Claude to write the scope.
 *
 * THE TAKEOFF OWNS THE NUMBERS AND THE MODEL OWNS THE SENTENCES. The facts go in
 * as structured data — no prices, ever, built field by field so that adding a
 * column to fence_job cannot quietly start sending it — and what comes back is
 * checked against those facts before a word of it is stored. A figure in the
 * prose that is in none of the facts REFUSES the draft: a hallucinated post
 * spacing is a fence built wrong at the customer's expense, and a warning under
 * a saved draft is a warning nobody reads.
 *
 * A dropped figure is only reported, because that is a judgement about what
 * belongs in the prose and the project manager is the one making it.
 *
 * Spanish is written FROM THE ENGLISH, which is the one place in this module
 * where a translation is a translation: the English is the document the business
 * agreed to, the glossary pairs are handed over as the shop's own words, and the
 * check on the screen then verifies both independently.
 */
export async function aiDraftSow(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const lang = str(form, 'lang') === 'es' ? 'es' : 'en'
  if (!job) return { ok: false, message: 'No job.' }
  if (!aiReady()) {
    return { ok: false, message: 'No Anthropic key is set on this deployment, so nothing can be drafted by a model.' }
  }

  const [m, { data: terms }, { data: had }, { data: notes }] = await Promise.all([
    loadMeasure(account, job),
    db.schema('hopper').from('fence_glossary').select('en, es').eq('account_id', account),
    db.schema('hopper').from('fence_sow')
      .select('id, parts_en, parts_es, signed_at').eq('account_id', account)
      .eq('job_id', job).maybeSingle(),
    // What people have actually said about this job. The survey note is usually
    // the difference between a template and a scope somebody can build from.
    db.schema('hopper').from('fence_note').select('body, section, by_crew')
      .eq('account_id', account).eq('job_id', job)
      .order('created_at', { ascending: false }).limit(12),
  ])
  if (!m.job) return { ok: false, message: 'That job is not here.' }
  if (m.sums.fenceFt <= 0) {
    return { ok: false, message: 'Nothing is measured yet, so there are no facts to write from.' }
  }

  const glossary = ((terms ?? []) as any[]).map((t) => ({ en: t.en, es: t.es }))
  const en = spineOf(((had as any)?.parts_en ?? []) as Part[])
  if (lang === 'es' && !en.some((p) => p.text.trim())) {
    return { ok: false, message: 'Write the English first — the Spanish is written from it.' }
  }

  const facts = factsFor({
    job: m.job, spec: m.spec, takeoff: m.sums, gates: m.gates,
    notes: ((notes ?? []) as any[]).map((n) => String(n.body ?? '').slice(0, 600)).filter(Boolean),
  })

  const said = await askClaude({
    system: SYSTEM,
    user: lang === 'es' ? spanishPrompt(facts, en, glossary) : englishPrompt(facts, en),
    maxTokens: 2400,
  })
  if (!said.ok) return { ok: false, message: said.why }

  const got = firstJson<Record<string, string>>(said.text)
  if (!got) {
    return { ok: false, message: 'The model did not answer in the shape it was asked for. Nothing was saved.' }
  }

  const parts: Part[] = SPINE.map((sp) => ({
    key: sp.key, text: String(got[sp.key] ?? '').trim().slice(0, 8000),
  }))
  if (!parts.some((p) => p.text)) {
    return { ok: false, message: 'The model came back with an empty scope. Nothing was saved.' }
  }

  // What it was allowed to know: the facts, plus whatever a person had already
  // typed. For the Spanish, the English it is translating counts too.
  const allowed = numbersEverywhere(facts).join(' ')
    + ' ' + en.map((p) => p.text).join(' ')
    + ' ' + spineOf(((had as any)?.parts_es ?? []) as Part[]).map((p) => p.text).join(' ')
  const check = figureCheck({
    allowed,
    // What it must not lose is the measure and the gates. The job reference and
    // the zip code are numbers too, and reporting those as "left out" is noise.
    mustKeep: mustKeepOf(facts),
    wrote: parts.map((p) => p.text).join(' '),
  })

  if (check.invented.length) {
    return {
      ok: false,
      message: `Refused. The draft contains ${check.invented.length === 1 ? 'a figure' : 'figures'} `
        + `that appear nowhere in this job — ${check.invented.join(', ')}. Nothing was saved. `
        + `The takeoff owns the numbers, so a draft that adds one is thrown away rather than corrected.`,
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    account_id: account, job_id: job, drafted_at: now, draft_model: said.model,
    [lang === 'es' ? 'parts_es' : 'parts_en']: parts,
    [lang === 'es' ? 'written_es' : 'written_en']: now,
    [lang === 'es' ? 'drafted_es' : 'drafted_en']: 'claude',
  }
  if ((had as any)?.signed_at) { patch.signed_at = null; patch.signed_by = null }

  const { data, error } = (had as any)?.id
    ? await db.schema('hopper').from('fence_sow').update(patch)
        .eq('account_id', account).eq('id', (had as any).id).select('id').maybeSingle()
    : await db.schema('hopper').from('fence_sow').insert(patch).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'scope of work') }
  if (!data) return { ok: false, message: 'Nothing was saved. The scope is either sealed or not yours to edit.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: `${said.model} drafted the ${lang === 'es' ? 'Spanish' : 'English'} scope of work`,
    payload: { model: said.model, missing_figures: check.missing.length },
  })
  revalidatePath(`/fence/${job}/sow`)

  return {
    ok: true,
    message: check.missing.length
      ? `Drafted by ${said.model}. It left out ${check.missing.join(', ')} — figures the takeoff `
        + `gave it. Put them back if they belong, then read it before signing.`
      : `Drafted by ${said.model}. Read it before signing: a model writes the sentences, the `
        + `takeoff owns the numbers, and nobody but you owns the judgement.`,
  }
}

// ------------------------------------------------ sales sends it forward
/**
 * The handoff: sales finishes, and the project manager's work appears.
 *
 * Two things happen and they belong together. The estimate is SEALED — the sales
 * portion locks here, which is the module's oldest rule and the reason a seal
 * beats an administrator. And the task plan is kicked off: every standing step
 * from `fence_task_plan` becomes a real task on this job.
 *
 * The plan is copied, not referenced. A job's tasks are what the plan said when
 * the job was handed over; editing the plan next month changes the next job, not
 * this one. Somebody halfway through a build does not get new homework because
 * head office reworded a checklist.
 *
 * Idempotent on the tasks: a second press adds nothing, because the seal is what
 * says the handoff happened and the plan rows are matched on what they say.
 */
export async function handToPm(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  const [{ data: row }, { data: plan }, { data: already }] = await Promise.all([
    db.schema('hopper').from('fence_job').select('id, ref, stage, reached')
      .eq('account_id', account).eq('id', job).maybeSingle(),
    db.schema('hopper').from('fence_task_plan')
      .select('section, en, es, needs, due_days, sort')
      .eq('account_id', account).eq('active', true).order('sort'),
    db.schema('hopper').from('fence_task').select('section, en')
      .eq('account_id', account).eq('job_id', job),
  ])
  if (!row) return { ok: false, message: 'That job is not here.' }

  const { data: options } = await db.schema('hopper').from('fence_option')
    .select('id, label, price, spec_code, accepted')
    .eq('account_id', account).eq('job_id', job)
  if (!options?.length) {
    return { ok: false, message: 'Nothing has been put on the quote yet, so there is nothing to hand over.' }
  }

  /* WHICH ONE THEY BOUGHT, AND WHY IT IS SETTLED HERE.
     The seal comes next, and a seal beats everybody — administrator included.
     So a job sealed with no sold option could never afterwards be given one:
     `hopper_fence_edits` checks the seal FIRST, which means nobody on earth
     could mark the sale and the job would be permanently unbillable. The sale
     is therefore part of the same act as the handoff, not a step somebody can
     forget to do first. One sold option per job is enforced by a partial unique
     index (0133); this is the only place that writes it after the estimate
     screen. */
  const chosen = str(form, 'option_id')
  const sold = (options as any[]).find((o) => (chosen ? o.id === chosen : o.accepted))
  if (!sold) {
    return {
      ok: false,
      message: chosen
        ? 'That option is no longer on this job.'
        : 'Say which option the customer bought. After the seal nobody can, not even an administrator.',
    }
  }
  if (!sold.accepted) {
    const { data: marked, error: saleErr } = await db.schema('hopper').from('fence_option')
      .update({ accepted: true }).eq('account_id', account).eq('id', sold.id)
      .select('id').maybeSingle()
    if (saleErr) return { ok: false, message: refused(saleErr.message, 'quote') }
    if (!marked) {
      return { ok: false, message: 'The estimate is either sealed already or not yours to change.' }
    }
    await db.schema('hopper').from('fence_option')
      .update({ accepted: false }).eq('account_id', account).eq('job_id', job)
      .neq('id', sold.id).eq('accepted', true)
    await db.schema('hopper').from('fence_job').update({
      sold_price: sold.price, sold_spec: sold.spec_code,
      sold_on: new Date().toISOString().slice(0, 10),
    }).eq('account_id', account).eq('id', job)
  }

  // The seal first. If this is refused, the plan must not be kicked off — a job
  // with a project manager's task list and an unsealed estimate is a job where
  // sales can still move the price under somebody.
  const { error: sealed } = await db.schema('hopper').from('fence_seal').upsert({
    account_id: account, job_id: job, section: 'estimate',
    sealed_at: new Date().toISOString(),
    // The unique constraint is (job_id, section) — the account is implied by the
    // job, and naming a column the index does not carry makes the upsert a plain
    // insert that fails the second time.
  }, { onConflict: 'job_id,section' })
  if (sealed) return { ok: false, message: refused(sealed.message, 'estimate') }

  const have = new Set(((already ?? []) as any[]).map((t) => `${t.section}|${t.en}`))
  const today = new Date()
  const rows = ((plan ?? []) as any[])
    .filter((p) => !have.has(`${p.section}|${p.en}`))
    .map((p) => ({
      account_id: account, job_id: job, section: p.section,
      en: p.en, es: p.es, needs: p.needs ?? null,
      due_on: p.due_days == null ? null
        : new Date(today.getTime() + p.due_days * 86_400_000).toISOString().slice(0, 10),
      from_plan: true, sort: p.sort, done: false,
    }))

  if (rows.length) {
    const { error } = await db.schema('hopper').from('fence_task').insert(rows)
    if (error) return { ok: false, message: refused(error.message, 'task plan') }
  }

  await db.schema('hopper').from('fence_job')
    .update({ stage: 'survey', reached: 'survey' })
    .eq('account_id', account).eq('id', job)

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (row as any).ref, object_id: job,
    summary: `Handed ${(row as any).ref} to the project manager`
      + `, sold as ${sold.label} at $${Number(sold.price ?? 0).toLocaleString('en-US')}`
      + `, sealing the estimate and opening ${rows.length} tasks`,
  })
  revalidatePath(`/fence/${job}`); revalidatePath('/fence')
  return {
    ok: true,
    message: rows.length
      ? `Sealed and handed over. ${rows.length} tasks are open, starting with the Navusoft account.`
      : 'Sealed and handed over. The task plan had nothing new to add.',
  }
}

/**
 * Tick a task, or untick it.
 *
 * A task that NEEDS something cannot be ticked until that something exists. The
 * only one so far is the Navusoft account, and it is the one that matters: a
 * checkbox claiming an account was created, with no account number beside it, is
 * a checkbox somebody ticks on the way past — and this one gates billing.
 */
export async function setTaskDone(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  const id = str(form, 'task_id')
  const done = str(form, 'done') === 'true'
  if (!id) return { ok: false, message: 'No task.' }

  const { data: task } = await db.schema('hopper').from('fence_task')
    .select('id, job_id, en, needs').eq('account_id', account).eq('id', id).maybeSingle()
  if (!task) return { ok: false, message: 'That task is not here.' }

  if (done && (task as any).needs === 'navusoft_account') {
    const { data: job } = await db.schema('hopper').from('fence_job')
      .select('location_id').eq('account_id', account).eq('id', (task as any).job_id).maybeSingle()
    const { data: place } = (job as any)?.location_id
      ? await db.schema('hopper').from('fence_location').select('navusoft_account')
          .eq('account_id', account).eq('id', (job as any).location_id).maybeSingle()
      : { data: null }
    if (!String((place as any)?.navusoft_account ?? '').trim()) {
      return {
        ok: false,
        message: 'Put the Navusoft account number in first. This task is that number — '
          + 'ticking it without one is a claim nobody can check.',
      }
    }
  }

  const { data, error } = await db.schema('hopper').from('fence_task')
    .update({
      done,
      done_by: done ? (session?.personId ?? null) : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq('account_id', account).eq('id', id).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'task') }
  if (!data) return { ok: false, message: 'That section is either sealed or not yours to edit.' }

  revalidatePath(`/fence/${(task as any).job_id}`)
  return { ok: true, message: done ? 'Done.' : 'Put back.' }
}

/**
 * The Navusoft account number, against the PLACE rather than the job.
 *
 * It belongs to the address: the same yard billed twice is the same account, and
 * a number typed per job is a number that drifts between two jobs at one site.
 * A job with no location record yet gets one made from the address it was typed
 * with — which is the migration path off the free-text field, done one job at a
 * time by the person who is standing there anyway.
 */
export async function setNavusoftAccount(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const number = str(form, 'navusoft_account')
  if (!job) return { ok: false, message: 'No job.' }

  const { data: row } = await db.schema('hopper').from('fence_job')
    .select('id, ref, customer, site_address, lat, lon, entity_id, location_id')
    .eq('account_id', account).eq('id', job).maybeSingle()
  if (!row) return { ok: false, message: 'That job is not here.' }

  let place = (row as any).location_id as string | null

  if (!place) {
    const line1 = String((row as any).site_address ?? '').trim()
    if (!line1) {
      return { ok: false, message: 'This job has no address yet, and the account number belongs to the address.' }
    }
    // One location per address per account, enforced by a unique index rather
    // than by looking first — two people typing at once is exactly when a
    // look-first check fails.
    const { data: made, error } = await db.schema('hopper').from('fence_location')
      .upsert({
        account_id: account, entity_id: (row as any).entity_id,
        customer: (row as any).customer, line1,
        lat: (row as any).lat, lon: (row as any).lon,
        navusoft_account: number || null,
      }, { onConflict: 'account_id,addr_key' })
      .select('id').maybeSingle()
    if (error) return { ok: false, message: refused(error.message, 'location') }
    place = (made as any)?.id ?? null
    if (place) {
      await db.schema('hopper').from('fence_job')
        .update({ location_id: place }).eq('account_id', account).eq('id', job)
    }
  } else {
    const { error } = await db.schema('hopper').from('fence_location')
      .update({ navusoft_account: number || null })
      .eq('account_id', account).eq('id', place)
    if (error) return { ok: false, message: refused(error.message, 'location') }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (row as any).ref, object_id: job,
    summary: number
      ? `Set the Navusoft account for ${(row as any).site_address ?? 'the site'}`
      : `Cleared the Navusoft account for ${(row as any).site_address ?? 'the site'}`,
  })
  revalidatePath(`/fence/${job}`)
  return {
    ok: true,
    message: number
      ? 'Saved against the address, so every job at this site bills under it.'
      : 'Cleared.',
  }
}

// --------------------------------------------------------- the plan itself
/**
 * A standing step, added to or changed in the plan.
 *
 * Changing the plan changes the NEXT job. Jobs already under way keep the tasks
 * they were handed, because a copy is what they got — which is the whole reason
 * the handoff copies rather than references, and worth repeating here so nobody
 * "fixes" it by joining.
 *
 * Sales' own sections are not offered. The plan is kicked off when sales sends
 * the job forward, so a step in intake or estimate would be a to-do arriving
 * after the work it describes was finished.
 */
export async function setPlanStep(_p: Result | null, form: FormData): Promise<Result> {
  const en = str(form, 'en')
  const es = str(form, 'es')
  const section = str(form, 'section')
  if (!en || !es) {
    return { ok: false, message: 'A step needs both languages — a crew reads the Spanish.' }
  }
  if (!['survey', 'schedule', 'sow', 'ticket', 'closeout', 'billing'].includes(section)) {
    return { ok: false, message: 'The plan starts where sales stops, so a step belongs to a phase after the handoff.' }
  }
  const needs = str(form, 'needs')
  return put('fence_task_plan', nul(form, 'id'), {
    section, en, es,
    needs: needs === 'navusoft_account' ? needs : null,
    due_days: num(form, 'due_days'),
    sort: num(form, 'sort') ?? 0,
    active: on(form, 'active'),
  }, { thing: 'task plan', name: en })
}

// ---------------------------------------------------- the billing handoff
/**
 * Which option the customer bought.
 *
 * Sales' own act, before the seal, and exclusive: accepting one un-accepts the
 * rest, because "we sold two of the three options" is not a thing and a screen
 * that allows it produces a billing sheet nobody can derive. A partial unique
 * index (0133) is the backstop; this is the thing that keeps it satisfied.
 *
 * The job's `sold_price` / `sold_spec` / `sold_on` are written alongside. Those
 * columns have existed since 0110 with nothing writing them, and
 * `fence_revision` was built to compare against them — a revision that cannot
 * say what the price was before it is a revision of nothing.
 */
export async function acceptOption(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'option_id')
  if (!id) return { ok: false, message: 'No option.' }

  const { data: opt } = await db.schema('hopper').from('fence_option')
    .select('id, job_id, label, price, spec_code, accepted')
    .eq('account_id', account).eq('id', id).maybeSingle()
  if (!opt) return { ok: false, message: 'That option is not here.' }
  const job = (opt as any).job_id as string

  // The others first. If this were done the other way round the unique index
  // would refuse the accept, and the message would be about an index rather
  // than about the thing the person did.
  await db.schema('hopper').from('fence_option')
    .update({ accepted: false })
    .eq('account_id', account).eq('job_id', job).eq('accepted', true).neq('id', id)

  const { data, error } = await db.schema('hopper').from('fence_option')
    .update({ accepted: true }).eq('account_id', account).eq('id', id)
    .select('id').maybeSingle()
  if (error) return { ok: false, message: refused(error.message, 'quote') }
  if (!data) {
    return {
      ok: false,
      message: 'Nothing changed. The estimate is sealed, and after the seal nobody can move the sale — '
        + 'not even an administrator. A revision is the way.',
    }
  }

  await db.schema('hopper').from('fence_job').update({
    sold_price: (opt as any).price, sold_spec: (opt as any).spec_code,
    sold_on: new Date().toISOString().slice(0, 10),
  }).eq('account_id', account).eq('id', job)

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (opt as any).label, object_id: job,
    summary: `Marked ${(opt as any).label} as sold at $`
      + `${Number((opt as any).price ?? 0).toLocaleString('en-US')}`,
  })
  revalidatePath(`/fence/${job}/estimate`); revalidatePath(`/fence/${job}`)
  return { ok: true, message: 'Marked as sold. That is the quote billing will bill.' }
}

/**
 * Write the sheet down.
 *
 * It is a roll-up of the sold option's frozen takeoff, worked out again here
 * rather than read off the form — a client that can post amounts is a client
 * that can post whatever it likes, and this is the number that leaves the
 * building.
 *
 * A line somebody corrected by hand, and a line they added, both survive. The
 * derived rows are the ones replaced, and they are recognised by carrying the
 * option they came from. Without that the biller's correction would vanish the
 * next time anybody pressed this button, which reads exactly like a save that
 * did not save.
 */
export async function buildSheet(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  const { data: row } = await db.schema('hopper').from('fence_job')
    .select('id, ref, cls').eq('account_id', account).eq('id', job).maybeSingle()
  if (!row) return { ok: false, message: 'That job is not here.' }

  const b = await loadBilling(account, job)
  if (!b.sold) {
    return { ok: false, message: 'No quote is marked sold, so there is nothing to roll up.' }
  }

  const sheet = buildSheetFrom({
    sold: b.sold, cls: (row as any).cls ?? 'permanent',
    rules: b.rules, codes: b.codes, gateTypes: b.gateTypes,
  })

  // Out with the derived ones. `.select()` so a refusal is a count of nothing
  // rather than a silent success -- an RLS-refused delete matches zero rows and
  // reports no error at all.
  const { error: gone } = await db.schema('hopper').from('fence_charge_line')
    .delete().eq('account_id', account).eq('job_id', job)
    .eq('edited', false).not('option_id', 'is', null).select('id')
  if (gone) return { ok: false, message: refused(gone.message, 'billing sheet') }

  const rows = sheet.lines.map((l, i) => ({
    account_id: account, job_id: job, option_id: b.sold!.id,
    code: l.code, description: l.description,
    qty: l.qty, uom: l.uom, amount: l.amount,
    recurring: l.recurring, note: l.note, edited: false,
    sort: (i + 1) * 10,
  }))

  const { data: made, error } = await db.schema('hopper').from('fence_charge_line')
    .insert(rows).select('id')
  if (error) return { ok: false, message: refused(error.message, 'billing sheet') }
  if (!made?.length) {
    return {
      ok: false,
      message: 'Nothing was written. The billing handoff belongs to billing — '
        + 'you can read every figure on it and add a note.',
    }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (row as any).ref, object_id: job,
    summary: `Built the billing sheet for ${(row as any).ref}: ${made.length} lines`
      + ` at $${sheet.total.toLocaleString('en-US')}`,
    payload: { lines: made.length, total: sheet.total, sold: sheet.sold, tallies: sheet.tallies },
  })
  revalidatePath(`/fence/${job}/billing`)
  return {
    ok: true,
    message: sheet.tallies
      ? `${made.length} lines, $${sheet.total.toLocaleString('en-US')} — the same as the quote.`
      : `${made.length} lines, $${sheet.total.toLocaleString('en-US')}, which is NOT what the quote`
        + ` said ($${sheet.sold.toLocaleString('en-US')}). Do not send it until that is explained.`,
  }
}

/** One line, corrected or added by hand. Marked so a rebuild leaves it alone. */
export async function setChargeLine(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const id = nul(form, 'id')
  const code = str(form, 'code')
  const description = str(form, 'description')
  if (!job) return { ok: false, message: 'No job.' }
  if (!code || !description) {
    return { ok: false, message: 'A line needs a code and something a person can read.' }
  }

  const patch = {
    code, description,
    qty: num(form, 'qty'), uom: nul(form, 'uom'),
    amount: num(form, 'amount'),
    recurring: on(form, 'recurring'),
    note: nul(form, 'note'),
    sort: num(form, 'sort') ?? 500,
    // Touched by a person, so the next rebuild keeps its hands off it.
    edited: true,
  }

  const q = db.schema('hopper').from('fence_charge_line')
  const { data, error } = id
    ? await q.update(patch).eq('account_id', account).eq('id', id).select('id').maybeSingle()
    : await q.insert({ ...patch, account_id: account, job_id: job }).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'billing sheet') }
  if (!data) {
    return {
      ok: false,
      message: id ? 'That line is no longer here. Reload the sheet.'
                  : 'Nothing was written. The billing handoff belongs to billing.',
    }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: code, object_id: job,
    summary: id ? `Corrected the ${code} line by hand` : `Added a ${code} line by hand`,
  })
  revalidatePath(`/fence/${job}/billing`)
  return { ok: true, message: id ? 'Corrected. A rebuild will leave it alone now.' : 'Added.' }
}

export async function dropChargeLine(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const id = str(form, 'id')
  if (!job || !id) return { ok: false, message: 'No line.' }

  const { data, error } = await db.schema('hopper').from('fence_charge_line')
    .delete().eq('account_id', account).eq('id', id).select('code').maybeSingle()
  if (error) return { ok: false, message: refused(error.message, 'billing sheet') }
  if (!data) return { ok: false, message: 'Nothing was removed. That line is gone, or not yours to remove.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (data as any).code, object_id: job,
    summary: `Took the ${(data as any).code} line off the billing sheet`,
  })
  revalidatePath(`/fence/${job}/billing`)
  return { ok: true, message: 'Off the sheet.' }
}

/**
 * Record that the job went to accounting.
 *
 * Hopper does not send this message; a person does, with their own hands, for
 * the reason lib/invite-mail.ts sets out at length — mail an app writes gets
 * eaten by corporate filters and nobody learns there was anything to wait for.
 * So composing and recording are two acts, and this is the second one.
 *
 * THE GATE IS RE-ASKED HERE. The screen draws it, and the screen can be stale,
 * bookmarked or simply wrong. Nothing releases while a change order is unpriced
 * or a punch item is open, and the only copy of that rule that counts is the one
 * the button asks.
 */
export async function recordHandoff(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  const loaded = await loadJob(account, job)
  if (!loaded) return { ok: false, message: 'That job is not here.' }
  const b = await loadBilling(account, job)

  const derived = b.sold
    ? buildSheetFrom({
        sold: b.sold, cls: loaded.job.cls ?? 'permanent',
        rules: b.rules, codes: b.codes, gateTypes: b.gateTypes,
      })
    : null
  const sheet = derived ? mergeSheet(derived, b.savedLines) : null

  const blocked = whatBlocks({
    sold: b.sold, place: loaded.place, tasks: loaded.tasks, sheet,
    openRevisions: b.openRevisions, jobId: job,
  })
  if (blocked.length > 0) {
    return {
      ok: false,
      message: `Not yet — ${blocked[0].what.toLowerCase()}`
        + (blocked.length > 1 ? `, and ${blocked.length - 1} other thing`
            + `${blocked.length > 2 ? 's' : ''} on the list above.` : '.'),
    }
  }
  if (!sheet || b.savedLines.length === 0) {
    return { ok: false, message: 'Write the sheet down first. What has not been saved cannot be recorded as sent.' }
  }

  const navusoft = String(loaded.place?.navusoft_account ?? '').trim() || null
  const note = nul(form, 'note')
  const how = str(form, 'how') === 'mailed' ? 'mailed' : 'copied'

  /* THE LETTER GOES FIRST, AND THAT ORDER IS THE POINT.
     `fence_handoff` is append-only, so a row claiming `how = 'mailed'` can never
     be corrected afterwards. Queue first and the record can only ever overstate
     by a transient database error; record first and every failed queue leaves a
     permanent lie in the job's history.

     The address and the sheet are read by the function, not passed to it. A
     definer that mails whatever text a caller hands it to whatever address a
     caller hands it is a spam relay wearing our return address — so the caller
     names the job, and Beebee looks up where that account's handoffs go. */
  let queued: number | null = null
  if (how === 'mailed') {
    const { data: outbox, error: mailErr } = await db.schema('hopper')
      .rpc('fence_handoff_mail', { job, note })
    if (mailErr) {
      return {
        ok: false,
        message: `Nothing was sent and nothing was recorded. ${refused(mailErr.message, 'billing handoff')}`,
      }
    }
    queued = typeof outbox === 'number' ? outbox : null
  }

  const { data, error } = await db.schema('hopper').from('fence_handoff').insert({
    account_id: account, job_id: job,
    target_id: b.target?.id ?? null,
    navusoft_account: navusoft,
    to_email: b.target?.to_email ?? null,
    how, note,
    sent_by: session?.personId ?? null,
    // Frozen, for the same reason an option freezes its takeoff: the location's
    // number can be corrected next week, and what accounting was told cannot.
    sheet: {
      queued_as: queued,
      sold_option: b.sold?.id ?? null,
      sold_price: sheet.sold,
      total: sheet.total,
      recurring: sheet.recurring,
      lines: sheet.lines.map((l) => ({
        code: l.code, description: l.description, qty: l.qty, uom: l.uom,
        amount: l.amount, recurring: l.recurring, by_hand: l.byHand, edited: l.edited,
      })),
    },
  }).select('id').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'billing handoff') }
  if (!data) {
    return {
      ok: false,
      message: 'Nothing was recorded. The billing handoff belongs to billing — '
        + 'you can read it and note on it.',
    }
  }

  // The cache on the job, written in the same breath as the record it caches.
  // The handoff row is authoritative; this is what the jobs list reads.
  await db.schema('hopper').from('fence_job')
    .update({
      navusoft_sent: navusoft, navusoft_sent_at: new Date().toISOString(),
      stage: 'billing', reached: 'billing',
    })
    .eq('account_id', account).eq('id', job)

  await logAudit(db, {
    account_id: account, kind: 'fence', object: loaded.job.ref, object_id: job,
    summary: `${how === 'mailed' ? 'Sent' : 'Handed'} ${loaded.job.ref} to accounting`
      + ` under Navusoft ${navusoft}`
      + ` — ${sheet.lines.length} lines, $${sheet.total.toLocaleString('en-US')}`,
    payload: { navusoft_account: navusoft, total: sheet.total, how, queued_as: queued },
  })
  revalidatePath(`/fence/${job}/billing`); revalidatePath(`/fence/${job}`); revalidatePath('/fence')
  return {
    ok: true,
    message: how === 'mailed'
      ? `Sent to ${b.target?.to_email ?? 'accounting'} and recorded against Navusoft ${navusoft}.`
        + ' It goes out within the minute; a second send is a second entry rather than an overwrite.'
      : `Recorded against Navusoft ${navusoft}. It is in the job's record now, and a second`
        + ' send is a second entry rather than an overwrite.',
  }
}

// ------------------------------------------------------- opening a job
/**
 * A job, opened.
 *
 * This is the screen the whole module hangs off and it did not exist: the jobs
 * list has linked to /fence/new since the first day and the route was never
 * built, so both buttons went to a 404 and nothing in Fence Builder could be
 * exercised by anybody. Mine, and the lesson is that a link written ahead of its
 * page is a promise with no test behind it.
 *
 * TWO WAYS IN, ONE FORM. A new estimate starts at intake and goes through sales.
 * A work order on an open rental has no sales phase at all — somebody rang and
 * asked for more fence — so it enters at the SURVEY, and the project manager's
 * task plan has to be opened here rather than at the sales handoff, because
 * there will not be one.
 *
 * THE REFERENCE IS TAKEN, NOT GIVEN. Nobody types FB-1043. It is the next number
 * after the highest this person can see, and a collision is retried rather than
 * prevented — two people opening a job in the same second is exactly when a
 * look-first check fails, and the retry is honest about that.
 *
 * THE PIN IS NOT THE ADDRESS. Geocoding can fail — no token, a bad address, a
 * lookup that did not complete — and none of those are reasons to refuse the
 * job. It is opened either way and the screen says why there is no pin yet,
 * because a job you cannot create is worse than a job you cannot draw on.
 */
export async function openJob(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()

  const name = str(form, 'name')
  const entity = str(form, 'entity_id')
  const fromSurvey = str(form, 'from') === 'survey'
  if (!name) return { ok: false, message: 'A job needs a name — what somebody would call it on the phone.' }
  if (!entity) return { ok: false, message: 'Say which organization the job belongs to.' }

  const line1 = str(form, 'line1')
  const place = {
    address_line1: line1 || null,
    city: nul(form, 'city'),
    region: nul(form, 'region'),
    postal_code: nul(form, 'postcode'),
    country: 'United States',
  }
  const siteAddress = line1
    ? [line1, [str(form, 'city'), [str(form, 'region'), str(form, 'postcode')]
        .filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')
    : null

  // The pin, when there is an address to look one up from. A failure is carried
  // in the sentence at the end rather than raised: see the note above.
  let pin: { latitude: number; longitude: number } | null = null
  let noPin: string | null = null
  if (line1) {
    const g = await geocode(place)
    if (g.ok) pin = g.pin
    else noPin = whyNoPin(g)
  }

  const cls = ['permanent', 'temporary', 'secure'].includes(str(form, 'cls'))
    ? str(form, 'cls') : 'permanent'

  // The next number after the highest already here. `ref` is unique per account
  // in practice rather than by constraint, so a clash is caught and retried.
  const { data: highest } = await db.schema('hopper').from('fence_job')
    .select('ref').eq('account_id', account).like('ref', 'FB-%')
    .order('ref', { ascending: false }).limit(1)
  const seen = Number(String((highest as any[])?.[0]?.ref ?? '').replace(/^FB-/, ''))
  let next = Number.isFinite(seen) && seen > 0 ? seen + 1 : 1001

  const base = {
    account_id: account, entity_id: entity,
    name,
    customer: nul(form, 'customer'),
    site_address: siteAddress,
    lat: pin?.latitude ?? null, lon: pin?.longitude ?? null,
    pin_note: nul(form, 'pin_note'),
    cls,
    stage: fromSurvey ? 'survey' : 'intake',
    reached: fromSurvey ? 'survey' : 'intake',
    created_by: session?.personId ?? null,
  }

  let job: { id: string; ref: string } | null = null
  let last = ''
  for (let tries = 0; tries < 5 && !job; tries++, next++) {
    const { data, error } = await db.schema('hopper').from('fence_job')
      .insert({ ...base, ref: `FB-${next}` }).select('id, ref').maybeSingle()
    if (data) { job = data as any; break }
    last = error?.message ?? ''
    if (!/duplicate key|unique/i.test(last)) break
  }

  if (!job) {
    return {
      ok: false,
      message: last
        ? refused(last, 'jobs')
        : 'Nothing was opened. Opening a job needs the fence module on that organization, '
          + 'and a job of your own to own — sales opens an estimate, a project manager opens a work order.',
    }
  }

  /* A work order has no sales phase, so the plan cannot wait for the handoff
     that opens it on an estimate. Refused is survivable — the job exists and the
     tasks can be added by hand — so it is reported rather than rolled back. */
  let opened = 0
  let planWhy: string | null = null
  if (fromSurvey) {
    const { data: plan } = await db.schema('hopper').from('fence_task_plan')
      .select('section, en, es, needs, due_days, sort')
      .eq('account_id', account).eq('active', true).order('sort')
    const today = new Date()
    const rows = ((plan ?? []) as any[]).map((p) => ({
      account_id: account, job_id: job!.id, section: p.section,
      en: p.en, es: p.es, needs: p.needs ?? null,
      due_on: p.due_days == null ? null
        : new Date(today.getTime() + p.due_days * 86_400_000).toISOString().slice(0, 10),
      from_plan: true, sort: p.sort, done: false,
    }))
    if (rows.length) {
      const { data: made, error } = await db.schema('hopper').from('fence_task')
        .insert(rows).select('id')
      opened = made?.length ?? 0
      if (error || !opened) {
        planWhy = 'The job is open, but its task plan is not — opening the standing plan needs '
          + 'the same right as sealing an estimate. Ask an administrator, or add the steps by hand.'
      }
    }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: job.ref, object_id: job.id,
    summary: `Opened ${job.ref} — ${name}`
      + (fromSurvey ? `, a work order entering at the survey with ${opened} tasks` : ' at intake'),
    payload: { ref: job.ref, cls, from: fromSurvey ? 'survey' : 'intake', pinned: !!pin },
  })
  revalidatePath('/fence')
  redirect(`/fence/${job.id}`)
}

/**
 * Where the work happens, corrected.
 *
 * The estimator sends people here — "the job is where the address and the pin
 * are set" — and there was nowhere to go. The pin is looked up again every time
 * the address changes, because a pin that outlives the address it came from is
 * the worst kind: it points somewhere confidently.
 */
export async function setJobPlace(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const line1 = str(form, 'line1')
  if (!job) return { ok: false, message: 'No job.' }
  if (!line1) return { ok: false, message: 'A site needs a street address — that is what the aerial is found from.' }

  const g = await geocode({
    address_line1: line1,
    city: nul(form, 'city'), region: nul(form, 'region'),
    postal_code: nul(form, 'postcode'), country: 'United States',
  })
  const siteAddress = [line1, [str(form, 'city'), [str(form, 'region'), str(form, 'postcode')]
    .filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')

  const { data, error } = await db.schema('hopper').from('fence_job')
    .update({
      site_address: siteAddress,
      // A failed lookup leaves the old pin alone rather than clearing it: the
      // address may have been mistyped, and the pin that was right yesterday is
      // better than none while somebody fixes it.
      ...(g.ok ? { lat: g.pin.latitude, lon: g.pin.longitude } : {}),
      pin_note: nul(form, 'pin_note'),
    })
    .eq('account_id', account).eq('id', job).select('id, ref').maybeSingle()

  if (error) return { ok: false, message: refused(error.message, 'job') }
  if (!data) {
    return {
      ok: false,
      message: 'Nothing changed. The address belongs to intake and the survey — sales sets it, '
        + 'the project manager corrects it at the walk, and a sealed estimate is nobody’s to move.',
    }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (data as any).ref, object_id: job,
    summary: `Set the site address on ${(data as any).ref} to ${siteAddress}`,
  })
  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/estimate`)
  return {
    ok: true,
    message: g.ok
      ? 'Saved, and the pin moved with it. The estimator can draw on the aerial now.'
      : `Saved, but there is still no pin: ${whyNoPin(g)}`,
  }
}

/**
 * The first draft, written on the way in.
 *
 * Ryan's call, 14 Sep: a project manager opening a scope that has never been
 * written should find words in the boxes, not four buttons and a paragraph
 * about which one to press. So the screen asks for this once, on mount, and
 * then gets out of the way -- every word is still theirs to change.
 *
 * It runs ONCE PER JOB and the guard is the row, not the screen: drafted_at is
 * set by the first write, so a second open, a refresh, or two people opening it
 * at the same moment all find it already drafted and spend nothing. English
 * first, because the Spanish is written from the English.
 */
export async function autoDraftSow(jobId: string): Promise<Result> {
  const { db, account } = await ctx()
  if (!jobId) return { ok: false, message: 'No job.' }

  const { data: had } = await db.schema('hopper').from('fence_sow')
    .select('drafted_at').eq('account_id', account).eq('job_id', jobId).maybeSingle()
  if ((had as any)?.drafted_at) return { ok: true, message: 'Already drafted.' }

  const one = (lang: 'en' | 'es') => {
    const f = new FormData()
    f.set('job_id', jobId)
    f.set('lang', lang)
    return aiReady() ? aiDraftSow(null, f) : draftSow(null, f)
  }

  const en = await one('en')
  if (!en.ok) return en
  const es = await one('es')
  if (!es.ok) return es
  return { ok: true, message: 'Drafted in both languages.' }
}

/**
 * The project manager's message to accounting.
 *
 * Ryan's call, 14 Sep: the person who ran the job is the one who knows what
 * accounting needs telling -- two gates went in instead of one, the customer
 * wants it split -- and by the time the sheet reaches billing that person is
 * gone. So they write it at close-out, on the job, in the section they own.
 *
 * It is a NOTE ON THE JOB, not a field on the handoff: it belongs to the record
 * whether or not anything is ever mailed, and the billing screen offers it as
 * the letter's opening rather than sending it behind anybody's back.
 */
export async function noteForBilling(_p: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }
  const db = supabaseServer()

  const job = str(form, 'job_id')
  const body = str(form, 'body').slice(0, 4000)
  if (!job) return { ok: false, message: 'No job.' }
  if (!body) return { ok: false, message: 'Nothing typed, so nothing was saved.' }

  /* LOCKED ONCE SENT. Ryan's call: a note that changes after the letter has
     gone is a note that no longer matches what accounting is holding, and the
     handoff row is append-only precisely so nobody can quietly restate it.
     Until then it is theirs to correct -- one note, edited, not a pile. */
  const { data: sent } = await db.schema('hopper').from('fence_handoff')
    .select('id').eq('account_id', session.accountId).eq('job_id', job).limit(1)
  if ((sent ?? []).length > 0) {
    return {
      ok: false,
      message: 'This one has gone to accounting already, so the note is closed. '
        + 'Anything new goes in the next letter.',
    }
  }

  const { data: mine } = await db.schema('hopper').from('fence_note')
    .select('id').eq('account_id', session.accountId).eq('job_id', job)
    .eq('section', 'billing').eq('author_id', session.personId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = mine?.id
    ? await db.schema('hopper').from('fence_note')
        .update({ body }).eq('account_id', session.accountId).eq('id', mine.id)
        .select('id').maybeSingle()
    : await db.schema('hopper').from('fence_note')
        .insert({
          account_id: session.accountId, job_id: job, section: 'billing',
          kind: 'note', body, author_id: session.personId,
        })
        .select('id').maybeSingle()

  // An RLS-refused update matches nothing rather than raising, so an empty
  // result is a refusal and not a shrug.
  if (error || !data) {
    return { ok: false, message: 'That did not save. The note has to be yours to write.' }
  }

  await logAudit(db, {
    account_id: session.accountId, kind: 'fence', object: 'Note for accounting',
    object_id: job, summary: 'Left a note for accounting on the job',
  })
  revalidatePath(`/fence/${job}`)
  revalidatePath(`/fence/${job}/billing`)
  return { ok: true, message: 'Saved. Billing sees it on the handoff.' }
}

/**
 * Send an estimate to the customer to sign.
 *
 * Issues one link against ONE option, because a customer signs a price rather
 * than a folder. Hopper composes it and a person sends it, the same way the
 * billing letter works: mail an app writes gets eaten by corporate filters, and
 * the salesperson is talking to this customer anyway.
 *
 * A THIN QUOTE CANNOT BE SENT. Under the margin floor and not released is a
 * price nobody senior has agreed to yet, and a signature on it is binding in a
 * way a screen warning is not. The estimator sees the same rule at the seal;
 * this is the earlier door onto the same room.
 */
export async function sendForSignature(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  const job = str(form, 'job_id')
  const optionId = str(form, 'option_id')
  if (!job || !optionId) return { ok: false, message: 'No option.' }

  const [{ data: opt }, { data: rel }, { data: settings }] = await Promise.all([
    db.schema('hopper').from('fence_option').select('id, label, price, takeoff')
      .eq('account_id', account).eq('job_id', job).eq('id', optionId).maybeSingle(),
    db.schema('hopper').from('fence_option_release').select('option_id')
      .eq('account_id', account).eq('option_id', optionId).maybeSingle(),
    db.schema('hopper').from('fence_settings').select('estimate_days')
      .eq('account_id', account).maybeSingle(),
  ])
  if (!opt) return { ok: false, message: 'That option is not on this job.' }
  if ((opt as any).takeoff?.below_floor && !rel) {
    return {
      ok: false,
      message: 'This one is under the margin floor and has not been released. '
        + 'A signature on it binds the company to a price nobody senior has agreed to.',
    }
  }
  if (!Number((opt as any).price)) {
    return { ok: false, message: 'That option has no price on it, so there is nothing to sign.' }
  }

  const days = Number((settings as any)?.estimate_days ?? 30)
  const expires = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

  // Any older link on this job stops working. Two live links on one job is two
  // prices a customer could sign, and the second one arriving is exactly how a
  // superseded quote gets signed.
  await db.schema('hopper').from('fence_quote_link')
    .update({ revoked: true })
    .eq('account_id', account).eq('job_id', job).eq('revoked', false).is('signed_at', null)

  const { data, error } = await db.schema('hopper').from('fence_quote_link')
    .insert({
      account_id: account, job_id: job, option_id: optionId,
      issued_by: session?.personId ?? null, expires_on: expires,
    })
    .select('token').maybeSingle()
  if (error) return { ok: false, message: refused(error.message, 'estimate') }
  if (!data) {
    return { ok: false, message: 'Nothing was issued. The estimate is either sealed or not yours.' }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (opt as any).label, object_id: job,
    summary: `Sent ${(opt as any).label} out for signature at `
      + `$${Number((opt as any).price ?? 0).toLocaleString('en-US')}`,
  })
  revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: `Link ready, good for ${days} days. Copy it and send it.` }
}

/** Stop a link working. An unsigned estimate somebody has changed their mind
 *  about, or a link sent to the wrong address. A signed one stays open: the
 *  person who signed it should be able to read what they signed. */
export async function revokeQuoteLink(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'link_id')
  const job = str(form, 'job_id')
  if (!id) return { ok: false, message: 'No link.' }

  const { data, error } = await db.schema('hopper').from('fence_quote_link')
    .update({ revoked: true })
    .eq('account_id', account).eq('id', id).is('signed_at', null)
    .select('id').maybeSingle()
  if (error) return { ok: false, message: refused(error.message, 'estimate') }
  if (!data) {
    return { ok: false, message: 'That link is already signed or already off.' }
  }
  revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: 'That link no longer opens.' }
}

/**
 * Put somebody on the estimate.
 *
 * One action, two doors: pick a contact who is already in the book, or type a
 * new one and have them attached in the same act. Ryan's call, 14 Sep -- the
 * salesperson adds the contact, and contacts are reusable, which is the whole
 * reason they are account-wide rather than a few more columns on the job.
 *
 * AN ADDRESS ALREADY IN THE BOOK IS THE SAME PERSON. A partial unique index on
 * (account, lower(email)) says so, so typing a contact who exists updates the
 * one that is there rather than making a second Dana Whitfield with the same
 * inbox -- which is how a list of contacts becomes a list of guesses.
 */
export async function setJobContact(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  const job = str(form, 'job_id')
  if (!job) return { ok: false, message: 'No job.' }

  let id = str(form, 'contact_id') || null
  const name = str(form, 'full_name')

  if (name) {
    const email = str(form, 'email').toLowerCase() || null
    const row = {
      account_id: account, full_name: name.slice(0, 120),
      title: nul(form, 'title'), email,
      phone: nul(form, 'phone'), company: nul(form, 'company'),
      created_by: session?.personId ?? null, active: true,
    }

    // Same address, same person. Without this the second estimate to somebody
    // whose name was typed slightly differently makes a second contact, and the
    // picker fills up with people who are one person.
    const { data: had } = email
      ? await db.schema('hopper').from('fence_contact').select('id')
          .eq('account_id', account).ilike('email', email).maybeSingle()
      : { data: null }

    const { data, error } = (had as any)?.id
      ? await db.schema('hopper').from('fence_contact')
          .update({ full_name: row.full_name, title: row.title, phone: row.phone,
                    company: row.company, active: true })
          .eq('account_id', account).eq('id', (had as any).id).select('id').maybeSingle()
      : await db.schema('hopper').from('fence_contact')
          .insert(row).select('id').maybeSingle()
    if (error) return { ok: false, message: refused(error.message, 'contacts') }
    if (!data) return { ok: false, message: 'That contact did not save.' }
    id = (data as any).id
  }

  if (!id) return { ok: false, message: 'Pick somebody, or type a new one.' }

  const { data: put, error: putErr } = await db.schema('hopper').from('fence_job')
    .update({ contact_id: id }).eq('account_id', account).eq('id', job)
    .select('id').maybeSingle()
  if (putErr) return { ok: false, message: refused(putErr.message, 'job') }
  if (!put) return { ok: false, message: 'That job is not yours to change.' }

  revalidatePath(`/fence/${job}/estimate`)
  revalidatePath(`/fence/${job}`)
  return { ok: true, message: name ? `${name} is on the estimate.` : 'Contact set.' }
}
