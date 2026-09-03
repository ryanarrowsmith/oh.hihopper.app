import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import PhotoUpload from '@/components/PhotoUpload'
import Favorites, { type Profile } from '@/components/Favorites'
import GetToKnowEdit, { type Answers } from '@/components/GetToKnowEdit'
import { OrgMark, PlaceMark } from '@/components/Icons'
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

      <div className="hi"><div className="hi__t">
        <h1>{d.full_name}</h1>
        <p className="scopeline"><span>{d.entity_name}</span></p>
      </div></div>

      <div className="phero">
        <PhotoUpload personId={d.id} name={d.full_name} src={d.photo_url} mine={!!d.is_me} />
        <div className="phero__b">
          <h2>{d.full_name}</h2>
          <p className="phero__role">{d.role_name ?? 'No role yet'}</p>

          <div className="pmeta">
            {d.entity_id && (
              <a className="chip" href={`/admin/organizations/${d.entity_id}`}>
                <OrgMark /><b>{d.entity_name}</b>
              </a>
            )}
            {d.department_name && (
              <span className="chip"><OrgMark />{d.department_name}</span>
            )}
            {d.location_id && d.entity_id ? (
              <a className="chip"
                 href={`/admin/organizations/${d.entity_id}/locations/${d.location_id}`}>
                <PlaceMark />{d.location_name}
              </a>
            ) : d.location_name ? (
              <span className="chip"><PlaceMark />{d.location_name}</span>
            ) : null}
          </div>

          {(contact?.email || contact?.phone) && (
            <div className="contact">
              {contact.email && (
                <a href={`mailto:${contact.email}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
                       strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" /><path d="m3 7 9 6 9-6" />
                  </svg>{contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
                  </svg>{contact.phone}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

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
