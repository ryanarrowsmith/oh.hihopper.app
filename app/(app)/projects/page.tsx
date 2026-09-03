import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'Projects',
    is: 'Work with an end, as opposed to work that repeats.',
    will: ['A project belongs to an organization, has somebody accountable, and has a date it is meant to be done.', 'Tasks under it, assigned to people on the roster rather than to names typed in.', 'A report can be attached to one, so the number that says whether it worked sits with the work.'],
    meanwhile: { label: 'Reporting', href: '/reporting', why: 'the figures a project moves are already here —' },
  }} accountId={session.accountId} />
}
