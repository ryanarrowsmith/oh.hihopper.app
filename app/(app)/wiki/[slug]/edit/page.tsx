import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadForEdit, loadPickers, mayAuthor } from '@/lib/wiki'
import WikiForm from '@/components/WikiForm'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { slug: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  if (!(await mayAuthor())) redirect(`/wiki/${params.slug}`)

  const [doc, { cats, ents, people }] = await Promise.all([
    loadForEdit(params.slug), loadPickers(),
  ])
  if (!doc) notFound()
  return <WikiForm doc={doc} cats={cats as any} ents={ents as any} people={people as any}
                   me={session.personId ?? null} />
}
