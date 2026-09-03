import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import LocationMap from '@/components/LocationMap'
import Avatar from '@/components/Avatar'
import OrgLogo from '@/components/OrgLogo'
import ModuleToggle from '@/components/ModuleToggle'
import FavoriteButton from '@/components/CardActions'
import { EditableSection, RecordRow, RowForm, RowDanger, Toggle } from '@/components/RowEdit'
import Choice from '@/components/Choice'
import { HeadOffice } from '@/components/Icons'
import { MODULES } from '@/lib/access'
import {
  updateEntity, createDepartment, updateDepartment, deleteDepartment,
  createLocation, addAdministrator, updateAdministrator, standDownAdministrator,
  toggleFavorite,
} from '@/app/actions/admin'
import Remember from '@/components/Remember'
import Link from 'next/link'

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
        .select('id, full_name, role_title, photo_url, profile_id, email, phone, entity_id, department_id, location_id, manager_id')
        .eq('active', true).order('full_name'),
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

  /* Who works here, and the names to draw beside them. Departments and
     locations are already loaded for this organization; managers are looked up
     across the whole roster, because somebody's manager is often in a
     different part of the tree. */
  const here = roster.filter((p: any) => p.entity_id === params.id)
  const deptName = new Map((departments ?? []).map((d: any) => [d.id, d.name]))
  const locName = new Map((locations ?? []).map((l: any) => [l.id, l.name]))
  const personName = new Map(roster.map((p: any) => [p.id, p.full_name]))
  const byPerson = new Map(roster.map((p: any) => [p.id, p]))
  const adminIds = new Set((grants ?? []).filter((g: any) => g.may_edit).map((g: any) => g.person_id))
  const admins = roster.filter((p: any) => adminIds.has(p.id))
  /**
   * Who can be made an administrator.
   *
   * Somebody who can sign in, and nobody else. A roster entry with no
   * profile_id cannot open Hopper at all -- beebee.app_access decides that and
   * it hangs off an identity that does not exist yet -- so naming them here
   * writes a grant that does nothing until somebody invites them, and leaves a
   * screen saying they administer this organization when they cannot open it.
   *
   * They are not greyed out in the list, they are absent, and the note below
   * the picker says why rather than leaving somebody hunting for a name they
   * can see on the People page.
   */
  const canSignIn = roster.filter((p: any) => p.profile_id)
  const notAdmins = canSignIn.filter((p: any) => !adminIds.has(p.id))
  const onRosterOnly = roster.filter((p: any) => !p.profile_id).length

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
      <Remember kind="entity" id={e.id} label={e.name} sub={e.mark ?? null} />
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
            <RowForm action={addAdministrator} label="Make them an administrator" busy="Saving…">
              <input type="hidden" name="entity_id" value={e.id} />
              <label htmlFor="ad-who">Who</label>
              <Choice id="ad-who" name="person_id" required
                      placeholder={notAdmins.length === 0
                        ? (canSignIn.length === 0 ? 'Nobody has a login yet' : 'Everybody already does')
                        : 'Choose somebody'}
                      options={notAdmins.map((p: any) => ({
                        value: p.id, label: p.full_name, hint: p.role_title ?? undefined }))} />
              <p className="fine" style={{ marginTop: 10 }}>
                Only people who can sign in. Administering something you cannot
                open is not a permission, it is a label — so somebody on the
                roster without a login is not offered here until they have one.
                {onRosterOnly > 0 && (
                  <> {onRosterOnly} {onRosterOnly === 1 ? 'person is' : 'people are'} on
                  the roster without one.</>
                )}{' '}
                <a href="/admin/users">Users</a> is where that starts.
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

      {/* ---------------------------------------------- the people ---------
          Administrators are the handful who may CHANGE this organization;
          this is everybody who works in it. Two different questions about the
          same word, which is why they are two sections and not one list with a
          column in it. */}
      <section className="sec">
        <div className="sec__h">
          <div className="sec__t">
            <h2>People</h2>
            <p>
              Everyone on the roster in this organization. Adding somebody happens under
              Admin · People, where a whole roster can arrive at once.
            </p>
          </div>
          <div className="sec__a">
            <Link className="btn" href="/admin/people">Manage the roster</Link>
          </div>
        </div>

        {here.length === 0
          ? <p className="empty">Nobody is placed in this organization yet.</p>
          : <div className="rlist2 rlist--roster">
              <div className="rhead">
                <span>Name</span><span>Role</span><span>Department</span>
                <span>Location</span><span>Manager</span><span>Contact</span>
              </div>
              {here.map((p: any) => (
                <Link className="rrow" key={p.id} href={`/people/${p.id}` as any}>
                  <span className="rrow__n">{p.full_name}
                    {p.profile_id && <em className="pill" style={{ marginLeft: 7 }}>Can sign in</em>}
                  </span>
                  <span>{p.role_title ?? '—'}</span>
                  <span>{deptName.get(p.department_id) ?? '—'}</span>
                  <span>{locName.get(p.location_id) ?? '—'}</span>
                  <span>{p.manager_id ? (personName.get(p.manager_id) ?? '—') : '—'}</span>
                  <span className="rcell--thin">{p.email ?? p.phone ?? '—'}</span>
                </Link>
              ))}
            </div>}
      </section>

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
                <span className="mapcard__name">
                  <HeadOffice on={!!l.is_head_office} />{l.name}
                </span>
                <span className="mapcard__sub">
                  {[l.city, l.region].filter(Boolean).join(', ') || 'No address yet'}
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
