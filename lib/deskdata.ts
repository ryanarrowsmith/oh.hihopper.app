import { supabaseServer } from '@/lib/supabase/server'
import type { Row, Status } from '@/lib/desk'

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
