import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import { EditableSection, RecordRow, RowForm, RowDanger } from '@/components/RowEdit'
import Choice from '@/components/Choice'
import { createCategory, deleteCategory } from '@/app/actions/reports'

export const dynamic = 'force-dynamic'

/**
 * Report categories.
 *
 * Reachable from the top of Reporting rather than from the menu — a vocabulary
 * you edit twice a year does not earn a permanent line in a menu you read every
 * day.
 *
 * A category belongs to exactly one department, because a category is a kind of
 * report *that department* runs. A flat portfolio-wide list made the dropdown on
 * the report form longer than it was useful.
 */
export default async function Categories() {
  const db = supabaseServer()

  const [{ data: cats }, { data: depts }, { data: ents }, { data: reports }, { data: rights }] =
    await Promise.all([
      db.schema('hopper').from('report_category').select('id, name, department_id').order('name'),
      db.schema('hopper').from('department').select('id, name, entity_id').order('name'),
      db.schema('hopper').from('entity').select('id, name').order('sort_order'),
      db.schema('hopper').from('report').select('id, category_id'),
      db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
    ])

  const deptById = new Map((depts ?? []).map((d: any) => [d.id, d]))
  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))

  const used = new Map<string, number>()
  for (const r of reports ?? []) {
    if (!r.category_id) continue
    used.set(r.category_id, (used.get(r.category_id) ?? 0) + 1)
  }

  // Only departments in organizations this person may edit. An offer you cannot
  // accept is worse than no offer.
  const mayEdit = new Set((rights ?? []).filter((r: any) => r.may_edit).map((r: any) => r.entity_id))
  const addTo = (depts ?? []).filter((d: any) => mayEdit.has(d.entity_id))

  const rows = (cats ?? []).map((c: any) => {
    const d: any = deptById.get(c.department_id)
    return {
      ...c,
      dept: d?.name ?? 'No department',
      org: d ? (entName.get(d.entity_id) ?? '—') : '—',
      count: used.get(c.id) ?? 0,
      mine: d ? mayEdit.has(d.entity_id) : false,
    }
  }).sort((a: any, b: any) =>
    a.org.localeCompare(b.org) || a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name))

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Report categories</h1>
        <p className="scopeline">
          <span>A kind of report a department runs. <Link href="/reporting">Back to reporting</Link></span>
        </p>
      </div></div>

      <EditableSection
        title="Across the portfolio"
        blurb={`${rows.length} categor${rows.length === 1 ? 'y' : 'ies'} in the departments you can open. Each belongs to exactly one department, and the Category list on a report form narrows to the department above it.`}
        addLabel="Adding a category"
        addForm={addTo.length ? (
          <RowForm action={createCategory} label="Add it" busy="Adding…">
            <div className="formrow formrow--one">
              <div>
                <label htmlFor="rc-dept">Department</label>
                {/* Chosen before the name, and the action refuses without it.
                    A category with no department is a category no form can
                    ever offer. */}
                <Choice id="rc-dept" name="department_id" required
                        placeholder="Choose a department"
                        options={addTo.map((d: any) => ({
                          value: d.id, label: d.name,
                          hint: entName.get(d.entity_id) ?? undefined,
                        }))} />
              </div>
            </div>
            <div className="formrow formrow--one" style={{ marginTop: 12 }}>
              <div>
                <label htmlFor="rc-name">Name</label>
                <input className="field" id="rc-name" name="name" required placeholder="Utilization" />
              </div>
            </div>
            <p className="fine" style={{ marginTop: 10 }}>
              Only departments in organizations you administer are offered.
            </p>
          </RowForm>
        ) : undefined}
      >
        {rows.length === 0 ? <p className="empty">Nothing here yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,1.2fr) minmax(0,.7fr)' }}>
            <div className="rhead">
              <span>Category</span><span>Department</span><span>Organization</span><span>Reports</span>
            </div>
            {rows.map((c: any) => {
              const face = (
                <>
                  <span className="rcell rcell--lead"><span className="prow__name">{c.name}</span></span>
                  <span className="rcell">
                    <span className="rcell__lab">Department</span>
                    <span className="rcell__val">{c.dept}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Organization</span>
                    <span className="rcell__val">{c.org}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Reports</span>
                    <span className="rcell__val">{c.count || '—'}</span>
                  </span>
                </>
              )
              // Nothing a person may not do is rendered: a category in an
              // organization they do not administer has no pencil at all.
              if (!c.mine) return <div className="rrec" key={c.id}><div className="rrec__face">{face}</div></div>
              return (
                <RecordRow key={c.id} face={face} editLabel={`Remove ${c.name}`}>
                  {c.count ? (
                    // Enforced on the button, not explained after the fact:
                    // there is nothing here to press while reports are in it.
                    <div className="rowacts">
                      <button className="lnk lnk--go" type="button" disabled>Remove it</button>
                      <p className="fine" style={{ margin: 0 }}>
                        {c.count} report{c.count === 1 ? '' : 's'} sit{c.count === 1 ? 's' : ''} in
                        this category. Move them first and it can go.
                      </p>
                    </div>
                  ) : (
                    <RowDanger action={deleteCategory} label="Remove it">
                      <input type="hidden" name="id" value={c.id} />
                      <p className="fine" style={{ margin: 0 }}>
                        Nothing is using this category, so it can go.
                      </p>
                    </RowDanger>
                  )}
                </RecordRow>
              )
            })}
          </div>
        )}
      </EditableSection>
    </>
  )
}
