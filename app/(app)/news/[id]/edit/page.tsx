import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadPost, loadWriteBits } from '@/lib/news'
import PostForm from '@/components/PostForm'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  const [post, bits] = await Promise.all([loadPost(params.id), loadWriteBits()])
  if (!post) notFound()
  // The database already said so; the screen just does not offer what it would
  // refuse.
  if (!post.mayEdit) redirect(`/news/${params.id}`)
  return <PostForm {...bits} post={post} />
}
