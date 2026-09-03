import { supabaseServer } from '@/lib/supabase/server'
import Avatar from '@/components/Avatar'
import { EditableSection, RecordRow, RowDanger, RowForm } from '@/components/RowEdit'
import Choice from '@/components/Choice'
import { createDepartment, setDepartmentActive, updateDepartment } from '@/app/actions/admin'

export default async function Page() {
  const db = supabaseServer()
  const [{ data: rows }, { data: entities }, { data: people }, { data: rights }] =
    await Promise.all([
      db.schema('hopper').from('department')
        .select('id, name, entity_id, leader_person_id, active')
        .order('active', { ascending: false }).order('name'),
      db.schema('hopper').from('entity').select('id, name').order('sort_order'),
      db.schema('hopper').from('person')
        .select('id, full_name, role_title, photo_url').eq('active', true).order('full_name'),
      db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
    ])

  const orgs = entities ?? []
  const roster = people ?? []
  const byOrg = new Map(orgs.map((e: any) => [e.id, e.name]))
  const byPerson = new Map(roster.map((p: any) => [p.id, p]))

  // Where this person may add. The plus is not rendered at all when the answer
  // is nowhere -- an offer you cannot accept is worse than no offer.
  const mayAddTo = orgs.filter((e: any) =>
    (rights ?? []).some((r: any) => r.entity_id === e.id && r.may_edit))

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Departments</h1>
          <p className="scopeline">
            <span>Every department in the organizations you can open.</span>
          </p>
        </div>
      </div>

      <EditableSection
        title="Across the portfolio"
        blurb={`${rows?.length ?? 0} in the organizations you can open. A department belongs to one organization. Retiring one keeps it and everybody filed under it.`}
        addLabel="Adding a department"
        addForm={mayAddTo.length ? (
            <RowForm action={createDepartment} label="Add it" busy="Adding…">
              <div className="formrow formrow--one">
                <div><label htmlFor="dp-org">Organization</label>
                  <Choice id="dp-org" name="entity_id" required defaultValue={mayAddTo[0].id}
                          options={mayAddTo.map((e: any) => ({ value: e.id, label: e.name }))} /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="dp-name">Name</label>
                  <input className="field" id="dp-name" name="name" required placeholder="Dispatch" /></div>
                <div><label htmlFor="dp-lead">Leader</label>
                  <Choice id="dp-lead" name="leader_person_id" placeholder="Nobody yet"
                          options={[{ value: '', label: 'Nobody yet' },
                                    ...roster.map((p: any) => ({ value: p.id, label: p.full_name,
                                                                 hint: p.role_title ?? undefined }))]} /></div>
              </div>
              <p className="fine" style={{ marginTop: 10 }}>
                Only organizations you administer are offered. A department without a
                named leader is a real and common state.
              </p>
            </RowForm>
        ) : undefined}
      >
        {(rows?.length ?? 0) === 0 ? <p className="empty">Nothing here yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1.2fr) minmax(0,1.3fr) minmax(0,1.25fr)' }}>
            <div className="rhead"><span>Name</span><span>Organization</span><span>Leader</span></div>
            {rows!.map((d: any) => {
              const lead: any = d.leader_person_id ? byPerson.get(d.leader_person_id) : null
              const mine = (rights ?? []).some((r: any) =>
                r.entity_id === d.entity_id && r.may_edit)
              const face = (
                <>
                  <span className="rcell rcell--lead">
                    <span className="prow__name">{d.name}</span>
                    {/* Retired, not gone. It keeps its name and everybody filed
                        under it keeps their answer to "which department?". */}
                    {d.active === false && (
                      <span className="mark mark--sm" data-tip="Retired — no longer offered"
                            role="img" aria-label="Retired">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                        <b>Retired</b>
                      </span>
                    )}
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Organization</span>
                    <span className="rcell__val">
                      <a href={`/admin/organizations/${d.entity_id}`}
                         style={{ fontWeight: 700, color: 'var(--steel-ink)', textDecoration: 'none' }}>
                        {byOrg.get(d.entity_id) ?? '—'}
                      </a>
                    </span>
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

              // Nothing a person may not do is rendered: without edit rights on
              // this organization the row is a row, not a disabled control.
              if (!mine) {
                return <div className="rrec" key={d.id}><div className="rrec__face">{face}</div></div>
              }
              return (
                <RecordRow key={d.id} face={face} editLabel={`Edit ${d.name}`}>
                  <div className="rrec__lab">Editing this department</div>
                  <RowForm action={updateDepartment}
                           danger={
                             <RowDanger action={setDepartmentActive}
                                        label={d.active === false ? 'Bring it back' : 'Retire it'}>
                               <input type="hidden" name="id" value={d.id} />
                               <input type="hidden" name="entity_id" value={d.entity_id} />
                               <input type="hidden" name="active"
                                      value={d.active === false ? 'true' : 'false'} />
                             </RowDanger>
                           }>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="entity_id" value={d.entity_id} />
                    <div className="formrow">
                      <div><label htmlFor={`dn-${d.id}`}>Name</label>
                        <input className="field" id={`dn-${d.id}`} name="name"
                               defaultValue={d.name} required /></div>
                      <div><label htmlFor={`dl-${d.id}`}>Leader</label>
                        <Choice id={`dl-${d.id}`} name="leader_person_id"
                                defaultValue={d.leader_person_id ?? ''} placeholder="Nobody yet"
                                options={[{ value: '', label: 'Nobody yet' },
                                          ...roster.map((p: any) => ({ value: p.id,
                                            label: p.full_name,
                                            hint: p.role_title ?? undefined }))]} /></div>
                    </div>
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
