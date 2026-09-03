import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadCards } from '@/lib/cards'
import DashPrint from '@/components/DashPrint'

export const dynamic = 'force-dynamic'

/**
 * A dashboard, as a document.
 *
 * The same cards the board draws, in the same order, filtered the same way --
 * loadCards returns only what this reader may see, so a report restricted
 * since it was pinned is absent from the paper as well as the screen. A PDF
 * that shows a figure the reader is no longer allowed to see is worse than a
 * screen that does, because it outlives the permission.
 */
export default async function PrintDashboard({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: board }, { data: on }, cards] = await Promise.all([
    db.schema('hopper').from('dashboard_named').select('*').eq('id', params.id).maybeSingle(),
    db.schema('hopper').from('dashboard_card').select('report_id, position')
      .eq('dashboard_id', params.id).order('position', { ascending: true }),
    loadCards(),
  ])
  if (!board) notFound()

  const byId = new Map(cards.map((c) => [c.id, c]))
  const chosen = (on ?? []).map((c: any) => byId.get(c.report_id)).filter(Boolean) as typeof cards

  return <DashPrint board={board as any} cards={chosen} who={session.displayName} />
}
