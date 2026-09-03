import { supabaseServer } from '@/lib/supabase/server'
import { EditableSection, RecordRow, RowDanger, RowForm } from '@/components/RowEdit'
import Choice from '@/components/Choice'
import { Level } from '@/components/Icons'
import { createEntity, setEntityActive, updateEntity } from '@/app/actions/admin'

/**
 * Organizations, as a thing you manage.
 *
 * One line each -- add, edit, retire -- and the name is the way deeper. What
 * the group LOOKS like, with its branches and its offices on business cards,
 * is at /organizations: this page and that one used to be the same page, which
 * meant Admin and the rail both landed you somewhere that was trying to be a
 * portrait and a control panel at once.
 *
 * So: flat, sorted, every organization on one line whether it is a parent or
 * not, with the one it sits under as a column rather than an indent. A
 * management list is read down a column, not walked as a tree.
 */
export default async function Organizations() {
  const db = supabaseServer()
  const [{ data: entities }, { data: departments }, { data: locations }, { data: rights }] =
    await Promise.all([
      db.schema('hopper').from('entity')
        .select('id, name, mark, status, parent_id, legal_name, logo_url')
        .order('sort_order'),
      db.schema('hopper').from('department').select('id, entity_id'),
      db.schema('hopper').from('location').select('id, entity_id'),
      // Whether to draw the pencil comes from the same place the write is
      // permitted, so the row cannot offer an edit the database refuses.
      db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
    ])

  // Still trading, then being set up, then retired -- and the group's own order
  // inside each. Postgres would sort those three words alphabetically, which
  // puts the closed businesses in the middle of the live ones.
  const RANK: Record<string, number> = { active: 0, setup: 1, inactive: 2 }
  const all = [...(entities ?? [])].sort((a: any, b: any) =>
    (RANK[a.status] ?? 1) - (RANK[b.status] ?? 1))
  const byId = new Map(all.map((e: any) => [e.id, e]))
  const count = (list: any[] | null, id: string) =>
    (list ?? []).filter((x: any) => x.entity_id === id).length
  const mayEdit = (id: string) =>
    (rights ?? []).some((r: any) => r.entity_id === id && r.may_edit)
  const mayAddAnywhere = all.length === 0 || (rights ?? []).some((r: any) => r.may_edit)

  const STATUS = [
    { value: 'setup', label: 'Setting up' },
    { value: 'active', label: 'Active' },
  ]

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Organizations</h1>
          <p className="scopeline"><span>
            Add one, rename one, retire one. <a href="/organizations">The portfolio</a>{' '}
            is the same list drawn as a tree, with each organization’s offices under it.
          </span></p>
        </div>
      </div>

      <EditableSection
        title="Every organization"
        blurb={`${all.length} in all. A parent and everything beneath it — granting somebody a parent grants them the whole branch. Retiring one keeps it, and everything under it goes with it.`}
        addLabel="Adding an organization"
        addForm={mayAddAnywhere ? (
          <RowForm action={createEntity} label="Add it" busy="Adding…">
            <div className="formrow">
              <div><label htmlFor="e-name">Name</label>
                <input className="field" id="e-name" name="name" required
                       placeholder="Locked Up Self Storage" /></div>
              <div><label htmlFor="e-legal">Legal name</label>
                <input className="field" id="e-legal" name="legal_name" placeholder="Optional" /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="e-mark">Mark</label>
                <input className="field" id="e-mark" name="mark" maxLength={4} placeholder="LU" /></div>
              <div><label htmlFor="e-parent">Sits under</label>
                <Choice id="e-parent" name="parent_id" placeholder="Nothing — top level"
                        options={[{ value: '', label: 'Nothing — it’s a top-level organization' },
                                  ...all.map((e: any) => ({ value: e.id, label: e.name }))]} /></div>
              <div><label htmlFor="e-status">Status</label>
                <Choice id="e-status" name="status" defaultValue="setup" options={STATUS} /></div>
            </div>
          </RowForm>
        ) : undefined}
      >
        {all.length === 0 ? (
          <p className="empty">
            No organizations you can open. Either none exist yet, or none have been granted to you.
          </p>
        ) : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1.4fr) minmax(0,1.1fr) 120px minmax(0,1fr)' }}>
            <div className="rhead">
              <span>Name</span><span>Sits under</span><span>Status</span><span>Contains</span>
            </div>
            {all.map((e: any) => {
              const parent: any = e.parent_id ? byId.get(e.parent_id) : null
              const off = e.status === 'inactive'
              const d = count(departments, e.id)
              const l = count(locations, e.id)
              const face = (
                <>
                  <span className="rcell rcell--lead">
                    <span className="plate" style={off ? { opacity: .6 } : undefined}>
                      {e.mark ?? '—'}</span>
                    {/* The name is the way deeper. One line each, the quick
                        changes in the row, everything else on its own page. */}
                    <a className={`orgname${off ? ' orgname--off' : ''}`}
                       href={`/admin/organizations/${e.id}`}>{e.name}</a>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Sits under</span>
                    <span className="rcell__val">
                      {parent
                        ? <span className="under">
                            <Level className="lv lvm" />
                            <a className="orgname orgname--sm"
                               href={`/admin/organizations/${parent.id}`}>{parent.name}</a>
                          </span>
                        : <span className="muted" style={{ fontSize: 13 }}>Top level</span>}
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Status</span>
                    <span className="rcell__val">
                      <span className={`pill ${e.status === 'active' ? 'pill--good'
                        : off ? 'pill--off' : 'pill--setup'}`}>
                        {off ? 'retired' : e.status}</span>
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Contains</span>
                    <span className="rcell__val" style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                      {d} {d === 1 ? 'department' : 'departments'} ·{' '}
                      {l === 0
                        ? '0 locations'
                        : <a className="orgname orgname--sm"
                             href={`/admin/organizations/${e.id}/locations`}>
                            {l} {l === 1 ? 'location' : 'locations'}
                          </a>}
                    </span>
                  </span>
                </>
              )

              // Nothing a person may not do is rendered: without edit rights on
              // this organization the row is a row, not a disabled control.
              if (!mayEdit(e.id)) {
                return <div className="rrec" key={e.id}><div className="rrec__face">{face}</div></div>
              }
              return (
                <RecordRow key={e.id} face={face} editLabel={`Edit ${e.name}`}>
                  <div className="rrec__lab">Editing this organization</div>
                  <RowForm action={updateEntity}
                           danger={
                             <RowDanger action={setEntityActive}
                                        label={off ? 'Bring it back' : 'Retire it'}>
                               <input type="hidden" name="id" value={e.id} />
                               <input type="hidden" name="active" value={off ? 'true' : 'false'} />
                             </RowDanger>
                           }>
                    <input type="hidden" name="id" value={e.id} />
                    {/* updateEntity writes every column it is given, so the one
                        this row does not show has to travel with it or saving a
                        name would clear the logo. */}
                    <input type="hidden" name="logo_url" value={e.logo_url ?? ''} />
                    {/* Retiring is the danger button's job, and it takes the
                        whole branch with it. Offering 'Retired' in a dropdown
                        beside it would be a second way to do it that does
                        something quieter and different. */}
                    {off && <input type="hidden" name="status" value="inactive" />}
                    <div className="formrow">
                      <div><label htmlFor={`on-${e.id}`}>Name</label>
                        <input className="field" id={`on-${e.id}`} name="name"
                               defaultValue={e.name} required /></div>
                      <div><label htmlFor={`ol-${e.id}`}>Legal name</label>
                        <input className="field" id={`ol-${e.id}`} name="legal_name"
                               defaultValue={e.legal_name ?? ''} placeholder="Optional" /></div>
                    </div>
                    <div className="formrow" style={{ marginTop: 12 }}>
                      <div><label htmlFor={`om-${e.id}`}>Mark</label>
                        <input className="field" id={`om-${e.id}`} name="mark" maxLength={4}
                               defaultValue={e.mark ?? ''} placeholder="LU" /></div>
                      {!off && (
                        <div><label htmlFor={`os-${e.id}`}>Status</label>
                          <Choice id={`os-${e.id}`} name="status"
                                  defaultValue={e.status ?? 'setup'} options={STATUS} /></div>
                      )}
                    </div>
                    <p className="fine" style={{ marginTop: 10 }}>
                      Where it sits in the group is on its own page — moving an organization
                      moves everything under it, which is not a thing to do in passing.
                    </p>
                  </RowForm>
                </RecordRow>
              )
            })}
          </div>
        )}
      </EditableSection>
    </>
  )
}
