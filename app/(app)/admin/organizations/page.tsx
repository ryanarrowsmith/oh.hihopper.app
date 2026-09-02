import { supabaseServer } from '@/lib/supabase/server'
import { EditableSection, RowForm } from '@/components/RowEdit'
import { Caret, Level } from '@/components/Icons'
import { createEntity } from '@/app/actions/admin'

export default async function Organizations() {
  const db = supabaseServer()
  const { data: entities } = await db.schema('hopper')
    .from('entity').select('id, name, mark, status, parent_id').order('sort_order')
  const { data: departments } = await db.schema('hopper')
    .from('department').select('id, entity_id')
  const { data: locations } = await db.schema('hopper')
    .from('location').select('id, entity_id')

  const all = entities ?? []
  const roots = all.filter((e: any) => !e.parent_id)
  const count = (list: any[] | null, id: string) =>
    (list ?? []).filter((x) => x.entity_id === id).length
  const contains = (id: string) => {
    const d = count(departments, id), l = count(locations, id)
    return `${d} ${d === 1 ? 'department' : 'departments'} · ${l} ${l === 1 ? 'location' : 'locations'}`
  }

  /**
   * One organization. The cells carry their own column names so the row can
   * become a card on a phone without being rebuilt -- and a child says it is a
   * child with the level arrow there, because 34px of indent is a third of a
   * phone's width.
   */
  const Row = ({ e, kid, toggles }: { e: any; kid?: boolean; toggles?: string }) => (
    <div className={`tree__row${kid ? ' kid' : ''}`}>
      <span className="rcell rcell--lead">
        {toggles
          ? <label className="tcar" htmlFor={toggles}
                   title="Show or hide what sits under this"><Caret /></label>
          : <span className="tcar tcar--none" />}
        {kid && <Level className="lv lvm" />}
        <span className="plate">{e.mark ?? '—'}</span>
        <b style={{ fontSize: 14 }}>{e.name}</b>
      </span>
      <span className="rcell">
        <span className="rcell__lab">Status</span>
        <span className="rcell__val">
          <span className={`pill ${e.status === 'active' ? 'pill--good' : 'pill--setup'}`}>
            {e.status}</span>
        </span>
      </span>
      <span className="rcell">
        <span className="rcell__lab">Contains</span>
        <span className="rcell__val">{contains(e.id)}</span>
      </span>
      <span className="rcell rcell--act">
        <a className="btn" href={`/admin/organizations/${e.id}`}>Open</a>
      </span>
    </div>
  )

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Organizations</h1>
          <p className="scopeline"><span>
            A parent and everything beneath it. Granting somebody a parent grants
            them the whole branch — that is what choosing a holding company means.
          </span></p>
        </div>
      </div>

      <EditableSection
        title="The portfolio"
        blurb={`${all.length} organizations, ${roots.length} at the top.`}
        addLabel="Add an organization"
        addForm={
          <>
            <div className="rrec__lab">Adding an organization</div>
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
                  <select className="field" id="e-parent" name="parent_id" defaultValue="">
                    <option value="">Nothing — it&rsquo;s a top-level organization</option>
                    {all.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select></div>
                <div><label htmlFor="e-status">Status</label>
                  <select className="field" id="e-status" name="status" defaultValue="setup">
                    <option value="setup">Setting up</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select></div>
              </div>
            </RowForm>
          </>
        }
      >
        {all.length === 0 ? (
          <p className="empty">
            No organizations you can open. Either none exist yet, or none have been granted to you.
          </p>
        ) : (
          <div className="tree">
            {roots.map((r: any) => {
              const kids = all.filter((c: any) => c.parent_id === r.id)
              if (!kids.length) {
                return <div className="tnode" key={r.id}><Row e={r} /></div>
              }
              /* A checkbox nobody sees does the opening, so the row's own Open
                 button stays clickable -- inside a <summary> the browser eats
                 the click. Open by default: a portfolio that hides itself on
                 arrival is a portfolio you have to unpack every visit. */
              const id = `t-${r.id}`
              return (
                <div className="tnode" key={r.id}>
                  <input type="checkbox" id={id} className="tvis" defaultChecked
                         aria-label={`Show or hide what sits under ${r.name}`} />
                  <Row e={r} toggles={id} />
                  <div className="tree__kids"><div className="tree__clip">
                    {kids.map((c: any) => <Row key={c.id} e={c} kid />)}
                  </div></div>
                </div>
              )
            })}
          </div>
        )}
      </EditableSection>
    </>
  )
}
