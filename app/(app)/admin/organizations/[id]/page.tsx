import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import ActionForm from '@/components/ActionForm'
import LocationMap from '@/components/LocationMap'
import Avatar from '@/components/Avatar'
import FavoriteButton from '@/components/CardActions'
import { MODULES } from '@/lib/access'
import {
  updateEntity, createDepartment, createLocation, setEntityAdmins,
  addAdministrator, repinLocation, toggleFavorite,
} from '@/app/actions/admin'

const Pencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z" /><path d="M14.5 5.5 18.5 9.5" />
  </svg>
)
const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)

export default async function Entity({ params }: { params: { id: string } }) {
  const db = supabaseServer()
  const { data: e } = await db.schema('hopper')
    .from('entity').select('*').eq('id', params.id).maybeSingle()
  if (!e) notFound()

  const [{ data: departments }, { data: locations }, { data: mods },
         { data: people }, { data: grants }, { data: rights }, { data: fav }] =
    await Promise.all([
      db.schema('hopper').from('department')
        .select('id, name, leader_person_id').eq('entity_id', params.id).order('sort_order'),
      db.schema('hopper').from('location').select('*').eq('entity_id', params.id).order('name'),
      db.schema('hopper').from('entity_module')
        .select('module_key, enabled').eq('entity_id', params.id),
      db.schema('hopper').from('person')
        .select('id, full_name, role_title, photo_url').eq('active', true).order('full_name'),
      db.schema('hopper').from('access_grant')
        .select('person_id, may_edit').eq('object', 'entity').eq('scope_id', params.id),
      db.schema('hopper').from('entity_rights').select('may_edit').eq('entity_id', params.id).maybeSingle(),
      db.schema('hopper').from('my_favorites')
        .select('object_id').eq('object', 'entity').eq('object_id', params.id).maybeSingle(),
    ])

  const mayEdit = rights?.may_edit === true
  const on = new Set((mods ?? []).filter((m: any) => m.enabled).map((m: any) => m.module_key))
  const roster = people ?? []
  const byPerson = new Map(roster.map((p: any) => [p.id, p]))
  const adminIds = new Set((grants ?? []).filter((g: any) => g.may_edit).map((g: any) => g.person_id))
  const admins = roster.filter((p: any) => adminIds.has(p.id))

  return (
    <>
      <div className="hi">
        <h1>{e.name}</h1>
        <p className="scopeline">
          <span>{e.legal_name ?? 'No legal name on file'} · {e.status}</span>
          <a href="/admin/organizations">Back to the portfolio</a>
        </p>
      </div>

      {/* ---------------------------------------------- the organization ---- */}
      <section className="sec">
        <div className="sec__h">
          <div className="sec__t">
            <h2>This organization</h2>
            <p>What it is called, where it sits, and whether it is running.</p>
          </div>
        </div>

        <div className="locard">
          <div className="locard__body">
            <table className="tbl locard__tbl"><tbody>
              <tr><th style={{ width: 150 }}>Name</th><td><b>{e.name}</b></td></tr>
              <tr><th>Legal name</th>
                <td>{e.legal_name ?? <span className="muted">Nothing on file</span>}</td></tr>
              <tr><th>Mark</th>
                <td>{e.mark ? <span className="plate">{e.mark}</span> : <span className="muted">—</span>}</td></tr>
              <tr><th>Status</th>
                <td><span className={`pill ${e.status === 'active' ? 'pill--good' : 'pill--setup'}`}>
                  {e.status}</span></td></tr>
              <tr><th>Contains</th>
                <td>{departments?.length ?? 0} departments · {locations?.length ?? 0} locations</td></tr>
            </tbody></table>
          </div>
        </div>

        <div className="underbox">
          <FavoriteButton action={toggleFavorite} object="entity" objectId={e.id}
                          back={`/admin/organizations/${e.id}`} on={!!fav} />
          {mayEdit && (
            <a className="cbub" href="#edit-org" aria-label="Edit this organization"
               title="Edit this organization"><Pencil /></a>
          )}
        </div>

        {mayEdit && (
          <section className="sheet" id="edit-org">
              <div className="sheet__head">
                <span className="sheet__pencil" aria-hidden="true"><Pencil /></span>
              <span><b>Edit this organization</b>
                <small>Its name, legal name, the mark on its plate, and where it stands.</small></span>
                <a className="sheet__x" href="#">Close</a>
              </div>
            <div className="sheet__body">
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
          </section>
        )}
      </section>

      {/* ---------------------------------------------- administrators ------ */}
      <Section title="Administrators"
        blurb="Only these people may edit this organization or add departments and offices to it. Everyone else can look. Naming somebody here also makes them an administrator of everything beneath this organization.">
        {admins.length === 0 ? (
          <p className="empty">
            Nobody named yet, so only account owners can edit this one.
          </p>
        ) : (
          <div className="plist">
            {admins.map((p: any) => (
              <div className="prow" key={p.id}>
                <Avatar name={p.full_name} src={p.photo_url} size={38} />
                <div>
                  <div className="prow__name">{p.full_name}</div>
                  <div className="prow__role">
                    {p.role_title ?? <span className="muted">No title on file</span>}
                  </div>
                </div>
                <span className="prow__tail pill pill--good">Administrator</span>
              </div>
            ))}
          </div>
        )}

        {mayEdit && (
          <>
            <div className="underbox">
              <a className="cbub" href="#edit-admins" title="Change who administers this"
                 aria-label="Change who administers this"><Pencil /></a>
              <a className="cbub" href="#add-admin" title="Add an administrator"
                 aria-label="Add an administrator"><Plus /></a>
            </div>

            <section className="sheet" id="edit-admins">
              <div className="sheet__head">
                <span className="sheet__pencil" aria-hidden="true"><Pencil /></span>
                <span><b>Change who administers this</b>
                  <small>Tick the people on the roster who should be able to edit it.</small></span>
                <a className="sheet__x" href="#">Close</a>
              </div>
              <div className="sheet__body">
                {roster.length === 0 ? (
                  <p className="empty">Nobody on the roster yet.</p>
                ) : (
                  <ActionForm action={setEntityAdmins} label="Save administrators">
                    <input type="hidden" name="entity_id" value={e.id} />
                    {roster.map((p: any) => (
                      <label className="checkline" key={p.id}>
                        <input type="checkbox" name="admin" value={p.id}
                               defaultChecked={adminIds.has(p.id)} />
                        <Avatar name={p.full_name} src={p.photo_url} size={26} />
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
                )}
              </div>
            </section>

            <section className="sheet" id="add-admin">
              <div className="sheet__head">
                <span className="sheet__pencil" aria-hidden="true"><Plus /></span>
                <span><b>Add an administrator</b>
                  <small>Somebody new — they go on the roster and administer this in one go.</small></span>
                <a className="sheet__x" href="#">Close</a>
              </div>
              <div className="sheet__body">
                <ActionForm action={addAdministrator} label="Add them" busy="Adding…">
                  <input type="hidden" name="entity_id" value={e.id} />
                  <div className="formrow">
                    <div><label htmlFor="ad-name">Full name</label>
                      <input className="field" id="ad-name" name="full_name" required /></div>
                    <div><label htmlFor="ad-email">Email</label>
                      <input className="field" id="ad-email" name="email" type="email" /></div>
                  </div>
                  <div><label htmlFor="ad-role">Title</label>
                    <input className="field" id="ad-role" name="role_title"
                           placeholder="Operations manager" /></div>
                  <p className="fine">
                    This puts them on the roster. It does not give them a login — the
                    platform owns identity, and an invitation is a separate act.
                  </p>
                </ActionForm>
              </div>
            </section>
          </>
        )}
      </Section>

      {/* ---------------------------------------------- departments --------- */}
      <Section title="Departments"
        blurb="A department hangs off this organization and has no page of its own — it appears here.">
        {(departments?.length ?? 0) === 0 ? (
          <p className="empty">No departments yet.</p>
        ) : (
          <div className="plist">
            {departments!.map((d: any) => {
              const lead: any = d.leader_person_id ? byPerson.get(d.leader_person_id) : null
              return (
                <div className="prow" key={d.id}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="prow__name">{d.name}</div>
                  </div>
                  {lead ? (
                    <span className="prow__tail" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <Avatar name={lead.full_name} src={lead.photo_url} size={30} />
                      <span>
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{lead.full_name}</span>
                        <span className="prow__role">{lead.role_title ?? 'Leads this department'}</span>
                      </span>
                    </span>
                  ) : (
                    <span className="prow__tail muted" style={{ fontSize: 13 }}>No leader named</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {mayEdit && (
          <>
            <div className="underbox">
              <a className="cbub" href="#add-dept" title="Add a department"
                 aria-label="Add a department"><Plus /></a>
            </div>
            <section className="sheet" id="add-dept">
              <div className="sheet__head">
                <span className="sheet__pencil" aria-hidden="true"><Plus /></span>
                <span><b>Add a department</b><small>And say who runs it, if anyone does yet.</small></span>
                <a className="sheet__x" href="#">Close</a>
              </div>
              <div className="sheet__body">
                <ActionForm action={createDepartment} label="Add it" busy="Adding…">
                  <input type="hidden" name="entity_id" value={e.id} />
                  <div className="formrow">
                    <div><label htmlFor="d-name">Name</label>
                      <input className="field" id="d-name" name="name" required
                             placeholder="Dispatch" /></div>
                    <div><label htmlFor="d-lead">Leader</label>
                      <select className="field" id="d-lead" name="leader_person_id" defaultValue="">
                        <option value="">Nobody yet</option>
                        {roster.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}{p.role_title ? ` — ${p.role_title}` : ''}
                          </option>
                        ))}
                      </select></div>
                  </div>
                  <p className="fine">
                    A department without a named leader is a real and common state, not
                    something to be filled in for the sake of it.
                  </p>
                </ActionForm>
              </div>
            </section>
          </>
        )}
      </Section>

      {/* ---------------------------------------------- locations ----------- */}
      <Section title="Office locations"
        blurb="A location supplies a person's address and the map. Its time zone is a fact about the office.">
        {(locations?.length ?? 0) === 0 ? <p className="empty">No locations yet.</p> : (
          <div className="maps">
            {locations!.map((l: any) => (
              <a key={l.id} href={`/admin/organizations/${e.id}/locations/${l.id}`}
                 className="mapcard">
                {l.latitude != null
                  ? <LocationMap lat={l.latitude} lng={l.longitude} label={l.name} />
                  : <div className="lmap lmap--none" style={{ minHeight: 150 }}>
                      <div><b style={{ display: 'block', color: 'var(--ink-2)' }}>{l.name}</b>
                        No pin yet</div>
                    </div>}
                <span className="mapcard__sub">
                  {[l.city, l.region].filter(Boolean).join(', ') || 'No address yet'}
                  {l.is_head_office && ' · Head office'}
                </span>
              </a>
            ))}
          </div>
        )}

        {mayEdit && (
          <>
            <div className="underbox">
              <a className="cbub" href="#add-loc" title="Add a location"
                 aria-label="Add a location"><Plus /></a>
            </div>
            <section className="sheet" id="add-loc">
              <div className="sheet__head">
                <span className="sheet__pencil" aria-hidden="true"><Plus /></span>
                <span><b>Add a location</b>
                  <small>The pin is worked out from the address when you save.</small></span>
                <a className="sheet__x" href="#">Close</a>
              </div>
              <div className="sheet__body">
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
                      <input className="field" id="l-addr2" name="address_line2" /></div>
                    <div><label htmlFor="l-city">City</label>
                      <input className="field" id="l-city" name="city" /></div>
                  </div>
                  <div className="formrow">
                    <div><label htmlFor="l-region">State</label>
                      <input className="field" id="l-region" name="region" placeholder="OK" /></div>
                    <div><label htmlFor="l-zip">Postal code</label>
                      <input className="field" id="l-zip" name="postal_code" /></div>
                    <div><label htmlFor="l-country">Country</label>
                      <input className="field" id="l-country" name="country"
                             defaultValue="United States" /></div>
                    <div><label htmlFor="l-tz">Time zone</label>
                      <input className="field" id="l-tz" name="time_zone"
                             defaultValue="America/Chicago" /></div>
                  </div>
                  <label className="checkline">
                    <input type="checkbox" name="is_head_office" />
                    This is the head office
                  </label>
                  <p className="fine">One head office per organization — the database enforces it.</p>
                </ActionForm>
              </div>
            </section>
          </>
        )}
      </Section>

      {/* ---------------------------------------------- modules ------------- */}
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
        {mayEdit && (
          <p className="fine" style={{ marginTop: 12 }}>
            Set these across the whole portfolio on <a href="/admin/modules">Modules</a>.
          </p>
        )}
      </Section>
    </>
  )
}
