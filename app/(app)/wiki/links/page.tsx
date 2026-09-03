import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import ComingPage from '@/components/Coming'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  return <ComingPage m={{
    title: 'Links',
    is: 'The handful of other places this business actually works in.',
    will: ['The tools people open every day, named the way your business names them rather than the way the vendor does.', 'Grouped by organization, so a new starter gets the right ten and not everyone’s forty.', 'Owned by somebody, so a dead link has a person to tell.'],
    meanwhile: { label: 'Wiki', href: '/wiki', why: 'this will live under the Wiki when it is written —' },
  }} accountId={session.accountId} />
}
