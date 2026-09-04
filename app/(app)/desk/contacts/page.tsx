import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadContacts } from '@/lib/deskdata'
import Contacts from '@/components/Contacts'

export const dynamic = 'force-dynamic'

/**
 * Everyone who writes in.
 *
 * Sorted by who you have heard from most recently, because the question people
 * actually arrive with is "who was that" rather than "show me the Bs".
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ contacts, companies, counts }, { data: orgs }] = await Promise.all([
    loadContacts(),
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
  ])

  return (
    <Contacts contacts={contacts} companies={companies} counts={counts}
              orgs={(orgs ?? []) as any} />
  )
}
