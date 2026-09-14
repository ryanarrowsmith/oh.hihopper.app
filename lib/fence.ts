import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

/* ==========================================================================
   Fence Builder — the data side.

   Nothing in this file decides whether somebody may SEE a row. The policies on
   the fifteen fence_ tables do that, and a second copy of that rule here is a
   second place to be wrong. What this file does decide is what to RENDER: a
   section you do not own is drawn read-only with a note composer, and that
   needs the ownership map in TypeScript as well as in SQL.

   The two copies are deliberate and unequal. `internal.hopper_fence_owner` is
   the authority — if this map drifted, the screen would offer an edit the
   database then refused, which is ugly but not a hole. OWNS below is checked
   against the function by hand whenever either changes.
   ========================================================================== */

export type Section =
  | 'intake' | 'estimate' | 'survey' | 'schedule'
  | 'sow' | 'ticket' | 'closeout' | 'billing'

export type JobRole = 'sales' | 'pm' | 'field' | 'billing'

/** The order the work runs in. Also the order the job page draws them. */
export const SECTIONS: { key: Section; en: string; owner: JobRole }[] = [
  { key: 'intake',   en: 'Intake',           owner: 'sales' },
  { key: 'estimate', en: 'Estimate',         owner: 'sales' },
  { key: 'survey',   en: 'Site survey',      owner: 'pm' },
  { key: 'schedule', en: 'Schedule',         owner: 'pm' },
  { key: 'sow',      en: 'Scope of work',    owner: 'pm' },
  { key: 'ticket',   en: 'Crew ticket',      owner: 'field' },
  { key: 'closeout', en: 'Close-out',        owner: 'pm' },
  { key: 'billing',  en: 'Billing handoff',  owner: 'billing' },
]

/**
 * The tabs the job page groups those sections under: one per job, in the order
 * the work reaches them.
 *
 * This replaced five PHASES, and the two lists are not the same. A phase
 * answered "where is this job". A tab answers "whose desk is it on", which is
 * the question somebody opening the page is actually asking — and it is the
 * question the mark on every section was already answering one at a time.
 *
 * The one thing it rearranges is close-out. It has been the project manager's
 * in SECTIONS since 0109 — walking the finished fence, the QA inspection,
 * getting the customer to say they are happy are not the crew's and not
 * billing's — but the phase list gave it a band of its own between them. By
 * owner it sits with the survey and the scope, with the crew's build happening
 * in the gap. Ryan, 14 Sep: yes, close-out can be the project manager's.
 */
export const OWNERS: JobRole[] = ['sales', 'pm', 'field', 'billing']

export function sectionsOwnedBy(role: JobRole): Section[] {
  return SECTIONS.filter((s) => s.owner === role).map((s) => s.key)
}

export const ROLE_WORD: Record<JobRole, string> = {
  sales: 'Sales', pm: 'Project manager', field: 'Field crew', billing: 'Billing',
}

export type Job = {
  id: string
  ref: string
  name: string
  customer: string | null
  site_address: string | null
  /** The map pin, looked up from the address. Null until one resolves. */
  lat: number | null
  lon: number | null
  cls: 'permanent' | 'temporary' | 'secure' | null
  stage: Section
  /** The furthest phase this job has reached. Not a time. */
  reached: Section
  crew: string | null
  starts_on: string | null
  complete: boolean
  created_at: string
}

export type Location = {
  id: string; name: string | null; customer: string | null
  line1: string; line2: string | null; city: string | null; region: string | null
  postcode: string | null; lat: number | null; lon: number | null
  navusoft_account: string | null; note: string | null
}

export type Task = {
  /** What has to exist before it may be called done. Null on most of them. */
  needs?: string | null
  id: string
  section: Section
  en: string
  es: string | null
  due_on: string | null
  done: boolean
  from_plan: boolean
  /** Who ticked it and when. The billing handoff has no project-manager column
   *  to read, so the first survey step ticked is who picked the job up. */
  done_by?: string | null
  done_at?: string | null
}

export type Seal = { section: Section; sealed_at: string }

