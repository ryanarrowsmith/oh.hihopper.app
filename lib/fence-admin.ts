import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { SECTIONS, type JobRole } from '@/lib/fence'
import type { Lang } from '@/lib/i18n'

/**
 * Every list the module runs on.
 *
 * One loader, because the admin panel is one page: seven sections of the same
 * account's reference data, read together in one round trip rather than seven.
 *
 * Two of these tables have columns this person may not be allowed to read --
 * `fence_settings.crew_rate` and `.labor_markup` are what an hour costs us and
 * what we multiply it by, which together are a cost. PostgREST fails the WHOLE
 * query when you name a column you may not read, so the privileged select is
 * tried and a refusal falls back to the narrow one, exactly as the rate book
 * does. Asking "may I?" separately would be a second answer to a question the
 * database already answers, and the two would drift.
 */

export type FencePerson = {
  id: string
  person_id: string
  job_role: JobRole
  name: string
  email: string | null
  title: string | null
  lang: Lang
  edits: string
}

export type Spec = {
  id: string; code: string; cls: string; name_en: string; name_es: string | null
  height_ft: number | null; spacing_ft: number | null; note: string | null; active: boolean
}

export type GateType = {
  id: string; code: string; cls: string; name_en: string; name_es: string | null
  width_ft: number | null; rate_code: string | null; active: boolean
}

export type Term = {
  id: string; en: string; es: string; note: string | null
  /** Whether the phrase appears in a scope of work that has actually been
   *  written. A term nobody uses is a term nobody has checked. */
  inUse: boolean
}

export type Crew = {
  id: string; name: string; foreman_id: string | null; foreman: string | null
  lang: Lang; badged: boolean; size: number | null; active: boolean
}

export type ChargeCode = {
  id: string; code: string; description: string; recurring: boolean
  cycle_days: number | null; note: string | null; provisional: boolean
  target_id: string | null; sort: number; active: boolean
}

export type Target = {
  id: string; name: string; to_email: string | null
  instructions: string | null; active: boolean
}

export type Settings = {
  margin_floor: number
  waste_pct: number
  link_expires: boolean
  /** Null when this person may not read what labor costs us. */
  crew_rate: number | null
  labor_markup: number | null
}

/** The row, and whether the two cost figures on it were readable. Those are
 *  separate questions: an account with no settings row yet answers "no row",
 *  which must not be mistaken for "you may not see costs". */
export type SettingsRead = { row: Settings | null; seesCost: boolean }

/** May this person change these lists, and may they see the book at all. Both
 *  answers come from hopper.fence_rights(), which calls the same two helpers
 *  the policies call -- so a screen cannot offer an edit the database refuses,
 *  and there is no second copy of the rule to drift. */
export type Rights = { mayManage: boolean; mayReadBook: boolean }

export async function loadRights(accountId: string): Promise<Rights> {
  const { data } = await supabaseServer().schema('hopper')
    .rpc('fence_rights', { acct: accountId }).maybeSingle()
  const r: any = data
  return { mayManage: !!r?.may_manage, mayReadBook: !!r?.may_read_book }
}

/** What a job of this name may change, in the words the job screen uses. */
export function editsFor(role: JobRole): string {
  const own = SECTIONS.filter((s) => s.owner === role).map((s) => s.en)
  return own.length ? own.join(', ') : 'Nothing — reads and notes only'
}

