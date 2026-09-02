import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import ActionForm from '@/components/ActionForm'
import LocationMap from '@/components/LocationMap'
import { updateLocation, repinLocation, toggleFavorite } from '@/app/actions/admin'
import FavoriteButton from '@/components/CardActions'
import { HeadOffice } from '@/components/Icons'

export default async function Location({ params }: { params: { id: string; loc: string } }) {
  const db = supabaseServer()
  const [{ data: l }, { data: org }, { data: rights }, { data: fav }] = await Promise.all([
    db.schema('hopper').from('location').select('*').eq('id', params.loc).maybeSingle(),
    db.schema('hopper').from('entity').select('id, name').eq('id', params.id).maybeSingle(),
    // Whether to draw the pencil comes from the same place the write is
    // permitted, so the screen cannot promise an edit the database refuses.
    db.schema('hopper').from('entity_rights').select('may_edit')
      .eq('entity_id', params.id).maybeSingle(),
    db.schema('hopper').from('my_favorites').select('object_id')
      .eq('object', 'location').eq('object_id', params.loc).maybeSingle(),
  ])
  if (!l || !org) notFound()
  const mayEdit = rights?.may_edit === true
  const here = `/admin/organizations/${params.id}/locations/${params.loc}`

  const street = [l.address_line1, l.address_line2].filter(Boolean)
  const town = [l.city, [l.region, l.postal_code].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')

  return (
    <>
      <div className="hi">
        <h1 className="hi__name">
          {/* Anchored to the location's own name -- the same slot it takes in
              every list row. It used to trail the organization link below,
              with nothing holding it and the panel already saying it. */}
          <HeadOffice on={!!l.is_head_office} big />
          {l.name}
        </h1>
        <p className="scopeline">
          <span>{org.name}</span>
          <a href={`/admin/organizations/${org.id}`}>Back to {org.name}</a>
        </p>
      </div>

      <div className="desk">
        <div>
          <article className="locard">
            <div className="locard__map">
              {l.latitude != null ? (
                <LocationMap lat={l.latitude} lng={l.longitude} label={l.name} height={300} />
              ) : (
                <div className="lmap lmap--none" style={{ minHeight: 220, border: 0 }}>
                  <div>
                    No pin yet.
                    {mayEdit && (
                      <div style={{ marginTop: 10 }}>
                        <ActionForm action={repinLocation} label="Try pinning it" busy="Looking…">
                          <input type="hidden" name="id" value={l.id} />
                        </ActionForm>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Floating on the seam between the map and the details: heart
                  for anyone, pencil only where a save would be allowed. */}
              <div className="locard__acts">
                <FavoriteButton action={toggleFavorite} object="location"
                                objectId={l.id} back={here} on={!!fav} />
                {mayEdit && (
                  <a className="cbub" href="#edit" aria-label="Edit this location"
                     title="Edit this location">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                         strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z" />
                      <path d="M14.5 5.5 18.5 9.5" />
                    </svg>
                  </a>
                )}
              </div>
            </div>

            <div className="locard__body">
              <table className="tbl locard__tbl"><tbody>
                <tr><th style={{ width: 150 }}>Address</th>
                  <td>{street.length || town
                    ? <>{street.map((x: string, i: number) => <span key={i}>{x}<br /></span>)}
                        {town}{l.country ? <><br />{l.country}</> : null}</>
                    : <span className="muted">Nothing on file yet</span>}</td></tr>
                <tr><th>Organization</th>
                  <td><a href={`/admin/organizations/${org.id}`}>{org.name}</a>

                  </td></tr>
                <tr><th>Time zone</th>
                  <td><span className="mono">{l.time_zone}</span>
                    {' · '}<span className="tnum">{new Date().toLocaleTimeString('en-US',
                      { timeZone: l.time_zone, hour: 'numeric', minute: '2-digit' })} there now</span>
                  </td></tr>
                <tr><th>Pin</th>
                  <td>{l.latitude == null
                    ? <span className="pill">None</span>
                    : <><span className="mono">{Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}</span>
                        {' '}<span className="pill">{l.geocoded_at ? 'From the address' : 'Placed by hand'}</span></>}
                  </td></tr>
              </tbody></table>
            </div>
          </article>

          {mayEdit ? (
            <section className="sheet" id="edit">
              <div className="sheet__head">
                <span className="sheet__pencil" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z" /><path d="M14.5 5.5 18.5 9.5" />
                  </svg>
                </span>
                <span>
                  <b>Edit this location</b>
                  <small>Changing the address re-pins it. A pin you typed by hand is left alone.</small>
                </span>
                <a className="sheet__x" href="#">Close</a>
              </div>
              <div className="sheet__body">
                <ActionForm action={updateLocation} label="Save changes">
                  <input type="hidden" name="id" value={l.id} />
                  <div className="formrow">
                    <div><label htmlFor="n">Name</label>
                      <input className="field" id="n" name="name" defaultValue={l.name} required /></div>
                    <div><label htmlFor="a1">Street</label>
                      <input className="field" id="a1" name="address_line1"
                             autoComplete="address-line1" defaultValue={l.address_line1 ?? ''} /></div>
                  </div>
                  <div className="formrow">
                    <div><label htmlFor="a2">Suite, unit, floor</label>
                      <input className="field" id="a2" name="address_line2"
                             defaultValue={l.address_line2 ?? ''} /></div>
                    <div><label htmlFor="ct">City</label>
                      <input className="field" id="ct" name="city" defaultValue={l.city ?? ''} /></div>
                  </div>
                  <div className="formrow">
                    <div><label htmlFor="rg">State</label>
                      <input className="field" id="rg" name="region" defaultValue={l.region ?? ''} /></div>
                    <div><label htmlFor="pc">Postal code</label>
                      <input className="field" id="pc" name="postal_code"
                             defaultValue={l.postal_code ?? ''} /></div>
                    <div><label htmlFor="co">Country</label>
                      <input className="field" id="co" name="country" defaultValue={l.country ?? ''} /></div>
                    <div><label htmlFor="tz">Time zone</label>
                      <input className="field" id="tz" name="time_zone" defaultValue={l.time_zone} /></div>
                  </div>
                  <label className="checkline">
                    <input type="checkbox" name="is_head_office" defaultChecked={l.is_head_office} />
                    This is the head office
                  </label>
                  <div className="sheet__cut"><span>Overrule the pin</span></div>
                  <div className="formrow">
                    <div><label htmlFor="la">Latitude</label>
                      <input className="field" id="la" name="latitude" inputMode="decimal"
                             defaultValue={l.latitude ?? ''} /></div>
                    <div><label htmlFor="lo">Longitude</label>
                      <input className="field" id="lo" name="longitude" inputMode="decimal"
                             defaultValue={l.longitude ?? ''} /></div>
                  </div>
                  <p className="fine">
                    Leave these as they are and the address decides. Change them and they
                    are yours — nothing will overwrite them afterwards.
                  </p>
                </ActionForm>
              </div>
            </section>
          ) : (
            <p className="fine" style={{ marginTop: 22 }}>
              You can see this office but not change it. Its administrators can —
              they&rsquo;re named on <a href={`/admin/organizations/${org.id}`}>{org.name}</a>.
            </p>
          )}
        </div>

        <aside className="side">
          <div className="pane">
            <h3>This office</h3>
            <div className="fresh"><span>Organization</span><em>{org.name}</em></div>
            <div className="fresh"><span>Head office</span><em>{l.is_head_office ? 'Yes' : 'No'}</em></div>
            <div className="fresh"><span>Time zone</span>
              <em>{l.time_zone.split('/')[1]?.replace('_', ' ') ?? l.time_zone}</em></div>
            <div className="fresh"><span>You can</span>
              <em>{mayEdit ? 'Edit this' : 'Read this'}</em></div>
          </div>
        </aside>
      </div>
    </>
  )
}
