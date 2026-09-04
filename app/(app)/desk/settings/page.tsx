import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadDeskRefs } from '@/lib/deskdata'
import DeskAdmin from '@/components/DeskAdmin'

export const dynamic = 'force-dynamic'

/**
 * Queues & SLAs -- the desk's own settings.
 *
 * Nothing here is checked twice in JavaScript. RLS decides what this person may
 * write, and the screen only draws what it may write: a queue nobody can edit
 * is drawn as a row with no form under it, because a control that saves nothing
 * is worse than a control that is not there.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const refs = await loadDeskRefs()

  // What this person may configure, asked of the database rather than guessed.
  // One view, one round trip, and the same helper the policies use -- so the
  // screen and the write can never disagree about who may do what.
  const [{ data: rights }, { data: agents }] = await Promise.all([
    db.schema('hopper').from('desk_rights').select('entity_id, may_admin'),
    db.schema('hopper').from('queue_agent').select('id, queue_id, person_id, lead, active'),
  ])
  const mayOrgs = (rights ?? []).filter((r: any) => r.may_admin).map((r: any) => r.entity_id)

  return (
    <DeskAdmin
      orgs={refs.orgs} mayOrgs={mayOrgs}
      departments={refs.departments} queues={refs.queues} agents={(agents ?? []) as any}
      slas={refs.slas} kinds={refs.kinds} people={refs.people} desks={refs.desks}
    />
  )
}
