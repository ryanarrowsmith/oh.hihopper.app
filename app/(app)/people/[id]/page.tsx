import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import PersonBadge from '@/components/PersonBadge'
import PersonEdit, { type Named } from '@/components/PersonEdit'
import { type Profile } from '@/components/Favorites'
import { type Answers } from '@/components/GetToKnowFields'
import CrumbTail from '@/components/CrumbTail'
import Remember from '@/components/Remember'

export const dynamic = 'force-dynamic'

/**
 * One person.
 *
 * The top half comes from hopper.directory and everyone in the organization
 * can see it. Contact details come from hopper.person, which is behind the
 * roster grant -- and when that read comes back empty they are simply not
 * drawn. A greyed-out field still tells you the field is there and invites
 * somebody to go looking for it.
 *
 * Editing is one pencil for the whole page -- the details beside the badge and
 * the Get to know me answers below it, in one form. The lists the form needs
 * are only fetched when somebody may actually open it.
 */
export default async function PersonPage({ params }: { params: { id: string } }) {
  const db = supabaseServer()

  const [{ data: d }, { data: contact }] = await Promise.all([
    db.schema('hopper').from('directory').select('*').eq('id', params.id).maybeSingle(),
    db.schema('hopper').from('person')
      .select('email, phone, manager_id, profile_id, role_title').eq('id', params.id).maybeSingle(),
  ])
  if (!d) notFound()

  // Where somebody can sign in, the platform owns their address as well as
  // their name -- hopper.person.email is the address of record only for roster
  // entries with no login. The directory has already resolved the name; this
  // is the same rule for the one contact detail it deliberately does not
  // carry. Read through the caller's own session, which beebee allows for
  // anybody sharing an account with them.
  const { data: prof } = contact?.profile_id
    ? await db.schema('beebee').from('profiles')
        .select('email').eq('id', contact.profile_id).maybeSingle()
    : { data: null }
  const email = prof?.email ?? contact?.email ?? null

  // Through the directory, not joined into it: RLS then answers, so somebody
  // whose manager this viewer may not see gets no row rather than a name they
  // were never meant to have.
  const { data: manager } = contact?.manager_id
    ? await db.schema('hopper').from('directory')
        .select('id, full_name').eq('id', contact.manager_id).maybeSingle()
    : { data: null }

  // Only what the form needs, and only when there is a form. Four reads on
  // every visit to a page most people only look at is four reads too many.
  const may = !!d.may_edit
  const [{ data: orgs }, { data: depts }, { data: locs }, { data: roster }] = may
    ? await Promise.all([
        db.schema('hopper').from('entity').select('id, name').order('sort_order'),
        db.schema('hopper').from('department').select('id, name, entity_id')
          .eq('active', true).order('name'),
        db.schema('hopper').from('location').select('id, name, entity_id').order('name'),
        db.schema('hopper').from('directory').select('id, full_name')
          .eq('active', true).order('full_name'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const named = (rows: any[] | null, key = 'name'): Named[] =>
    (rows ?? []).map((r: any) => ({ id: r.id, name: r[key], entityId: r.entity_id ?? null }))

  // The pinned restaurant, drawn by the same proxy the location maps use, so
  // the token never reaches the browser.
  const mapSrc = d.restaurant_lat != null && d.restaurant_lng != null
    ? `/api/map?lat=${d.restaurant_lat}&lng=${d.restaurant_lng}&w=640&h=208&z=15`
    : null

  const heading = `Get to know ${d.is_me ? 'me' : d.full_name.split(' ')[0]}`

  return (
    <>
      <Remember kind="person" id={d.id} label={d.full_name}
                sub={[d.role_name, d.entity_name].filter(Boolean).join(' · ') || null} />
      {/* The trail now ends on this person, so "Back to People" was the same
          link twice on the same screen, six inches apart. */}
      <CrumbTail>{d.full_name}</CrumbTail>

      <PersonEdit
        badge={<PersonBadge d={d as any} mayEdit={may} />}
        personId={d.id}
        mine={!!d.is_me}
        mayEdit={may}
        hasLogin={!!d.has_login}
        heading={heading}
        name={d.full_name}
        role={contact?.role_title ?? d.role_name ?? null}
        phone={contact?.phone ?? null}
        email={email}
        entityId={d.entity_id}
        departmentId={d.department_id}
        locationId={d.location_id}
        managerId={contact?.manager_id ?? null}
        departmentName={d.department_name}
        locationName={d.location_name}
        managerName={(manager as any)?.full_name ?? null}
        entityName={d.entity_name}
        orgs={named(orgs)}
        departments={named(depts)}
        locations={named(locs)}
        people={named(roster, 'full_name')}
        answers={d as unknown as Answers}
        profile={d as unknown as Profile}
        mapSrc={mapSrc}
      />
    </>
  )
}
