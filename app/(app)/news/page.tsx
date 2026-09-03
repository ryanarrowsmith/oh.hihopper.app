import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'News',
    is: 'What the business has told everybody, kept.',
    will: ['Short posts from an organization to the people in it, in date order.', 'Read once and stay read, so a notice does not follow you around after you have seen it.', 'Nothing that expires quietly: a post that no longer applies gets marked so rather than deleted, because somebody will ask about it.'],
    meanwhile: { label: 'Activity', href: '/activity', why: 'the log shows what has actually changed in Hopper —' },
  }} accountId={session.accountId} />
}