/** What this person is on a fence crew, and nothing else. */
export async function fenceStance(accountId: string) {
  const db = supabaseServer()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return { jobRole: null as JobRole | null, personId: null as string | null }

  const { data: person } = await db.schema('hopper')
    .from('person').select('id')
    .eq('account_id', accountId).eq('profile_id', user.id).maybeSingle()
  if (!person) return { jobRole: null, personId: null }

  const { data: fp } = await db.schema('hopper')
    .from('fence_person').select('job_role')
    .eq('account_id', accountId).eq('person_id', person.id).maybeSingle()

  return { jobRole: (fp?.job_role ?? null) as JobRole | null, personId: person.id }
}

/**
 * How a section should be drawn for this person.
 *
 * The same three tests `internal.hopper_fence_edits` makes, in the same order,
 * because a screen that draws a pencil the database refuses is worse than no
 * pencil — and one that refuses to draw a pencil the database would have allowed
 * is a person filing a bug about a feature that works.
 *
 * The seal is first, and it beats everything: nothing changes a sealed section,
 * administrator included. Then the section's owner. Then whoever administers the
 * account, which is what was missing here — it left an account owner reading
 * their own module, because they hold no fence job and the helper never asked.
 */
export function howToDraw(
  section: Section, jobRole: JobRole | null, sealed: Set<Section>,
  mayManage = false,
): 'edit' | 'read' | 'sealed' {
  if (sealed.has(section)) return 'sealed'
  const owner = SECTIONS.find((s) => s.key === section)?.owner
  if (owner && owner === jobRole) return 'edit'
  return mayManage ? 'edit' : 'read'
}

/**
 * The open jobs, newest first. Complete ones are hidden.
 *
 * The error comes back rather than being swallowed into an empty array. This
 * screen said "No jobs yet" for ten minutes while the query was failing — a
 * column had been renamed in the database before the code that reads it was
 * deployed — and an empty list is the one answer that looks like everything is
 * fine. A screen that cannot tell "nothing here" from "I could not ask" will
 * always report the reassuring one.
 */
export async function loadJobs(accountId: string, complete = false) {
  const db = supabaseServer()
  const { data, error } = await db.schema('hopper')
    .from('fence_job')
    .select('id, ref, name, customer, site_address, lat, lon, cls, stage, reached, crew, starts_on, complete, created_at')
    .eq('account_id', accountId)
    .eq('complete', complete)
    .order('created_at', { ascending: false })
  return { jobs: (data ?? []) as Job[], error: error?.message ?? null }
}

export async function countComplete(accountId: string) {
  const db = supabaseServer()
  const { count } = await db.schema('hopper')
    .from('fence_job').select('id', { count: 'exact', head: true })
    .eq('account_id', accountId).eq('complete', true)
  return count ?? 0
}

