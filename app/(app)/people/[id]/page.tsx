import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import PersonFolder from '@/components/PersonFolder'
import Favorites, { type Profile } from '@/components/Favorites'
import GetToKnowEdit, { type Answers } from '@/components/GetToKnowEdit'
import CrumbTail from '@/components/CrumbTail'

export const dynamic = 'force-dynamic'

/**
 * One person.
 *
 * The top half comes from hopper.directory and everyone in the organization
 * can see it. Contact details come from hopper.person, which is behind the
 * roster grant -- and when that read comes back empty they are simply not
 * drawn. A greyed-out field still tells you the field is there and invites
 * somebody to go looking for it.
 */
export default async function PersonPage({ params }: { params: { id: string } }) {
  const db = supabaseServer()

  const [{ data: d }, { data: contact }] = await Promise.all([
    db.schema('hopper').from('directory').select('*').eq('id', params.id).maybeSingle(),
    db.schema('hopper').from('person').select('email, phone').eq('id', params.id).maybeSingle(),
  ])
  if (!d) notFound()

  // The pinned restaurant, drawn by the same proxy the location maps use, so
  // the token never reaches the browser.
  const mapSrc = d.restaurant_lat != null && d.restaurant_lng != null
    ? `/api/map?lat=${d.restaurant_lat}&lng=${d.restaurant_lng}&w=640&h=208&z=15`
    : null

  const heading = `Get to know ${d.is_me ? 'me' : d.full_name.split(' ')[0]}`

  return (
    <>
      {/* The trail now ends on this person, so "Back to People" was the same
          link twice on the same screen, six inches apart. */}
      <CrumbTail>{d.full_name}</CrumbTail>

      <PersonFolder d={d as any} email={contact?.email ?? null}
                    phone={contact?.phone ?? null} />

      <div className="gtkm">
        {d.may_edit ? (
          <GetToKnowEdit personId={d.id} mine={!!d.is_me} title={heading}
                         answers={d as unknown as Answers} />
        ) : (
          <div className="gtkm__h"><h3>{heading}</h3><span className="rule" /></div>
        )}
        <Favorites p={d as unknown as Profile} mapSrc={mapSrc} />
      </div>
    </>
  )
}
