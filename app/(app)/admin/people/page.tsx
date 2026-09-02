import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'

export default async function People() {
  const db = supabaseServer()
  const { data: people } = await db.schema('hopper')
    .from('person').select('id, full_name, email, role_title, active, entity_id, profile_id')
    .order('full_name')
  const { data: entities } = await db.schema('hopper').from('entity').select('id, name')
  const nameOf = (id: string | null) => (entities ?? []).find((e: any) => e.id === id)?.name ?? '—'

  return (
    <>
      <div className="hi"><h1>People</h1>
        <p className="scopeline"><span>
          The roster, narrowed to the organizations you can already see. Somebody
          with no login yet is on the roster all the same.
        </span></p>
      </div>

      <Section title="Everyone" blurb={`${people?.length ?? 0} on the roster.`}
        action={<a className="btn btn--amber">Add a person</a>}>
        {(people?.length ?? 0) === 0 ? <p className="empty">Nobody you can see.</p> : (
          <div className="tblwrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Organization</th><th>Sign-in</th><th>Status</th></tr></thead>
            <tbody>{people!.map((p: any) => (
              <tr key={p.id}>
                <td><b>{p.full_name}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>{p.email ?? '—'}</span></td>
                <td>{p.role_title ?? '—'}</td>
                <td>{nameOf(p.entity_id)}</td>
                <td>{p.profile_id
                  ? <span className="pill pill--good">Has a login</span>
                  : <span className="pill">Not invited</span>}</td>
                <td>{p.active ? 'Active' : <span className="pill">Deactivated</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
    </>
  )
}
