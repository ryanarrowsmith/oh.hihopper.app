import { supabaseServer } from '@/lib/supabase/server'
import type { Row, Status, Job } from '@/lib/desk'

/**
 * Reading the desk. SERVER ONLY.
 *
 * Split from lib/desk.ts deliberately: the vocabulary and the SLA arithmetic
 * are drawn by client components, and a client component that imports this
 * file drags next/headers into the browser bundle and fails the build. One
 * import of supabaseServer in a shared module is all it takes -- so the shared
 * module has none.
 */

const ROW = `id, ref, subject, status, priority, source, opened_at, last_message_at,
  first_reply_due, first_reply_at, resolve_due, resolved_at,
  entity_id, queue_id, assignee_id, group_id, kind_id,
  contact_id, requester_name, requester_email`

/**
 * Everything you're on.
 *
 * No organization filter by default and no queue filter by default: RLS has
 * already narrowed this to the queues this person actually works, and landing
 * pre-filtered is how a rep misses the one ticket that was breaching in the
 * queue they forgot they were on.
 */
export async function loadTickets(opts: {
  status?: Status[]; queue?: string | null; entity?: string | null
  assignee?: string | null; unassigned?: boolean; group?: string | null
  limit?: number
} = {}) {
  const db = supabaseServer()
  let q = db.schema('hopper').from('ticket').select(ROW)

  if (opts.status?.length) q = q.in('status', opts.status)
  if (opts.queue) q = q.eq('queue_id', opts.queue)
  if (opts.entity) q = q.eq('entity_id', opts.entity)
  if (opts.assignee) q = q.eq('assignee_id', opts.assignee)
  if (opts.unassigned) q = q.is('assignee_id', null)
  if (opts.group) q = q.eq('group_id', opts.group)

  // Closest to breaching first, and a ticket with no promise on it sorts after
  // every ticket that has one rather than jumping the queue on a null.
  const { data } = await q
    .order('first_reply_due', { ascending: true, nullsFirst: false })
    .order('opened_at', { ascending: true })
    .limit(opts.limit ?? 300)
  return (data ?? []) as Row[]
}

/** The furniture every Desk screen draws rows against. One round trip. */
export async function loadDeskRefs() {
  const db = supabaseServer()
  const [queues, people, ents, kinds, groups, slas, deps, desks] = await Promise.all([
    db.schema('hopper').from('queue')
      .select('id, name, entity_id, department_id, facing, sla_id, assign_mode, assign_to, inbox_address, form_enabled, active, sort_order')
      .order('sort_order'),
    db.schema('hopper').from('directory').select('id, full_name').eq('active', true),
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('ticket_kind')
      .select('id, name, entity_id, sla_id, active, sort_order').order('sort_order'),
    db.schema('hopper').from('ticket_group')
      .select('id, name, reason, open, entity_id').eq('open', true),
    db.schema('hopper').from('sla')
      .select('id, name, entity_id, first_reply_mins, resolve_mins, business_hours, active, sort_order')
      .order('sort_order'),
    db.schema('hopper').from('department')
      .select('id, name, entity_id, active').order('sort_order'),
    db.schema('hopper').from('desk')
      .select('entity_id, prefix, next_number, day_start, day_end, work_days, time_zone'),
  ])
  return {
    queues: (queues.data ?? []) as any[],
    people: (people.data ?? []) as { id: string; full_name: string }[],
    orgs: (ents.data ?? []) as { id: string; name: string }[],
    kinds: (kinds.data ?? []) as any[],
    groups: (groups.data ?? []) as any[],
    slas: (slas.data ?? []) as any[],
    departments: (deps.data ?? []) as any[],
    desks: (desks.data ?? []) as any[],
  }
}

/** Every open job hanging off this set of tickets, in one round trip. */
export async function loadJobs(ticketIds: string[]) {
  if (!ticketIds.length) return []
  const db = supabaseServer()
  const { data } = await db.schema('hopper').from('task')
    .select('id, name, detail, assignee_id, created_by, due_on, done_at, created_at, list_id, ticket_id')
    .in('ticket_id', ticketIds)
    .order('created_at')
  return (data ?? []) as (Job & { ticket_id: string })[]
}

/* ------------------------------------------------------------- contacts */

export type ContactRow = {
  id: string; email: string; name: string | null; phone: string | null
  note: string | null; company_id: string | null; entity_id: string
  active: boolean; created_at: string
}
export type CompanyRow = {
  id: string; name: string; domain: string | null; note: string | null
  entity_id: string; active: boolean
}

/**
 * Everyone who has ever written in, with what they have written about.
 *
 * The counts come back with the list rather than one query per row: 300
 * contacts on a page must not be 300 round trips, and the numbers are the
 * whole reason the list is worth opening. RLS narrows both halves, so a
 * contact whose tickets this person cannot see simply counts zero.
 */
export async function loadContacts() {
  const db = supabaseServer()
  const [people, companies, tickets] = await Promise.all([
    db.schema('hopper').from('contact')
      .select('id, email, name, phone, note, company_id, entity_id, active, created_at')
      .order('name'),
    db.schema('hopper').from('company')
      .select('id, name, domain, note, entity_id, active').order('name'),
    db.schema('hopper').from('ticket')
      .select('contact_id, status, opened_at').not('contact_id', 'is', null).limit(5000),
  ])

  const seen = new Map<string, { open: number; all: number; last: string | null }>()
  for (const t of (tickets.data ?? []) as any[]) {
    const at = seen.get(t.contact_id) ?? { open: 0, all: 0, last: null }
    at.all += 1
    if (t.status === 'open' || t.status === 'waiting') at.open += 1
    if (!at.last || t.opened_at > at.last) at.last = t.opened_at
    seen.set(t.contact_id, at)
  }

  return {
    contacts: (people.data ?? []) as ContactRow[],
    companies: (companies.data ?? []) as CompanyRow[],
    counts: Object.fromEntries(seen) as Record<string, { open: number; all: number; last: string | null }>,
  }
}
