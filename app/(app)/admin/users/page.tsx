import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import ActionForm from '@/components/ActionForm'
import { createPerson } from '@/app/actions/admin'
import Choice from '@/components/Choice'

export default async function Users() {
  const db = supabaseServer()
  const { data: people } = await db.schema('hopper')
    .from('person').select('id, full_name, email, role_title, active, entity_id, profile_id')
    .order('full_name')
  const { data: entities } = await db.schema('hopper').from('entity').select('id, name')
  const nameOf = (id: string | null) => (entities ?? []).find((e: any) => e.id === id)?.name ?? '—'

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Users</h1>
        <p className="scopeline"><span>
          Who can sign in to Hopper, and who is on the roster waiting to be invited.
          One record per person either way — the directory at{' '}
          <a href="/people">People</a> is the same human, seen from the other side.
        </span></p>
      </div></div>

      <Section title="Everyone" blurb={`${people?.length ?? 0} on the roster, with and without a login.`}
        action={null}>
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

        <details className="add">
          <summary>Add a person</summary>
          <div className="add__body">
            <ActionForm action={createPerson} label="Add them" busy="Adding…">
              <div className="formrow">
                <div><label htmlFor="p-name">Full name</label>
                  <input className="field" id="p-name" name="full_name" required /></div>
                <div><label htmlFor="p-email">Email</label>
                  <input className="field" id="p-email" name="email" type="email" /></div>
              </div>
              <div className="formrow">
                <div><label htmlFor="p-role">Role</label>
                  <input className="field" id="p-role" name="role_title"
                         placeholder="Dispatch manager" /></div>
                <div><label htmlFor="p-entity">Organization</label>
                  <Choice id="p-entity" name="entity_id" placeholder="Not placed yet"
                          options={[{ value: '', label: 'Not placed yet' },
                                    ...(entities ?? []).map((e: any) => ({ value: e.id, label: e.name }))]} /></div>
              </div>
              <p className="fine">
                Adding somebody puts them on the roster. It does not give them a login —
                the platform owns identity, and an invitation is a separate, deliberate act.
              </p>
            </ActionForm>
          </div>
        </details>
      </Section>
    </>
  )
}
