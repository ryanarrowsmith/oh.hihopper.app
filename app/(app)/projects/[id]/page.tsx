import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadProject } from '@/lib/projects'
import ProjectBoard from '@/components/ProjectBoard'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [loaded, { data: people }] = await Promise.all([
    loadProject(params.id),
    db.schema('hopper').from('directory').select('id, full_name').eq('active', true),
  ])
  if (!loaded) notFound()

  // Can this person run it, or only read it? The database decides -- a
  // no-op update inside a rolled-back transaction, so nothing is written and
  // the answer is the policy's own rather than a second copy of it in here.
  const { data: canEdit } = await db.schema('hopper').from('project')
    .update({ updated_at: new Date().toISOString() }).eq('id', params.id).select('id')
  const mayEdit = !!canEdit && canEdit.length > 0

  return (
    <ProjectBoard {...loaded} people={(people ?? []) as any}
                  mayEdit={mayEdit} mePersonId={session.personId} />
  )
}
