import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'Meetings',
    is: 'What was decided, and by whom.',
    will: ['An agenda before, notes during, and decisions after — one record rather than three documents in three places.', 'Actions that come out of a meeting land on a person, with a date, and are visible outside the notes.', 'Attached to the organization it was about, so next quarter somebody can find what was said last quarter.'],
    meanwhile: { label: 'Wiki', href: '/wiki', why: 'standing procedure belongs in the Wiki when it exists —' },
  }} accountId={session.accountId} />
}
