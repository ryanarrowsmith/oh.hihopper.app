import { supabaseServer } from '@/lib/supabase/server'
import Choice from '@/components/Choice'
import { EditableSection, RowForm, Toggle } from '@/components/RowEdit'
import { HeadOffice, PinMark } from '@/components/Icons'
import { createLocation } from '@/app/actions/admin'

export default async function Page() {
  const db = supabaseServer()
  const [{ data: rows }, { data: entities }, { data: rights }] = await Promise.all([
    db.schema('hopper').from('location').select('*').order('name'),
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
  ])

  const orgs = entities ?? []
  const byOrg = new Map(orgs.map((e: any) => [e.id, e.name]))
  // Where this person may add. The plus is not rendered when the answer is
  // nowhere -- an offer you cannot accept is worse than no offer.
  const mayAddTo = orgs.filter((e: any) =>
    (rights ?? []).some((r: any) => r.entity_id === e.id && r.may_edit))

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Locations</h1>
          <p className="scopeline">
            <span>Every office in the organizations you can open.</span>
          </p>
        </div>
      </div>

      <EditableSection
        title="Across the portfolio"
        blurb={`${rows?.length ?? 0} in the organizations you can open. A location keeps its own page — the name opens it.`}
        addLabel="Adding a location"
        addForm={mayAddTo.length ? (
          <RowForm action={createLocation} label="Add it" busy="Adding…">
            <div className="formrow formrow--one">
              <div><label htmlFor="al-org">Organization</label>
                <Choice id="al-org" name="entity_id" required defaultValue={mayAddTo[0].id}
                        options={mayAddTo.map((e: any) => ({ value: e.id, label: e.name }))} /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="al-name">Name</label>
                <input className="field" id="al-name" name="name" required placeholder="Tulsa Yard" /></div>
              <div><label htmlFor="al-addr">Street</label>
                <input className="field" id="al-addr" name="address_line1"
                       autoComplete="address-line1" placeholder="4321 S Sheridan Rd" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="al-addr2">Suite, unit, floor</label>
                <input className="field" id="al-addr2" name="address_line2" /></div>
              <div><label htmlFor="al-city">City</label>
                <input className="field" id="al-city" name="city" placeholder="Tulsa" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="al-region">State</label>
                <input className="field" id="al-region" name="region" placeholder="OK" /></div>
              <div><label htmlFor="al-zip">Postal code</label>
                <input className="field" id="al-zip" name="postal_code" placeholder="74145" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="al-country">Country</label>
                <input className="field" id="al-country" name="country" defaultValue="United States" /></div>
              <div><label htmlFor="al-tz">Time zone</label>
                <input className="field" id="al-tz" name="time_zone" defaultValue="America/Chicago" /></div>
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
        {(rows?.length ?? 0) === 0 ? <p className="empty">Nothing here yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1.5fr) minmax(0,1.4fr) minmax(0,1fr) 56px' }}>
            <div className="rhead">
              <span>Name</span><span>Organization</span><span>City</span>
              <span className="rhead--end">Pin</span>
            </div>
            {rows!.map((l: any) => (
              <div className="rrec" key={l.id}>
                <div className="rrec__face">
                  <span className="rcell rcell--lead">
                    <HeadOffice on={!!l.is_head_office} />
                    <a href={`/admin/organizations/${l.entity_id}/locations/${l.id}`}
                       style={{ fontWeight: 800, color: 'var(--steel-ink)', textDecoration: 'none' }}>
                      {l.name}
                    </a>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Organization</span>
                    <span className="rcell__val">
                      <a href={`/admin/organizations/${l.entity_id}`}
                         style={{ fontWeight: 700, color: 'var(--steel-ink)', textDecoration: 'none' }}>
                        {byOrg.get(l.entity_id) ?? '—'}
                      </a>
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">City</span>
                    <span className="rcell__val">
                      {[l.city, l.region].filter(Boolean).join(', ') || <span className="muted">—</span>}
                    </span>
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
