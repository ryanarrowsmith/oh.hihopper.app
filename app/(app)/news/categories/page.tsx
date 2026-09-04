import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import NewsCategories from '@/components/NewsCategories'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: cats }, { data: used }] = await Promise.all([
    db.schema('hopper').from('news_category')
      .select('id, name, mark, active').order('sort_order').order('name'),
    db.schema('hopper').from('post').select('category_id'),
  ])
  // Whether to draw the pencil comes from the same place the write is
  // permitted, so the screen cannot promise an edit the database refuses.
  const { data: may } = await db.schema('hopper').from('news_category')
    .update({ sort_order: 0 }).eq('id', '00000000-0000-0000-0000-000000000000').select('id')

  const count = new Map<string, number>()
  for (const p of used ?? []) {
    if (p.category_id) count.set(p.category_id, (count.get(p.category_id) ?? 0) + 1)
  }

  return (
    <NewsCategories rows={(cats ?? []).map((c: any) => ({ ...c, used: count.get(c.id) ?? 0 }))}
                    mayEdit={may !== null} />
  )
}
