import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'Staffing',
    is: 'Who is working, when.',
    will: ['A schedule per location, built from the roster you already have rather than a second list of names.', 'Time off requested and answered in the same place, so the schedule and the answer cannot disagree.', 'Coverage visible before it is a problem — the point of a schedule is the gap you can still fill.'],
    meanwhile: { label: 'People', href: '/people', why: 'the roster and everyone’s office are already here —' },
  }} accountId={session.accountId} />
}
