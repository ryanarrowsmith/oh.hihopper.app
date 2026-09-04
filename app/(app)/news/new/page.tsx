import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadWriteBits } from '@/lib/news'
import PostForm from '@/components/PostForm'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  const bits = await loadWriteBits()
  // Nothing to post to is not a permission error, it is an empty account.
  if (bits.orgs.length === 0) redirect('/news')
  return <PostForm {...bits} />
}
