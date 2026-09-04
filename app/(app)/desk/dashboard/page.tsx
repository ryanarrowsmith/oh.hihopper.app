import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadScored } from '@/lib/deskstats'
import { loadDeskRefs } from '@/lib/deskdata'
import DeskDash from '@/components/DeskDash'

export const dynamic = 'force-dynamic'

/**
 * How it's going.
 *
 * Volume and attainment, for whichever of the three readers is looking. There
 * is no organization or queue chosen for anybody here either: RLS has already
 * narrowed the scored view to what this person may see, and the scope chips do
 * the rest without a round trip.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const [{ rows, agents }, refs] = await Promise.all([loadScored(), loadDeskRefs()])

  return (
    <DeskDash
      rows={rows}
      agents={agents}
      queues={refs.queues}
      orgs={refs.orgs}
      kinds={refs.kinds}
      people={refs.people}
      mePersonId={session.personId}
      printedBy={session.displayName}
    />
  )
}
