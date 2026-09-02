import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import LocationMap from '@/components/LocationMap'
import Avatar from '@/components/Avatar'
import OrgLogo from '@/components/OrgLogo'
import ModuleToggle from '@/components/ModuleToggle'
import FavoriteButton from '@/components/CardActions'
import { EditableSection, RecordRow, RowForm, RowDanger, Toggle } from '@/components/RowEdit'
import Choice from '@/components/Choice'
import { MODULES } from '@/lib/access'
import {
  updateEntity, createDepartment, updateDepartment, deleteDepartment,
  createLocation, addAdministrator, updateAdministrator, standDownAdministrator,
  toggleFavorite,
} from '@/app/actions/admin'

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

  // The database decides. Every add, edit and delete below is rendered only
  // when it says yes -- not greyed out, not present-but-refusing. Everyone
  // else gets the page to read, which is the whole of what they are owed.
  const mayEdit = rights?.may_edit === true
  const on = new Set((mods ?? []).filter((m: any) => m.enabled).map((m: any) => m.module_key))
  const roster = people ?? []
  const byPerson = new Map(roster.map((p: any) => [p.id, p]))
  const adminIds = new Set((grants ?? []).filter((g: any) => g.may_edit).map((g: any) => g.person_id))
  const admins = roster.filter((p: any) => adminIds.has(p.id))

  const leaderOptions = [
    { value: '', label: 'Nobody yet' },
    ...roster.map((p: any) => ({ value: p.id, label: p.full_name, hint: p.role_title ?? undefined })),
  ]
  const statusOptions = [
    { value: 'setup', label: 'Setting up' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>{e.name}</h1>
          <p className="scopeline">
            <span>{e.legal_name ?? 'No legal name on file'} · {e.status}</span>
            <a href="/admin/organizations">Back to the portfolio</a>
          </p>
        </div>
        <OrgLogo name={e.name} mark={e.mark} src={e.logo_url} />
      </div>

      {/* ---------------------------------------------- the organization ---- */}
      <EditableSection
        title="This organization"
        blurb="What it is called, where it sits, and whether it is running."
        editLabel="Edit this organization"
        actions={
          <FavoriteButton action={toggleFavorite} object="entity" objectId={e.id}
                          back={`/admin/organizations/${e.id}`} on={!!fav} />
        }
        editForm={mayEdit ? (
          <>
            <div className="rrec__lab">Editing this organization</div>
            <RowForm action={updateEntity} label="Save changes">
              <input type="hidden" name="id" value={e.id} />
              <div className="formrow">
                <div><label htmlFor="x-name">Name</label>
                  <input className="field" id="x-name" name="name" defaultValue={e.name} required /></div>
                <div><label htmlFor="x-legal">Legal name</label>
                  <input className="field" id="x-legal" name="legal_name"
                         defaultValue={e.legal_name ?? ''} /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="x-mark">Mark</label>
                  <input className="field" id="x-mark" name="mark" maxLength={4}
                         defaultValue={e.mark ?? ''} /></div>
                <div><label htmlFor="x-status">Status</label>
                  <Choice id="x-status" name="status" options={statusOptions}
                          defaultValue={e.status} /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label htmlFor="x-logo">Logo</label>
                <input className="field" id="x-logo" name="logo_url" type="url"
                       defaultValue={e.logo_url ?? ''}
                       placeholder="https://…" />
                <p className="fine" style={{ marginTop: 6 }}>
                  Leave it empty and the header shows the mark instead, the same
                  way a person without a photograph shows their initials.
                </p>
              </div>
            </RowForm>
          </>
        ) : undefined}
      >
        <div className="locard">
          <div className="locard__body">
            <table className="tbl locard__tbl"><tbody>
              <tr><th style={{ width: 150 }}>Name</th><td><b>{e.name}</b></td></tr>
              <tr><th>Legal name</th>
                <td>{e.legal_name ?? <span className="muted">Nothing on file</span>}</td></tr>
              <tr><th>Mark</th>
                <td>{e.mark ? <span className="plate">{e.mark}</span> : <span className="muted">—</span>}</td></tr>
              <tr><th>Logo</th>
                <td>{e.logo_url ? 'On file' : <span className="muted">None — showing the mark</span>}</td></tr>
              <tr><th>Status</th>
                <td><span className={`pill ${e.status === 'active' ? 'pill--good' : 'pill--setup'}`}>
                  {e.status}</span></td></tr>
              <tr><th>Contains</th>
                <td>{departments?.length ?? 0} departments · {locations?.length ?? 0} locations</td></tr>
            </tbody></table>
          </div>
        </div>
      </EditableSection>

      {/* ---------------------------------------------- administrators ------ */}
      <EditableSection
        title="Administrators"
        blurb="Only these people may edit this organization or add departments and offices to it. Everyone else can look. Naming somebody here also makes them an administrator of everything beneath this organization."
        addLabel="Adding an administrator"
        addForm={mayEdit ? (
            <RowForm action={addAdministrator} label="Add them" busy="Adding…">
              <input type="hidden" name="entity_id" value={e.id} />
              <div className="formrow">
                <div><label htmlFor="ad-name">Full name</label>
                  <input className="field" id="ad-name" name="full_name" required /></div>
                <div><label htmlFor="ad-email">Email</label>
                  <input className="field" id="ad-email" name="email" type="email" /></div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label htmlFor="ad-role">Title</label>
                <input className="field" id="ad-role" name="role_title"
                       placeholder="Operations manager" />
              </div>
              <p className="fine" style={{ marginTop: 10 }}>
                This puts them on the roster. It does not give them a login — the
                platform owns identity, and an invitation is a separate act.
              </p>
            </RowForm>
        ) : undefined}
      >
        {admins.length === 0 ? (
          <p className="empty">Nobody named yet, so only account owners can edit this one.</p>
        ) : (
          <div className="rlist">
            {admins.map((p: any) => {
              const face = (
                <span className="rcell rcell--lead">
                  <Avatar name={p.full_name} src={p.photo_url} size={38} />
                  <span style={{ minWidth: 0 }}>
                    <span className="prow__name" style={{ display: 'block' }}>{p.full_name}</span>
                    <span className="prow__role" style={{ display: 'block' }}>
                      {p.role_title ?? 'No title on file'}
                    </span>
                  </span>
                </span>
              )
              if (!mayEdit) {
                return <div className="rrec" key={p.id}><div className="rrec__face">{face}</div></div>
              }
              return (
                <RecordRow key={p.id} face={face} editLabel={`Edit ${p.full_name}`}>
                  <div className="rrec__lab">Editing this administrator</div>
                  <RowForm
                    action={updateAdministrator}
                    danger={
                      <RowDanger action={standDownAdministrator} label="Stand down">
                        <input type="hidden" name="person_id" value={p.id} />
                        <input type="hidden" name="entity_id" value={e.id} />
                      </RowDanger>
                    }
                  >
                    <input type="hidden" name="person_id" value={p.id} />
                    <input type="hidden" name="entity_id" value={e.id} />
                    <div className="formrow">
                      <div><label htmlFor={`n-${p.id}`}>Full name</label>
                        <input className="field" id={`n-${p.id}`} name="full_name"
                               defaultValue={p.full_name} required /></div>
                      <div><label htmlFor={`t-${p.id}`}>Title</label>
                        <input className="field" id={`t-${p.id}`} name="role_title"
                               defaultValue={p.role_title ?? ''}
                               placeholder="Operations manager" /></div>
                    </div>
                  </RowForm>
                </RecordRow>
              )
            })}
          </div>
        )}
      </EditableSection>

      {/* ---------------------------------------------- departments --------- */}
      <EditableSection
        title="Departments"
        blurb="A department hangs off this organization and has no page of its own — it appears here."
        addLabel="Adding a department"
        addForm={mayEdit ? (
            <RowForm action={createDepartment} label="Add it" busy="Adding…">
              <input type="hidden" name="entity_id" value={e.id} />
              <div className="formrow">
                <div><label htmlFor="d-name">Name</label>
                  <input className="field" id="d-name" name="name" required placeholder="Dispatch" /></div>
                <div><label htmlFor="d-lead">Leader</label>
                  <Choice id="d-lead" name="leader_person_id" options={leaderOptions}
                          placeholder="Nobody yet" /></div>
              </div>
              <p className="fine" style={{ marginTop: 10 }}>
                A department without a named leader is a real and common state, not
                something to be filled in for the sake of it.
              </p>
            </RowForm>
        ) : undefined}
      >
        {(departments?.length ?? 0) === 0 ? (
          <p className="empty">No departments yet.</p>
        ) : (
          <div className="rlist">
            {departments!.map((d: any) => {
              const lead: any = d.leader_person_id ? byPerson.get(d.leader_person_id) : null
              const face = (
                <>
                  <span className="rcell rcell--lead">
                    <span className="prow__name">{d.name}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Leader</span>
                    {lead ? (
                      <span className="rcell__val leadcell">
                        <Avatar name={lead.full_name} src={lead.photo_url} size={30} />
                        <span className="leadline">
                          <span className="leadline__nm">{lead.full_name}</span>
                        </span>
                      </span>
                    ) : (
                      <span className="rcell__val muted" style={{ fontSize: 13 }}>No leader named</span>
                    )}
                  </span>
                </>
              )
              if (!mayEdit) {
                return <div className="rrec" key={d.id}><div className="rrec__face">{face}</div></div>
              }
              return (
                <RecordRow key={d.id} face={face} editLabel={`Edit ${d.name}`}>
                  <div className="rrec__lab">Editing this department</div>
                  <RowForm
                    action={updateDepartment}
                    danger={
                      <RowDanger action={deleteDepartment} label="Remove department">
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="entity_id" value={e.id} />
                      </RowDanger>
                    }
                  >
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="entity_id" value={e.id} />
                    <div className="formrow">
                      <div><label htmlFor={`dn-${d.id}`}>Name</label>
                        <input className="field" id={`dn-${d.id}`} name="name"
                               defaultValue={d.name} required /></div>
                      <div><label htmlFor={`dl-${d.id}`}>Leader</label>
                        <Choice id={`dl-${d.id}`} name="leader_person_id" options={leaderOptions}
                                defaultValue={d.leader_person_id ?? ''} placeholder="Nobody yet" /></div>
                    </div>
                  </RowForm>
                </RecordRow>
              )
            })}
          </div>
        )}
      </EditableSection>

      {/* ---------------------------------------------- locations ----------- */}
      <EditableSection
        title="Office locations"
        blurb="A location supplies a person's address and the map. It keeps its own page — the card opens it."
        addLabel="Adding a location"
        addForm={mayEdit ? (
            <RowForm action={createLocation} label="Add it" busy="Adding…">
              <input type="hidden" name="entity_id" value={e.id} />
              <div className="formrow">
                <div><label htmlFor="l-name">Name</label>
                  <input className="field" id="l-name" name="name" required placeholder="Tulsa Yard" /></div>
                <div><label htmlFor="l-addr">Street</label>
                  <input className="field" id="l-addr" name="address_line1"
                         autoComplete="address-line1" placeholder="4321 S Sheridan Rd" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="l-addr2">Suite, unit, floor</label>
                  <input className="field" id="l-addr2" name="address_line2" /></div>
                <div><label htmlFor="l-city">City</label>
                  <input className="field" id="l-city" name="city" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="l-region">State</label>
                  <input className="field" id="l-region" name="region" placeholder="OK" /></div>
                <div><label htmlFor="l-zip">Postal code</label>
                  <input className="field" id="l-zip" name="postal_code" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="l-country">Country</label>
                  <input className="field" id="l-country" name="country" defaultValue="United States" /></div>
                <div><label htmlFor="l-tz">Time zone</label>
                  <input className="field" id="l-tz" name="time_zone" defaultValue="America/Chicago" /></div>
              </div>
              <Toggle name="is_head_office" label="This is the head office" />
              <p className="fine" style={{ marginTop: 8 }}>
                One head office per organization — the database enforces it. The pin
                is worked out from the address when you save.
              </p>
            </RowForm>
        ) : undefined}
      >
        {(locations?.length ?? 0) === 0 ? <p className="empty">No locations yet.</p> : (
          <div className="maps" style={{ marginTop: 0 }}>
            {locations!.map((l: any) => (
              <a key={l.id} href={`/admin/organizations/${e.id}/locations/${l.id}`}
                 className="mapcard">
                {l.latitude != null
                  ? <LocationMap lat={l.latitude} lng={l.longitude} label={l.name} />
                  : <div className="lmap lmap--none" style={{ minHeight: 150 }}>
                      <div>No pin yet</div>
                    </div>}
                <span className="mapcard__name">{l.name}</span>
                <span className="mapcard__sub">
                  {[l.city, l.region].filter(Boolean).join(', ') || 'No address yet'}
                  {l.is_head_office && ' · Head office'}
                </span>
              </a>
            ))}
          </div>
        )}
      </EditableSection>

      {/* ---------------------------------------------- modules ------------- */}
      <EditableSection
        title="Modules"
        blurb="What this organization runs. Switching one off never deletes — turn it back on and it is where you left it."
      >
        <div className="rlist">
          {MODULES.map((m) => {
            const live = on.has(m.key)
            const face = (
              <>
                <span className="rcell rcell--lead">
                  <span style={{ minWidth: 0 }}>
                    <span className="prow__name" style={{ display: 'block' }}>{m.label}</span>
                  </span>
                </span>
                <span className="rcell">
                  <span className="rcell__lab">State</span>
                  <span className="rcell__val">
                    <span className={`pill${live ? ' pill--good' : ''}`}>{live ? 'On' : 'Off'}</span>
                  </span>
                </span>
              </>
            )
            if (!mayEdit) {
              return <div className="rrec" key={m.key}><div className="rrec__face">{face}</div></div>
            }
            return (
              <RecordRow key={m.key} face={face} editLabel={`Switch ${m.label}`}>
                <div className="rrec__lab">{m.label}, for this organization</div>
                <ModuleToggle entityId={e.id} moduleKey={m.key} label={m.label}
                              orgName={e.name} enabled={live} />
              </RecordRow>
            )
          })}
        </div>
        {mayEdit && (
          <p className="fine" style={{ marginTop: 12 }}>
            Set these across the whole portfolio on <a href="/admin/modules">Modules</a>.
          </p>
        )}
      </EditableSection>
    </>
  )
}