export async function loadJob(accountId: string, id: string) {
  const db = supabaseServer()
  const { data: job } = await db.schema('hopper')
    .from('fence_job')
    .select('id, ref, name, customer, site_address, lat, lon, cls, stage, reached, crew,'
      + ' starts_on, complete, created_at, location_id, navusoft_sent, navusoft_sent_at')
    .eq('account_id', accountId).eq('id', id).maybeSingle()
  if (!job) return null

  const [{ data: tasks }, { data: seals }, { data: place }] = await Promise.all([
    db.schema('hopper').from('fence_task')
      .select('id, section, en, es, due_on, done, from_plan, needs, done_by, done_at')
      .eq('job_id', id).order('due_on', { ascending: true }).order('sort', { ascending: true }),
    db.schema('hopper').from('fence_seal')
      .select('section, sealed_at').eq('job_id', id),
    // Where the work happens, and what it bills under. A job with no location
    // record yet falls back to its own typed address.
    (job as any).location_id
      ? db.schema('hopper').from('fence_location')
          .select('id, name, customer, line1, line2, city, region, postcode, lat, lon,'
            + ' navusoft_account, note')
          .eq('account_id', accountId).eq('id', (job as any).location_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    job: job as unknown as Job,
    tasks: (tasks ?? []) as Task[],
    seals: (seals ?? []) as Seal[],
    place: (place ?? null) as unknown as Location | null,
  }
}

/** Days a job has sat where it is. What turns a list into a worklist. */
export function daysIn(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

/* ==========================================================================
   THE RATE BOOK
   ========================================================================== */

export type Rate = {
  id: string; code: string; kind: string; grp: string | null
  cls: 'permanent' | 'temporary' | 'secure' | null
  name_en: string; name_es: string | null; uom: string
  sell: number | null; verified_on: string | null; source: string | null
  active: boolean
  cost?: number | null; markup?: number | null
}

export const RATE_KINDS = [
  { key: 'material',  en: 'Materials' },
  { key: 'labor',     en: 'Labor' },
  { key: 'equipment', en: 'Equipment' },
  { key: 'rental',    en: 'Rental' },
  { key: 'fleet',     en: 'Fleet' },
] as const

/**
 * The book, and what it costs us when that is somebody's business.
 *
 * Cost and markup live in `hopper.fence_rate_cost`, a table with its own policy,
 * because "may this person see cost" is a question about a PERSON and row
 * security is the only thing here that can answer it. 0110 tried to answer it
 * with a column grant and hid the figures from everybody, the account owner
 * included -- a grant is per role, and every signed-in person in this app is the
 * same role. See 0120.
 *
 * So there is no privileged-select-and-fall-back any more. The costs are read;
 * a person who may not see them reads NO ROWS, which is the policy speaking
 * rather than an error to catch. `sell` sits on the rate itself and is readable
 * by anybody who can see the book at all.
 */
/** May this person change the lists, see the book at all, and see what it costs
 *  us. All three come from hopper.fence_rights(), which asks the same helpers
 *  the policies ask, so no screen can offer what the database refuses. */
export type Rights = {
  mayManage: boolean; mayReadBook: boolean; mayReadCosts: boolean; mayRelease: boolean
}

export async function loadRights(accountId: string): Promise<Rights> {
  const { data } = await supabaseServer().schema('hopper')
    .rpc('fence_rights', { acct: accountId }).maybeSingle()
  const r: any = data
  return {
    mayManage: !!r?.may_manage,
    mayReadBook: !!r?.may_read_book,
    mayReadCosts: !!r?.may_read_costs,
    mayRelease: !!r?.may_release,
  }
}

export async function loadRates(accountId: string, retired = false) {
  const db = supabaseServer()
  const only = (q: any) => (retired ? q : q.eq('active', true))

  const [book, costs, rights] = await Promise.all([
    only(db.schema('hopper').from('fence_rate')
      .select('id, code, kind, grp, cls, name_en, name_es, uom, sell, verified_on, source, active')
      .eq('account_id', accountId))
      .order('active', { ascending: false }).order('kind').order('code'),
    db.schema('hopper').from('fence_rate_cost')
      .select('rate_id, cost, markup').eq('account_id', accountId),
    // Asked rather than inferred from an empty read: a cost-reader looking at a
    // book with no figures in it yet must still be offered the cost field.
    loadRights(accountId),
  ])

  const cost = new Map(((costs.data ?? []) as any[]).map((c) => [c.rate_id, c]))
  const rates = ((book.data ?? []) as any[]).map((r) => ({
    ...r,
    cost: cost.get(r.id) ? Number(cost.get(r.id).cost) : null,
    markup: cost.get(r.id) ? Number(cost.get(r.id).markup) : null,
  })) as Rate[]

  return { rates, seesCost: rights.mayReadCosts, rights }
}

/** A figure with no verified date has never been checked against an invoice. */
export function rateAge(verified_on: string | null): number | null {
  if (!verified_on) return null
  return Math.floor((Date.now() - new Date(verified_on).getTime()) / 86_400_000)
}

/* ==========================================================================
   WHERE A JOB CAN BE OPENED

   A job belongs to an organization in the portfolio, and `fence_job.entity_id`
   is NOT NULL — so the screen that opens one has to ask which, and must only
   offer the organizations this person actually holds the module on at edit
   level. `hopper.my_module_levels` answers that; it is INVOKER and asks the same
   helpers the policies ask, so no screen can offer what the database refuses.
   ========================================================================== */

export type FenceEntity = { id: string; name: string; level: string }

export async function loadFenceEntities(accountId: string): Promise<FenceEntity[]> {
  const { data } = await supabaseServer().schema('hopper')
    .rpc('my_module_levels', { acct: accountId })
  return ((data ?? []) as any[])
    .filter((r) => r.module === 'fence' && (r.level === 'edit' || r.level === 'admin'))
    .map((r) => ({ id: r.entity_id, name: r.entity_name, level: r.level }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
