import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

/* ==========================================================================
   Staffing — the line of report is the permission.

   Nothing in this file checks whether somebody may see a row. The policies on
   the four staff_ tables do that, and hopper.person now admits your own line,
   so a plain select returns exactly the people you are allowed to have opinions
   about. A second copy of that rule here is a second place to be wrong.
   ========================================================================== */

/** Four measures, settled long before this build. */
export const MEASURES = [
  { key: 'caring',        label: 'Caring Culture' },
  { key: 'communication', label: 'Communication' },
  { key: 'reliability',   label: 'Reliability' },
  { key: 'job_knowledge', label: 'Job Knowledge' },
] as const
export type MeasureKey = (typeof MEASURES)[number]['key']

/** Exceeds 3, Meets 2, Below 1. Twelve is the ceiling. */
export const STEPS = [
  { n: 3, word: 'Exceeds' },
  { n: 2, word: 'Meets' },
  { n: 1, word: 'Below' },
] as const
export const CEILING = 12

/** Seven or under is not a verdict. It is the prompt to have the conversation. */
export const PROMPT_AT = 7

export const NOTE_KINDS = [
  { key: 'general',    label: 'Note' },
  { key: 'compliment', label: 'Compliment' },
  { key: 'coaching',   label: 'Coaching' },
] as const

export const DOC_KINDS = [
  { key: 'review',      label: 'Review' },
  { key: 'warning',     label: 'Written warning' },
  { key: 'agreement',   label: 'Agreement' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'other',       label: 'Other' },
] as const

/* ── quarters ─────────────────────────────────────────────────────────── */

export const quarterOf = (d: Date) => Math.floor(d.getUTCMonth() / 3) + 1

/** The first day of the quarter a date falls in, as the ISO string stored. */
export function quarterStart(d: Date = new Date()) {
  const q = quarterOf(d)
  return `${d.getUTCFullYear()}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
}

/** '2026-07-01' -> 'Q3 2026'. Parsed by hand rather than through Date, because
 *  new Date('2026-07-01') is midnight UTC and prints as Q2 west of Greenwich. */
export function quarterLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
}

/** The last n quarters, oldest first, ending with the one we are in. */
export function lastQuarters(n: number, from: Date = new Date()): string[] {
  const out: string[] = []
  let y = from.getUTCFullYear()
  let q = quarterOf(from)
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`)
    q -= 1
    if (q === 0) { q = 4; y -= 1 }
  }
  return out
}

