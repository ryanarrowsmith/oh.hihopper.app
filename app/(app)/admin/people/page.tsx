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
      // The platform owns identity. A row here with a profile has an Oh hi
      // account; whether that account may open HOPPER is a different question,
      // asked below.
      db.schema('beebee').from('profiles').select('id'),
    ])

  // Who may actually open Hopper, and who may change that.
  //
  // app_access is readable by an admin of the account and nobody else, so a
  // roster-edit holder who is not one gets an empty read -- which must not be
  // mistaken for "nobody can sign in". Membership is readable by any member,
  // so that is what answers "am I an admin", and the access rows are only
  // trusted when the answer is yes.
  const [{ data: members }, { data: access }] = await Promise.all([
    db.schema('beebee').from('account_members').select('user_id, role'),
    db.schema('beebee').from('app_access')
      .select('user_id, status').eq('app_id', 'hopper'),
  ])
  const iAmAdmin = (members ?? []).some((m: any) =>
    m.user_id === session.userId && (m.role === 'owner' || m.role === 'admin'))
  const opens = iAmAdmin
    ? new Map((access ?? []).map((a: any) => [a.user_id, a.status]))
    : null

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
        // What we actually know. With the access rows in hand this is the true
        // answer; without them it is the best one available -- "they have an
        // Oh hi account" -- and the switch that would change it is not drawn.
        canSignIn: opens
          ? opens.get(p.profile_id) === 'active'
          : !!p.profile_id && signedUp.has(p.profile_id),
        hasAccount: !!p.profile_id && signedUp.has(p.profile_id),
        isMe: !!p.profile_id && p.profile_id === session.userId,
        // An address to invite, and no login against it. Worth its own state:
        // somebody who could be given a login and has not been is a job to do,
        // and it is invisible if it looks the same as "on the roster on
        // purpose". It does NOT mean an invitation was sent -- nothing in
        // Hopper sends one yet.
        invited: !!p.email && !p.profile_id,
        active: p.active,
      }))}
      orgs={(ents ?? []) as any}
      depts={(depts ?? []).map((d: any) => ({ id: d.id, name: d.name, entityId: d.entity_id }))}
      mayEdit={(rights ?? []).some((r: any) => r.may_edit)}
      mayManageAccess={iAmAdmin} />
  )
}
