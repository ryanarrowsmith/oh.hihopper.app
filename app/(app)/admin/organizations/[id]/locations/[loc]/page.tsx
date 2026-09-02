import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import ActionForm from '@/components/ActionForm'
import LocationMap from '@/components/LocationMap'
import { updateLocation, repinLocation } from '@/app/actions/admin'

export default async function Location({ params }: { params: { id: string; loc: string } }) {
  const db = supabaseServer()
  const [{ data: l }, { data: org }] = await Promise.all([
    db.schema('hopper').from('location').select('*').eq('id', params.loc).maybeSingle(),
    db.schema('hopper').from('entity').select('id, name').eq('id', params.id).maybeSingle(),
  ])
  if (!l || !org) notFound()

  const street = [l.address_line1, l.address_line2].filter(Boolean)
  const town = [l.city, [l.region, l.postal_code].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')

  return (
    <>
      <div className="hi">
        <h1>{l.name}</h1>
        <p className="scopeline">
          <span>{org.name}{l.is_head_office ? ' · Head office' : ''}</span>
          <a href={`/admin/organizations/${org.id}`}>Back to {org.name}</a>
        </p>
      </div>

      <div className="desk">
        <div>
          <Section title="Where it is"
            blurb="The address people post to, and the pin the map draws from.">
            {l.latitude != null ? (
              <LocationMap lat={l.latitude} lng={l.longitude} label={l.name} height={280} />
            ) : (
              <div className="lmap lmap--none" style={{ minHeight: 200 }}>
                <div>
                  No pin yet — the address has not resolved, or maps are not configured.
                  <div style={{ marginTop: 10 }}>
                    <ActionForm action={repinLocation} label="Try pinning it" busy="Looking…">
                      <input type="hidden" name="id" value={l.id} />
                    </ActionForm>
                  </div>
                </div>
              </div>
            )}

            <div className="tblwrap" style={{ marginTop: 14 }}>
              <table className="tbl"><tbody>
                <tr><th style={{ width: 160 }}>Address</th>
                  <td>{street.length || town
                    ? <>{street.map((x: string, i: number) => <span key={i}>{x}<br /></span>)}
                        {town}{l.country ? <><br />{l.country}</> : null}</>
                    : <span className="muted">Nothing on file yet</span>}</td></tr>
                <tr><th>Time zone</th><td className="mono">{l.time_zone}</td></tr>
                <tr><th>Pin</th>
                  <td>{l.latitude == null
                    ? <span className="pill">None</span>
                    : <><span className="mono">{Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}</span>
                        {' '}<span className="pill">{l.geocoded_at ? 'From the address' : 'Placed by hand'}</span></>}
                  </td></tr>
              </tbody></table>
            </div>
          </Section>

          <Section title="Edit this location"
            blurb="Changing the address re-pins it. A pin you typed by hand is left alone.">
            <div className="add__body" style={{ marginTop: 0 }}>
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
                <div className="formrow">
                  <div><label htmlFor="la">Latitude</label>
                    <input className="field" id="la" name="latitude" inputMode="decimal"
                           defaultValue={l.latitude ?? ''} /></div>
                  <div><label htmlFor="lo">Longitude</label>
                    <input className="field" id="lo" name="longitude" inputMode="decimal"
                           defaultValue={l.longitude ?? ''} /></div>
                </div>
                <p className="fine">
                  Leave the coordinates as they are and the address decides. Change them
                  and they are yours — nothing will overwrite them afterwards.
                </p>
              </ActionForm>
            </div>
          </Section>
        </div>

        <aside className="side">
          <div className="pane">
            <h3>This office</h3>
            <div className="fresh"><span>Organization</span>
              <em>{org.name}</em></div>
            <div className="fresh"><span>Head office</span>
              <em>{l.is_head_office ? 'Yes' : 'No'}</em></div>
            <div className="fresh"><span>Time zone</span>
              <em>{l.time_zone.split('/')[1]?.replace('_', ' ') ?? l.time_zone}</em></div>
            <div className="fresh"><span>Local time</span>
              <em>{new Date().toLocaleTimeString('en-US',
                { timeZone: l.time_zone, hour: 'numeric', minute: '2-digit' })}</em></div>
          </div>
        </aside>
      </div>
    </>
  )
}
