import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'Wiki',
    is: 'How this business does things, written down where people look.',
    will: ['Pages with an owner and a date last checked, because a procedure nobody has confirmed in two years is worse than no procedure.', 'Scoped to an organization or a department, so a location does not have to read somebody else’s rules.', 'Searchable from anywhere in Hopper, not only from here.'],
    meanwhile: { label: 'People', href: '/people', why: 'the roster is the fastest way to find who knows —' },
  }} accountId={session.accountId} />
}
