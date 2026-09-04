import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadDeskRefs } from '@/lib/deskdata'
import TicketPage from '@/components/TicketPage'

export const dynamic = 'force-dynamic'

/**
 * One ticket.
 *
 * The conversation is the page. Everything that can be changed about the
 * ticket sits beside it and changes in place -- a ticket you have to leave in
 * order to reassign is a ticket that gets reassigned less often than it should.
 */
export default async function Page({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const { data: t } = await db.schema('hopper').from('ticket')
    .select('*').eq('id', params.id).maybeSingle()
  if (!t) notFound()

  const [messages, trail, refs, fields, snippets, contact, siblings, jobs] = await Promise.all([
    db.schema('hopper').from('ticket_message')
      .select('id, kind, body, author_person_id, author_name, author_email, at, task_id')
      .eq('ticket_id', t.id).order('at'),
    db.schema('hopper').from('ticket_trail')
      .select('seq, occurred_at, action, summary, before, after, actor_name')
      .eq('ticket_id', t.id).order('occurred_at'),
    loadDeskRefs(),
    t.kind_id
      ? db.schema('hopper').from('ticket_field')
          .select('id, key, label, kind, required, options, hint, sort_order')
          .eq('kind_id', t.kind_id).eq('active', true).order('sort_order')
      : Promise.resolve({ data: [] as any[] }),
    db.schema('hopper').from('reply_snippet')
      .select('id, title, body, queue_id, kind_id')
      .eq('entity_id', t.entity_id).eq('active', true).order('sort_order'),
    t.contact_id
      ? db.schema('hopper').from('contact')
          .select('id, name, email, company, phone').eq('id', t.contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
    t.group_id
      ? db.schema('hopper').from('ticket').select('id, ref, subject, status')
          .eq('group_id', t.group_id).neq('id', t.id).limit(50)
      : Promise.resolve({ data: [] as any[] }),
    db.schema('hopper').from('task')
      .select('id, name, detail, assignee_id, created_by, due_on, done_at, created_at, list_id')
      .eq('ticket_id', t.id).order('created_at'),
  ])

  return (
    <TicketPage
      ticket={t as any}
      messages={(messages.data ?? []) as any}
      jobs={(jobs.data ?? []) as any}
      trail={(trail.data ?? []) as any}
      fields={((fields as any).data ?? []) as any}
      snippets={(snippets.data ?? []).filter((s: any) =>
        (!s.queue_id || s.queue_id === t.queue_id) && (!s.kind_id || s.kind_id === t.kind_id)) as any}
      contact={(contact as any).data ?? null}
      siblings={((siblings as any).data ?? []) as any}
      queues={refs.queues.filter((q) => q.active || q.id === t.queue_id)}
      people={refs.people}
      kinds={refs.kinds.filter((k) => k.entity_id === t.entity_id && (k.active || k.id === t.kind_id))}
      groups={refs.groups.filter((g) => g.entity_id === t.entity_id)}
      orgs={refs.orgs}
      mePersonId={session.personId}
    />
  )
}
