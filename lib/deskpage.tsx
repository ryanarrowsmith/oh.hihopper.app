import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadTickets, loadDeskRefs, loadJobs } from '@/lib/deskdata'
import type { Row } from '@/lib/desk'
import DeskQueue from '@/components/DeskQueue'

/**
 * The three queue screens are ONE screen with a different first cut.
 *
 * Assigned to me and Unassigned are not different pages -- they are the same
 * page landing on a filter it already has a chip for. Writing them three times
 * is three places for the sort order to drift apart.
 */
export async function deskScreen(opts: {
  title: string; blurb?: string; mine?: boolean; unassigned?: boolean
}) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()

  // The working set: everything still ours, plus what was finished today so a
  // rep can see their own morning. Not the archive -- that has its own search.
  const dawn = new Date(); dawn.setHours(0, 0, 0, 0)

  const [live, done, refs, contacts, { data: rights }] = await Promise.all([
    loadTickets({
      status: ['open', 'waiting'],
      assignee: opts.mine ? session.personId : null,
      unassigned: opts.unassigned,
      limit: 500,
    }),
    db.schema('hopper').from('ticket')
      .select('id, ref, subject, status, priority, source, opened_at, last_message_at, first_reply_due, first_reply_at, resolve_due, resolved_at, entity_id, queue_id, assignee_id, group_id, kind_id, contact_id, requester_name, requester_email')
      .in('status', ['resolved', 'closed'])
      .gte('resolved_at', dawn.toISOString())
      .order('resolved_at', { ascending: false }).limit(120),
    loadDeskRefs(),
    db.schema('hopper').from('contact').select('id, name, email').order('name').limit(500),
    // Whether the empty desk gets a way out of being empty, asked of the same
    // helper the write policy uses so the screen and the save agree.
    db.schema('hopper').from('desk_rights').select('may_admin'),
  ])

  const rows = [...live, ...((done.data ?? []) as Row[])]

  // How many jobs each ticket is still waiting on. One query for the page
  // rather than one per row, and only for what is actually on screen.
  const jobs = await loadJobs(rows.map((r) => r.id))
  const outstanding: Record<string, number> = {}
  for (const j of jobs) if (!j.done_at) outstanding[j.ticket_id] = (outstanding[j.ticket_id] ?? 0) + 1

  return (
    <DeskQueue
      title={opts.title} blurb={opts.blurb} rows={rows}
      queues={refs.queues.filter((q) => q.active)}
      people={refs.people} orgs={refs.orgs}
      kinds={refs.kinds.filter((k) => k.active)}
      groups={refs.groups}
      contacts={(contacts.data ?? []) as any}
      outstanding={outstanding}
      mePersonId={session.personId}
      canConfigure={(rights ?? []).some((r: any) => r.may_admin)}
      printedBy={session.displayName}
    />
  )
}
