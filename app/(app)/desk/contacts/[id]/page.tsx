import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import ContactPage from '@/components/ContactPage'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const { data: c } = await db.schema('hopper').from('contact')
    .select('id, email, name, phone, note, company_id, entity_id, active, created_at')
    .eq('id', params.id).maybeSingle()
  if (!c) notFound()

  const [tickets, company, companies, queues, kinds] = await Promise.all([
    db.schema('hopper').from('ticket')
      .select('id, ref, subject, status, source, queue_id, kind_id, assignee_id, opened_at, first_reply_due, first_reply_at, resolve_due, resolved_at')
      .eq('contact_id', c.id).order('opened_at', { ascending: false }).limit(300),
    c.company_id
      ? db.schema('hopper').from('company').select('id, name, domain').eq('id', c.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.schema('hopper').from('company')
      .select('id, name, domain, note, entity_id, active').eq('entity_id', c.entity_id).order('name'),
    db.schema('hopper').from('queue').select('id, name').order('sort_order'),
    db.schema('hopper').from('ticket_kind').select('id, name').order('sort_order'),
  ])

  return (
    <ContactPage
      contact={c as any}
      company={(company as any).data ?? null}
      companies={(companies.data ?? []) as any}
      tickets={(tickets.data ?? []) as any}
      queues={(queues.data ?? []) as any}
      kinds={(kinds.data ?? []) as any}
    />
  )
}