export const daysSince = (iso: string | null) => {
  if (!iso) return null
  const then = Date.parse(iso + 'T00:00:00Z')
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/* ── who am I here ────────────────────────────────────────────────────── */

export type Stance = {
  personId: string | null
  /** owner | records | manager | self */
  stance: 'owner' | 'records' | 'manager' | 'self'
  mayEdit: boolean
}

export async function stanceIn(accountId: string): Promise<Stance> {
  const db = supabaseServer()
  const { data } = await db.schema('hopper').rpc('staff_stance', { acct: accountId })
  const row = Array.isArray(data) ? data[0] : data
  return {
    personId: row?.person_id ?? null,
    stance: (row?.stance ?? 'self') as Stance['stance'],
    mayEdit: !!row?.may_edit,
  }
}

/* ── the line ─────────────────────────────────────────────────────────── */

export type Member = {
  id: string
  name: string
  role: string | null
  photo: string | null
  managerId: string | null
  org: string | null
  score: number | null
  period: string | null
  lastMeeting: string | null
  nextMeeting: string | null
  notes: number
  docs: number
  reports: Member[]
}

export type Line = {
  /** Everyone you may open, by id. */
  all: Map<string, Member>
  /** The people who report to you directly. */
  mine: Member[]
  /** Everyone beneath you who themselves has reports, in name order. */
  leaders: Member[]
}

/**
 * Everyone in reach, with the three facts a row shows.
 *
 * Read as four flat selects and stitched here rather than as one nested select,
 * because the nested form would have PostgREST choose the join and there is no
 * foreign key from person to "their latest settled review" -- that is an
 * argmax, not a relationship.
 */
export async function loadLine(accountId: string, mePersonId: string | null): Promise<Line> {
  const db = supabaseServer()

  const [{ data: people }, { data: ents }, { data: reviews }, { data: meets },
         { data: notes }, { data: docs }] = await Promise.all([
    db.schema('hopper').from('person')
      .select('id, full_name, role_title, photo_url, entity_id, manager_id')
      .eq('active', true).order('full_name'),
    db.schema('hopper').from('entity').select('id, name'),
    db.schema('hopper').from('staff_review')
      .select('person_id, period, score').eq('settled', true).order('period', { ascending: false }),
    db.schema('hopper').from('staff_meeting')
      .select('person_id, day, held').order('day', { ascending: false }),
    db.schema('hopper').from('staff_note').select('person_id'),
    db.schema('hopper').from('staff_document').select('person_id'),
  ])

  const orgName = new Map<string, string>((ents ?? []).map((e: any) => [e.id, e.name]))
  const count = (rows: any[] | null) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.person_id, (m.get(r.person_id) ?? 0) + 1)
    return m
  }
  const noteCount = count(notes)
  const docCount = count(docs)

  // Newest first out of the database, so the first sighting of a person is
  // their latest.
  const latest = new Map<string, { period: string; score: number | null }>()
  for (const r of (reviews ?? []) as any[]) {
    if (!latest.has(r.person_id)) latest.set(r.person_id, { period: r.period, score: r.score })
  }

  const today = new Date().toISOString().slice(0, 10)
  const lastMeeting = new Map<string, string>()
  const nextMeeting = new Map<string, string>()
  for (const m of (meets ?? []) as any[]) {
    if (m.held && !lastMeeting.has(m.person_id)) lastMeeting.set(m.person_id, m.day)
    // The list is newest first, so the LAST future one seen is the soonest.
    if (!m.held && m.day >= today) nextMeeting.set(m.person_id, m.day)
  }

  const all = new Map<string, Member>()
  for (const p of (people ?? []) as any[]) {
    const l = latest.get(p.id)
    all.set(p.id, {
      id: p.id,
      name: p.full_name,
      role: p.role_title ?? null,
      photo: p.photo_url ?? null,
      managerId: p.manager_id ?? null,
      org: p.entity_id ? orgName.get(p.entity_id) ?? null : null,
      score: l?.score ?? null,
      period: l?.period ?? null,
      lastMeeting: lastMeeting.get(p.id) ?? null,
      nextMeeting: nextMeeting.get(p.id) ?? null,
      notes: noteCount.get(p.id) ?? 0,
      docs: docCount.get(p.id) ?? 0,
      reports: [],
    })
  }

  for (const m of all.values()) {
    const boss = m.managerId ? all.get(m.managerId) : null
    if (boss && boss.id !== m.id) boss.reports.push(m)
  }
  for (const m of all.values()) m.reports.sort((a, b) => a.name.localeCompare(b.name))

  const mine = mePersonId ? all.get(mePersonId)?.reports ?? [] : []

  // Everyone beneath me who leads somebody. Walked rather than filtered,
  // because "beneath me" is the whole point and a flat filter would sweep in
  // anybody the roster grant also happens to show.
  const beneath: Member[] = []
  const seen = new Set<string>(mePersonId ? [mePersonId] : [])
  const queue = [...mine]
  while (queue.length) {
    const m = queue.shift()!
    if (seen.has(m.id)) continue
    seen.add(m.id)
    beneath.push(m)
    queue.push(...m.reports)
  }
  const leaders = beneath.filter((m) => m.reports.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  return { all, mine, leaders }
}

/** Everyone in reach at all — what an HR viewer with no reports of their own
 *  sees, grouped by whoever manages them. */
export function byManager(all: Map<string, Member>) {
  const groups = new Map<string, { leader: Member | null; people: Member[] }>()
  for (const m of all.values()) {
    const key = m.managerId ?? 'none'
    if (!groups.has(key)) {
      groups.set(key, { leader: m.managerId ? all.get(m.managerId) ?? null : null, people: [] })
    }
    groups.get(key)!.people.push(m)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, people: g.people.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.leader?.name ?? '~').localeCompare(b.leader?.name ?? '~'))
}
