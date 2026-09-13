'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

/**
 * Fence Builder's reference data, as writes.
 *
 * Same rule as everywhere else in Hopper: every write goes through the
 * signed-in person's own session, so `internal.hopper_may_manage` is what
 * permits or refuses it. Nothing here re-checks permission in JavaScript. A
 * second copy of "who may do this" is a second place to be wrong, and only one
 * of them is the copy the database believes.
 *
 * The rate book is the one worth a word of warning: `cost` and `markup` are
 * revoked at the column level for people who do not price work, so a form that
 * posts them from somebody who cannot read them will be refused by the
 * database rather than quietly writing a figure over one they never saw. The
 * screen does not draw those fields in that case, and this is the backstop.
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
  const cost = num(form, 'cost'), markup = num(form, 'markup')
  if (cost !== null) patch.cost = cost
  if (markup !== null) patch.markup = markup

  return put('fence_rate', id, patch,
    { thing: 'rate book', name: code, also: ['/fence/rates'] })
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

  const patch: Record<string, unknown> = {
    account_id: account, margin_floor: floor, waste_pct: waste,
    link_expires: on(form, 'link_expires'), updated_at: new Date().toISOString(),
  }
  // Absent, not blank: somebody who cannot read what an hour costs us posts a
  // form without those two fields, and must not blank them by saving the rest.
  const rate = num(form, 'crew_rate'), markup = num(form, 'labor_markup')
  if (rate !== null) patch.crew_rate = rate
  if (markup !== null) patch.labor_markup = markup

  const { error } = await db.schema('hopper').from('fence_settings')
    .upsert(patch, { onConflict: 'account_id' })
  if (error) return { ok: false, message: refused(error.message, 'pricing settings') }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: 'Pricing settings',
    summary: `Set the margin floor to ${floor}% and waste to ${waste}%`,
    payload: { margin_floor: floor, waste_pct: waste, link_expires: on(form, 'link_expires') },
  })
  revalidatePath('/admin/fence')
  return { ok: true, message: 'Pricing settings saved.' }
}
