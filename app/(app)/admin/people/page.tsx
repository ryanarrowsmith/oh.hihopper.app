import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Roster from '@/components/Roster'

export const dynamic = 'force-dynamic'

/**
 * The roster: the PEOPLE table, not the user table.
 *
 * The distinction is the whole reason this screen is separate from Users. A
 * person is somebody the business employs; a user is somebody who can sign in.
 * Most people are not users, which is exactly why a roster has to be
 * importable in bulk and a login never should be.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: people }, { data: ents }, { data: depts }, { data: locs }, { data: rights }] =
    await Promise.all([
      db.schema('hopper').from('person')
        .select('id, full_name, email, role_title, phone, entity_id, department_id, location_id, manager_id, profile_id, active')
        .order('full_name'),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('department').select('id, name'),
      db.schema('hopper').from('location').select('id, name'),
      db.schema('hopper').from('entity_rights').select('may_edit'),
    ])

  const name = (list: any[], id: string | null) =>
    (id && (list ?? []).find((x: any) => x.id === id)?.name) || null
  const byId = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>People</h1>
        <p className="scopeline"><span>
          Everyone the business employs. Signing in is a separate thing, decided under <b>Users</b>.
        </span></p>
      </div></div>

      <Roster
        people={(people ?? []).map((p: any) => ({
          id: p.id, name: p.full_name, email: p.email, role: p.role_title, phone: p.phone,
          entity: name(ents ?? [], p.entity_id), department: name(depts ?? [], p.department_id),
          location: name(locs ?? [], p.location_id),
          manager: p.manager_id ? byId.get(p.manager_id) ?? null : null,
          canSignIn: !!p.profile_id, active: p.active,
        }))}
        mayEdit={(rights ?? []).some((r: any) => r.may_edit)} />
    </>
  )
}
