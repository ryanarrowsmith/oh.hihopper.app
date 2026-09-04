import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import CompanyPage from '@/components/CompanyPage'

export const dynamic = 'force-dynamic'

/**
 * A company, which is every ticket from everyone who works there.
 *
 * The page a contact page cannot be: three people at Acme Brick raising the
 * same complaint about the same route is a pattern nobody sees one person at a
 * time.
 */
export default async function Page({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const { data: co } = await db.schema('hopper').from('company')
    .select('id, name, domain, note, entity_id, active').eq('id', params.id).maybeSingle()
  if (!co) notFound()

  const { data: people } = await db.schema('hopper').from('contact')
    .select('id, email, name, phone, active').eq('company_id', co.id).order('name')

  const ids = (people ?? []).map((p: any) => p.id)
  const [tickets, queues] = await Promise.all([
    ids.length
      ? db.schema('hopper').from('ticket')
          .select('id, ref, subject, status, source, queue_id, contact_id, opened_at, first_reply_due, first_reply_at, resolve_due, resolved_at')
          .in('contact_id', ids).order('opened_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: [] as any[] }),
    db.schema('hopper').from('queue').select('id, name').order('sort_order'),
  ])

  return (
    <CompanyPage company={co as any} people={(people ?? []) as any}
                 tickets={((tickets as any).data ?? []) as any}
                 queues={(queues.data ?? []) as any} />
  )
}
