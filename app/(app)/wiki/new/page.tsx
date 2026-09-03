import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadPickers, mayAuthor } from '@/lib/wiki'
import WikiForm from '@/components/WikiForm'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  // Asked of the database, not guessed here: somebody who types this address
  // without the permission gets sent back rather than a form that refuses.
  if (!(await mayAuthor())) redirect('/wiki')

  const { cats, ents, people } = await loadPickers()
  return <WikiForm cats={cats as any} ents={ents as any} people={people as any}
                   me={session.personId ?? null} />
}
