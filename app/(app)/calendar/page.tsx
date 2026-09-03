import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'Calendar',
    is: 'Everything with a date on it, in one place.',
    will: ['One month, showing what the business already knows: when reports are due to refresh, when people started, and the birthdays Get to know me collects.', 'Filtered by the organizations you can open, the same as every other screen.', 'Subscribable, so it lands in the calendar you actually keep rather than one more you have to remember to look at.'],
    meanwhile: { label: 'Reporting', href: '/reporting', why: 'a report carries its own schedule and says when it last moved —' },
  }} accountId={session.accountId} />
}
