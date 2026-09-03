import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadCards } from '@/lib/cards'
import DashboardPage from '@/components/DashboardPage'

export const dynamic = 'force-dynamic'

/**
 * One dashboard.
 *
 * The cards are the same cards Reporting draws, from the same loader, filtered
 * to what is on this board and ordered by its own positions. Filtered rather
 * than fetched by id on purpose: loadCards returns only what this reader may
 * see, so a report that has been restricted since it was pinned simply is not
 * there -- the dashboard loses a card instead of showing a hole where somebody
 * else's figure used to be.
 */
export default async function OneDashboard({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: board }, { data: on }, cards, { data: shares }, { data: people }] =
    await Promise.all([
      db.schema('hopper').from('dashboard_named').select('*').eq('id', params.id).maybeSingle(),
      db.schema('hopper').from('dashboard_card')
        .select('report_id, position').eq('dashboard_id', params.id)
        .order('position', { ascending: true }),
      loadCards(),
      db.schema('hopper').from('dashboard_share')
        .select('person_id').eq('dashboard_id', params.id),
      db.schema('hopper').from('directory').select('id, full_name, entity_name').order('full_name'),
    ])
  if (!board) notFound()

  const byId = new Map(cards.map((c) => [c.id, c]))
  const chosen = (on ?? [])
    .map((c: any) => byId.get(c.report_id))
    .filter(Boolean) as typeof cards

  return (
    <DashboardPage
      board={board as any}
      chosen={chosen}
      // Everything else they could pin, so the picker is one list rather than a
      // search that has to go and ask.
      rest={cards.filter((c) => !chosen.some((x) => x.id === c.id))}
      shares={(shares ?? []).map((s: any) => s.person_id)}
      people={(people ?? []).filter((p: any) => p.id !== session.personId) as any}
    />
  )
}
