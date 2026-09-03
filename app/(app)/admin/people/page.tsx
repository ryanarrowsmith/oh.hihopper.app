import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Roster from '@/components/Roster'

export const dynamic = 'force-dynamic'

/**
 * The roster, and the only screen that decides who is on it.
 *
 * This used to be two screens over one table -- People (import, bulk remove)
 * and Users (add, view) -- with the actions split so that neither was complete:
 * you could import fifty and not add one, and you could add one and not turn
 * anybody off. The distinction they were built to express is real, but it is a
 * COLUMN: a person is somebody the business employs, a user is somebody who can
 * sign in, and most people are not users. So sign-in is a column here, and
 * /admin/users redirects to this page.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: people }, { data: ents }, { data: depts }, { data: locs },
         { data: rights }, { data: profiles }] =
    await Promise.all([
      db.schema('hopper').from('person')
        .select('id, full_name, email, role_title, phone, entity_id, department_id, location_id, manager_id, profile_id, active')
        .order('full_name'),
      db.schema('hopper').from('entity').select('id, name').order('sort_order'),
      db.schema('hopper').from('department').select('id, name, entity_id').eq('active', true).order('name'),
      db.schema('hopper').from('location').select('id, name'),
      db.schema('hopper').from('entity_rights').select('may_edit'),
      // The platform owns identity. A row here with a profile can sign in; a
      // row with an email and no profile has been asked but has not arrived.
      db.schema('beebee').from('profiles').select('id'),
    ])

  const name = (list: any[], id: string | null) =>
    (id && (list ?? []).find((x: any) => x.id === id)?.name) || null
  const byId = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))
  const signedUp = new Set((profiles ?? []).map((p: any) => p.id))

  return (
    <Roster
      people={(people ?? []).map((p: any) => ({
        id: p.id, name: p.full_name, email: p.email, role: p.role_title, phone: p.phone,
        entity: name(ents ?? [], p.entity_id), entityId: p.entity_id,
        department: name(depts ?? [], p.department_id),
        location: name(locs ?? [], p.location_id),
        manager: p.manager_id ? byId.get(p.manager_id) ?? null : null,
        canSignIn: !!p.profile_id && signedUp.has(p.profile_id),
        // Asked, but not yet arrived. Worth its own state: "never invited" is a
        // job somebody has to do, and it is invisible if it looks the same as
        // "on the roster on purpose".
        invited: !!p.email && !p.profile_id,
        active: p.active,
      }))}
      orgs={(ents ?? []) as any}
      depts={(depts ?? []).map((d: any) => ({ id: d.id, name: d.name, entityId: d.entity_id }))}
      mayEdit={(rights ?? []).some((r: any) => r.may_edit)} />
  )
}
