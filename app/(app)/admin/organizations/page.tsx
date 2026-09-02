import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import ActionForm from '@/components/ActionForm'
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
  const count = (list: any[] | null, id: string) => (list ?? []).filter((x) => x.entity_id === id).length

  const Row = ({ e, kid }: { e: any; kid?: boolean }) => (
    <div className={`tree__row${kid ? ' kid' : ''}`}>
      <span className="plate">{e.mark ?? '—'}</span>
      <b style={{ fontSize: 14 }}>{e.name}</b>
      <span className={`pill ${e.status === 'active' ? 'pill--good' : 'pill--setup'}`}>{e.status}</span>
      <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
        {count(departments, e.id)} departments · {count(locations, e.id)} locations
      </span>
      <a className="btn" href={`/admin/organizations/${e.id}`}>Open</a>
    </div>
  )

  return (
    <>
      <div className="hi"><h1>Organizations</h1>
        <p className="scopeline"><span>
          A parent and everything beneath it. Granting somebody a parent grants
          them the whole branch — that is what choosing a holding company means.
        </span></p>
      </div>

      <Section title="The portfolio" blurb={`${all.length} organizations, ${roots.length} at the top.`}
        action={null}>
        {all.length === 0
          ? <p className="empty">No organizations you can open. Either none exist yet, or none have been granted to you.</p>
          : <div className="tree">
              {roots.map((r: any) => (
                <div key={r.id}>
                  <Row e={r} />
                  {all.filter((c: any) => c.parent_id === r.id).map((c: any) => <Row key={c.id} e={c} kid />)}
                </div>
              ))}
            </div>}

        <details className="add">
          <summary>Add an organization</summary>
          <div className="add__body">
            <ActionForm action={createEntity} label="Add it" busy="Adding…">
              <div className="formrow">
                <div><label htmlFor="e-name">Name</label>
                  <input className="field" id="e-name" name="name" required
                         placeholder="Locked Up Self Storage" /></div>
                <div><label htmlFor="e-legal">Legal name</label>
                  <input className="field" id="e-legal" name="legal_name"
                         placeholder="Optional" /></div>
              </div>
              <div className="formrow">
                <div><label htmlFor="e-mark">Mark</label>
                  <input className="field" id="e-mark" name="mark" maxLength={4}
                         placeholder="LU" /></div>
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
            </ActionForm>
          </div>
        </details>
      </Section>
    </>
  )
}
