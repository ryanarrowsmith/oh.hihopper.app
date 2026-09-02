import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import { MODULES } from '@/lib/access'
import ActionForm from '@/components/ActionForm'
import { updateEntity, createDepartment, createLocation, setEntityAdmins,
         repinLocation } from '@/app/actions/admin'
import LocationMap from '@/components/LocationMap'

export default async function Entity({ params }: { params: { id: string } }) {
  const db = supabaseServer()
  const { data: e } = await db.schema('hopper')
    .from('entity').select('*').eq('id', params.id).maybeSingle()
  if (!e) notFound()

  const [{ data: departments }, { data: locations }, { data: mods },
         { data: people }, { data: grants }] = await Promise.all([
    db.schema('hopper').from('department').select('id, name').eq('entity_id', params.id).order('sort_order'),
    db.schema('hopper').from('location').select('*').eq('entity_id', params.id).order('name'),
    db.schema('hopper').from('entity_module').select('module_key, enabled').eq('entity_id', params.id),
    db.schema('hopper').from('person').select('id, full_name, role_title')
      .eq('active', true).order('full_name'),
    db.schema('hopper').from('access_grant').select('person_id, may_edit')
      .eq('object', 'entity').eq('scope_id', params.id),
  ])
  const admins = new Set((grants ?? []).filter((g: any) => g.may_edit).map((g: any) => g.person_id))
  const on = new Set((mods ?? []).filter((m: any) => m.enabled).map((m: any) => m.module_key))

  return (
    <>
      <div className="hi">
        <h1>{e.name}</h1>
        <p className="scopeline">
          <span>{e.legal_name ?? 'No legal name on file'} · {e.status}</span>
          <a href="/admin/organizations">Back to the portfolio</a>
        </p>
      </div>

      <Section title="This organization"
        blurb="Its name, its legal name, the mark on its plate, and where it stands.">
        <div className="add__body" style={{ marginTop: 0 }}>
          <ActionForm action={updateEntity} label="Save changes">
            <input type="hidden" name="id" value={e.id} />
            <div className="formrow">
              <div><label htmlFor="x-name">Name</label>
                <input className="field" id="x-name" name="name" defaultValue={e.name} required /></div>
              <div><label htmlFor="x-legal">Legal name</label>
                <input className="field" id="x-legal" name="legal_name"
                       defaultValue={e.legal_name ?? ''} /></div>
            </div>
            <div className="formrow">
              <div><label htmlFor="x-mark">Mark</label>
                <input className="field" id="x-mark" name="mark" maxLength={4}
                       defaultValue={e.mark ?? ''} /></div>
              <div><label htmlFor="x-status">Status</label>
                <select className="field" id="x-status" name="status" defaultValue={e.status}>
                  <option value="setup">Setting up</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select></div>
            </div>
          </ActionForm>
        </div>
      </Section>

      <Section title="Administrators"
        blurb="Only these people may edit this organization or add departments and offices to it. Everyone else can look. Naming somebody here also makes them an administrator of everything beneath this organization.">
        {(people?.length ?? 0) === 0 ? (
          <p className="empty">Nobody on the roster yet — add people first.</p>
        ) : (
          <div className="add__body" style={{ marginTop: 0 }}>
            <ActionForm action={setEntityAdmins} label="Save administrators">
              <input type="hidden" name="entity_id" value={e.id} />
              {people!.map((p: any) => (
                <label className="checkline" key={p.id}>
                  <input type="checkbox" name="admin" value={p.id}
                         defaultChecked={admins.has(p.id)} />
                  <b style={{ fontWeight: 700 }}>{p.full_name}</b>
                  {p.role_title && <span className="muted">· {p.role_title}</span>}
                </label>
              ))}
              <p className="fine">
                Standing somebody down leaves them able to see this organization.
                Taking away their sight of it is a different decision, and it lives
                on <a href="/admin/permissions">Permissions</a> where it reads as one.
              </p>
            </ActionForm>
          </div>
        )}
      </Section>

      <Section title="Departments" blurb="A department hangs off this organization and has no page of its own."
        action={null}>
        {(departments?.length ?? 0) === 0 ? <p className="empty">No departments yet.</p> : (
          <div className="items">
            {departments!.map((d: any) => (
              <div className="item" key={d.id}><div><b>{d.name}</b></div></div>
            ))}
          </div>
        )}
        <details className="add">
          <summary>Add a department</summary>
          <div className="add__body">
            <ActionForm action={createDepartment} label="Add it" busy="Adding…">
              <input type="hidden" name="entity_id" value={e.id} />
              <div><label htmlFor="d-name">Name</label>
                <input className="field" id="d-name" name="name" required
                       placeholder="Dispatch" /></div>
            </ActionForm>
          </div>
        </details>
      </Section>

      <Section title="Office locations"
        blurb="A location supplies a person's address and weather. Its time zone is a fact about the office."
        action={null}>
        {(locations?.length ?? 0) === 0 ? <p className="empty">No locations yet.</p> : (
          <div className="tblwrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Address</th><th>Time zone</th><th>Map</th></tr></thead>
            <tbody>{locations!.map((l: any) => (
              <tr key={l.id}>
                <td>
                  <a href={`/admin/organizations/${e.id}/locations/${l.id}`}
                     style={{ fontWeight: 800, color: 'var(--steel-ink)' }}>{l.name}</a>
                  {l.is_head_office && <><br /><span className="pill pill--good">Head office</span></>}
                </td>
                <td>
                  {[l.address_line1, l.address_line2].filter(Boolean).map((x: string, i: number) =>
                    <span key={i}>{x}<br /></span>)}
                  {[l.city, [l.region, l.postal_code].filter(Boolean).join(' ')]
                    .filter(Boolean).join(', ') || <span className="muted">No address yet</span>}
                </td>
                <td className="mono" style={{ fontSize: 12.5 }}>{l.time_zone}</td>
                <td>{l.latitude != null
                  ? <span className="pill pill--good">Pinned</span>
                  : <span className="pill">No pin</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}

        {(locations?.length ?? 0) > 0 && (
          <div className="maps">
            {locations!.map((l: any) => (
              l.latitude != null
                ? <a key={l.id} href={`/admin/organizations/${e.id}/locations/${l.id}`}
                     style={{ textDecoration: 'none' }}>
                    <LocationMap lat={l.latitude} lng={l.longitude} label={l.name} />
                  </a>
                : <div className="lmap lmap--none" key={l.id} style={{ minHeight: 190 }}>
                    <div>
                      <b style={{ display: 'block', color: 'var(--ink-2)', marginBottom: 6 }}>
                        {l.name}
                      </b>
                      No pin yet. Mapbox could not place this address, or maps
                      are not configured.
                      <div style={{ marginTop: 10 }}>
                        <ActionForm action={repinLocation} label="Try pinning it"
                                    busy="Looking…">
                          <input type="hidden" name="id" value={l.id} />
                        </ActionForm>
                      </div>
                    </div>
                  </div>
            ))}
          </div>
        )}

        <details className="add">
          <summary>Add a location</summary>
          <div className="add__body">
            <ActionForm action={createLocation} label="Add it" busy="Adding…">
              <input type="hidden" name="entity_id" value={e.id} />
              <div className="formrow">
                <div><label htmlFor="l-name">Name</label>
                  <input className="field" id="l-name" name="name" required
                         placeholder="Tulsa Yard" /></div>
                <div><label htmlFor="l-addr">Street</label>
                  <input className="field" id="l-addr" name="address_line1"
                         autoComplete="address-line1" placeholder="4321 S Sheridan Rd" /></div>
              </div>
              <div className="formrow">
                <div><label htmlFor="l-addr2">Suite, unit, floor</label>
                  <input className="field" id="l-addr2" name="address_line2"
                         autoComplete="address-line2" /></div>
                <div><label htmlFor="l-country">Country</label>
                  <input className="field" id="l-country" name="country"
                         defaultValue="United States" autoComplete="country-name" /></div>
              </div>
              <div className="formrow">
                <div><label htmlFor="l-city">City</label>
                  <input className="field" id="l-city" name="city" /></div>
                <div><label htmlFor="l-region">State</label>
                  <input className="field" id="l-region" name="region" placeholder="OK" /></div>
                <div><label htmlFor="l-zip">Postal code</label>
                  <input className="field" id="l-zip" name="postal_code" /></div>
                <div><label htmlFor="l-tz">Time zone</label>
                  <input className="field" id="l-tz" name="time_zone"
                         defaultValue="America/Chicago" /></div>
              </div>
              <p className="fine">
                The pin is worked out from the address when you save. Type
                coordinates only to overrule it — a hand-placed pin is never
                re-resolved, because somebody moved it for a reason.
              </p>
              <div className="formrow">
                <div><label htmlFor="l-lat">Latitude</label>
                  <input className="field" id="l-lat" name="latitude" inputMode="decimal"
                         placeholder="36.0526" /></div>
                <div><label htmlFor="l-lng">Longitude</label>
                  <input className="field" id="l-lng" name="longitude" inputMode="decimal"
                         placeholder="-95.9074" /></div>
              </div>
              <label className="checkline" style={{ textTransform: 'none', letterSpacing: 0 }}>
                <input type="checkbox" name="is_head_office" />
                This is the head office
              </label>
              <p className="fine">
                One head office per organization — the database enforces it, so a second
                one is refused rather than quietly accepted.
              </p>
            </ActionForm>
          </div>
        </details>
      </Section>

      <Section title="Modules"
        blurb="What this organization runs. Switching one off never deletes — turn it back on and it is where you left it.">
        <div className="tblwrap"><table className="tbl">
          <thead><tr><th>Module</th><th>State</th></tr></thead>
          <tbody>{MODULES.map((m) => (
            <tr key={m.key}>
              <td><b>{m.label}</b></td>
              <td>{on.has(m.key)
                ? <span className="pill pill--good">On</span>
                : <span className="pill">Off</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
    </>
  )
}
