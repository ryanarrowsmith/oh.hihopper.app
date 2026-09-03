import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { EditableSection, RowForm, Toggle } from '@/components/RowEdit'
import { HeadOffice, PinMark } from '@/components/Icons'
import { addressOf } from '@/lib/mapbox'
import { createLocation } from '@/app/actions/admin'

/**
 * One organization's offices. The breadcrumb on a location page named this
 * screen before it existed, which is how it came to link into a 404: the trail
 * was describing a shape the app had not built yet.
 */
export default async function Page({ params }: { params: { id: string } }) {
  const db = supabaseServer()
  const { data: org } = await db.schema('hopper')
    .from('entity').select('id, name').eq('id', params.id).maybeSingle()
  if (!org) notFound()

  const [{ data: rows }, { data: rights }] = await Promise.all([
    db.schema('hopper').from('location').select('*').eq('entity_id', params.id).order('name'),
    db.schema('hopper').from('entity_rights')
      .select('may_edit').eq('entity_id', params.id).maybeSingle(),
  ])
  const mayEdit = rights?.may_edit === true

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          {/* No scopeline. The trail above reads
              ... / On Call Services and Rentals / Locations, so naming the
              organization again and then linking back to it put the same word
              on the screen three times, twice as a link. */}
          <h1>Locations</h1>
        </div>
      </div>

      <EditableSection
        title="Offices"
        blurb={`${rows?.length ?? 0} in ${org.name}. A location supplies a person's address and the map, and keeps its own page — the name opens it.`}
        addLabel="Adding a location"
        addForm={mayEdit ? (
          <RowForm action={createLocation} label="Add it" busy="Adding…">
            <input type="hidden" name="entity_id" value={org.id} />
            <div className="formrow">
              <div><label htmlFor="ol-name">Name</label>
                <input className="field" id="ol-name" name="name" required placeholder="Tulsa Yard" /></div>
              <div><label htmlFor="ol-addr">Street</label>
                <input className="field" id="ol-addr" name="address_line1"
                       autoComplete="address-line1" placeholder="4321 S Sheridan Rd" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="ol-addr2">Suite, unit, floor</label>
                <input className="field" id="ol-addr2" name="address_line2" /></div>
              <div><label htmlFor="ol-city">City</label>
                <input className="field" id="ol-city" name="city" placeholder="Tulsa" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="ol-region">State</label>
                <input className="field" id="ol-region" name="region" placeholder="OK" /></div>
              <div><label htmlFor="ol-zip">Postal code</label>
                <input className="field" id="ol-zip" name="postal_code" placeholder="74145" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="ol-country">Country</label>
                <input className="field" id="ol-country" name="country" defaultValue="United States" /></div>
              <div><label htmlFor="ol-tz">Time zone</label>
                <input className="field" id="ol-tz" name="time_zone" defaultValue="America/Chicago" /></div>
            </div>
            <div style={{ marginTop: 6 }}>
              <Toggle name="is_head_office" label="This is the head office" />
            </div>
            <p className="fine" style={{ marginTop: 8 }}>
              One head office per organization — the database enforces it. The pin is
              worked out from the address when you save.
            </p>
          </RowForm>
        ) : undefined}
      >
        {(rows?.length ?? 0) === 0 ? (
          <p className="empty">No locations yet.</p>
        ) : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1.1fr) minmax(0,1.6fr) 96px 56px' }}>
            <div className="rhead">
              <span>Name</span><span>Address</span>
              <span className="rhead--endish">Head office</span>
              <span className="rhead--end">Pin</span>
            </div>
            {rows!.map((l: any) => (
              <div className="rrec" key={l.id}>
                <div className="rrec__face">
                  <span className="rcell rcell--lead">
                    <a href={`/admin/organizations/${org.id}/locations/${l.id}`}
                       style={{ fontWeight: 800, color: 'var(--steel-ink)', textDecoration: 'none' }}>
                      {l.name}
                    </a>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Address</span>
                    <span className="rcell__val">
                      {addressOf(l) || <span className="muted">No address yet</span>}
                    </span>
                  </span>
                  {/* Its own column, right of the name and left of the pin. Sharing the
                      pin's cell would have labelled it "Pin" on a phone, where every
                      cell prints its label; sitting in the name cell put a mark ahead
                      of the name on some rows and a placeholder on the rest. */}
                  <span className={`rcell rcell--endish${l.is_head_office ? '' : ' rcell--empty'}`}>
                    <span className="rcell__lab">Head office</span>
                    <span className="rcell__val"><HeadOffice on={!!l.is_head_office} /></span>
                  </span>
                  <span className="rcell rcell--end">
                    <span className="rcell__lab">Pin</span>
                    <span className="rcell__val"><PinMark on={l.latitude != null} /></span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </EditableSection>
    </>
  )
}
