import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import ActionForm from '@/components/ActionForm'
import { savePermissions } from '@/app/actions/admin'
import { FLAT_OBJECTS, PLACE_VERBS, held, type Grant } from '@/lib/access'

export default async function Permissions({
  searchParams,
}: { searchParams: { person?: string } }) {
  const db = supabaseServer()
  const { data: people } = await db.schema('hopper')
    .from('person').select('id, full_name, role_title, active').order('full_name')
  const who = searchParams.person ?? people?.[0]?.id
  const person = (people ?? []).find((p: any) => p.id === who)

  const { data: grants } = await db.schema('hopper')
    .from('access_grant').select('*').eq('person_id', who ?? '')
  const { data: entities } = await db.schema('hopper')
    .from('entity').select('id, name, parent_id').order('sort_order')
  const g = (grants ?? []) as Grant[]

  return (
    <>
      <div className="hi"><h1>Permissions</h1>
        <p className="scopeline"><span>
          Grants are held per person. Editing one person changes that person and
          nobody else — which is why what somebody holds is readable in one place.
        </span></p>
      </div>

      {!person ? <p className="empty">Nobody to set permissions for yet.</p> : (
        <>
          <Section title="Whose access" blurb="Pick a person; the rows below are theirs.">
            <div className="tblwrap"><table className="tbl">
              <tbody>{people!.map((p: any) => (
                <tr key={p.id}>
                  <td><b>{p.full_name}</b> <span className="muted">{p.role_title ?? ''}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {p.id === who
                      ? <span className="pill pill--good">Showing</span>
                      : <a className="btn" href={`/admin/permissions?person=${p.id}`}>Show</a>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          </Section>

          <ActionForm action={savePermissions} label="Save permissions" busy="Saving…"
                      className="">
          <input type="hidden" name="person_id" value={who} />
          <Section title="Everything else"
            blurb="The things that are not places. Each row carries only the verbs that mean something for it.">
            <div className="tblwrap"><table className="matrix">
              <thead><tr><th>Permission</th><th>View</th><th>Edit</th><th>Export</th></tr></thead>
              <tbody>{FLAT_OBJECTS.map((o) => (
                <tr key={o.key}>
                  <td><b>{o.label}</b><small>{o.blurb}</small></td>
                  {(['view', 'edit', 'export'] as const).map((v) => (
                    <td key={v}>{o.verbs.includes(v)
                      ? <input type="checkbox" defaultChecked={held(g, o.key, v)} readOnly
                               aria-label={`${o.label}: ${v}`} />
                      : <span className="muted">—</span>}</td>
                  ))}
                </tr>
              ))}</tbody>
            </table></div>
          </Section>

          <Section title="Organizations"
            blurb="A grant here covers everything beneath it. Places offer View and nothing else — editing a place is Manage organizations, one permission rather than forty.">
            <div className="tblwrap"><table className="matrix">
              <thead><tr><th>Organization</th><th>View</th></tr></thead>
              <tbody>{(entities ?? []).map((e: any) => (
                <tr key={e.id}>
                  <td style={{ paddingLeft: e.parent_id ? 30 : undefined }}>
                    <b>{e.name}</b>
                    {e.parent_id && <small>Covered by a grant on its parent.</small>}
                  </td>
                  <td><input type="checkbox" readOnly
                       defaultChecked={held(g, 'entity', PLACE_VERBS[0], e.id)}
                       aria-label={`${e.name}: view`} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          </Section>
          </ActionForm>
        </>
      )}
    </>
  )
}