export async function loadFenceAdmin(accountId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const [fp, roster, specs, gates, terms, crews, codes, targets, sows, settings, rights] =
    await Promise.all([
      h().from('fence_person').select('id, person_id, job_role').eq('account_id', accountId),
      h().from('person').select('id, full_name, email, role_title, lang, active')
        .eq('account_id', accountId).order('full_name'),
      h().from('fence_spec')
        .select('id, code, cls, name_en, name_es, height_ft, spacing_ft, note, active')
        .eq('account_id', accountId).order('cls').order('code'),
      h().from('fence_gate_type')
        .select('id, code, cls, name_en, name_es, width_ft, rate_code, active')
        .eq('account_id', accountId).order('width_ft'),
      h().from('fence_glossary').select('id, en, es, note')
        .eq('account_id', accountId).order('en'),
      h().from('fence_crew').select('id, name, foreman_id, lang, badged, size, active')
        .eq('account_id', accountId).order('name'),
      h().from('fence_charge_code')
        .select('id, code, description, recurring, cycle_days, note, provisional, target_id, sort, active')
        .eq('account_id', accountId).order('sort').order('code'),
      h().from('fence_billing_target').select('id, name, to_email, instructions, active')
        .eq('account_id', accountId).order('name'),
      // Only enough of the scope of work to answer "is this word in use".
      h().from('fence_sow').select('body_en, body_es').eq('account_id', accountId),
      loadSettings(accountId),
      loadRights(accountId),
    ])

  const names = new Map(((roster.data ?? []) as any[]).map((p) => [p.id, p]))
  const people: FencePerson[] = ((fp.data ?? []) as any[]).map((r) => {
    const p: any = names.get(r.person_id)
    return {
      id: r.id, person_id: r.person_id, job_role: r.job_role as JobRole,
      name: p?.full_name ?? 'Somebody no longer on the roster',
      email: p?.email ?? null, title: p?.role_title ?? null,
      lang: (p?.lang === 'es' ? 'es' : 'en') as Lang,
      edits: editsFor(r.job_role as JobRole),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const taken = new Set(people.map((p) => p.person_id))
  const spare = ((roster.data ?? []) as any[])
    .filter((p) => p.active && !taken.has(p.id))
    .map((p) => ({ id: p.id, name: p.full_name as string }))

  const written = ((sows.data ?? []) as any[])
    .map((s) => `${s.body_en ?? ''}\n${s.body_es ?? ''}`.toLowerCase()).join('\n')
  const glossary: Term[] = ((terms.data ?? []) as any[]).map((t) => ({
    id: t.id, en: t.en, es: t.es, note: t.note,
    inUse: written.includes(t.en.toLowerCase()) || written.includes(t.es.toLowerCase()),
  }))

  const crewRows: Crew[] = ((crews.data ?? []) as any[]).map((c) => ({
    id: c.id, name: c.name, foreman_id: c.foreman_id,
    foreman: c.foreman_id ? (names.get(c.foreman_id) as any)?.full_name ?? null : null,
    lang: (c.lang === 'en' ? 'en' : 'es') as Lang,
    badged: c.badged, size: c.size, active: c.active,
  }))

  return {
    people, spare,
    specs: (specs.data ?? []) as Spec[],
    gates: (gates.data ?? []) as GateType[],
    glossary,
    crews: crewRows,
    codes: (codes.data ?? []) as ChargeCode[],
    targets: (targets.data ?? []) as Target[],
    settings, rights,
  }
}

/** The pricing floor, and the cost figures only some people may read. */
export async function loadSettings(accountId: string): Promise<SettingsRead> {
  const db = supabaseServer()
  const base = 'margin_floor, waste_pct, link_expires'

  const priv = await db.schema('hopper').from('fence_settings')
    .select(`${base}, crew_rate, labor_markup`).eq('account_id', accountId).maybeSingle()
  if (!priv.error) {
    const r: any = priv.data
    return {
      seesCost: true,
      row: r ? {
        margin_floor: Number(r.margin_floor), waste_pct: Number(r.waste_pct),
        link_expires: r.link_expires,
        crew_rate: Number(r.crew_rate), labor_markup: Number(r.labor_markup),
      } : null,
    }
  }

  const plain = await db.schema('hopper').from('fence_settings')
    .select(base).eq('account_id', accountId).maybeSingle()
  const r: any = plain.data
  return {
    seesCost: false,
    row: r ? {
      margin_floor: Number(r.margin_floor), waste_pct: Number(r.waste_pct),
      link_expires: r.link_expires, crew_rate: null, labor_markup: null,
    } : null,
  }
}
