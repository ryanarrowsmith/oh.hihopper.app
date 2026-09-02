import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'

export default async function Page() {
  const db = supabaseServer()
  const { data: rows } = await db.schema('hopper').from('location')
    .select('*').order('name')
  const { data: entities } = await db.schema('hopper').from('entity').select('id, name')
  const nameOf = (id: string) => (entities ?? []).find((e: any) => e.id === id)?.name ?? '—'
  return (
    <>
      <div className="hi"><h1>Locations</h1></div>
      <Section title="Across the portfolio" blurb={`${rows?.length ?? 0} in the organizations you can open.`}>
        {(rows?.length ?? 0) === 0 ? <p className="empty">Nothing here yet.</p> : (
          <div className="tblwrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Organization</th><th>City</th><th>Map</th></tr></thead>
            <tbody>{rows!.map((r: any) => (
              <tr key={r.id}>
                <td><a href={`/admin/organizations/${r.entity_id}/locations/${r.id}`}
                       style={{ fontWeight: 800, color: 'var(--steel-ink)' }}>{r.name}</a>
                  {r.is_head_office && <> <span className="pill pill--good">Head office</span></>}
                </td>
                <td>{nameOf(r.entity_id)}</td>
                <td>{[r.city, r.region].filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
                <td>{r.latitude != null
                  ? <span className="pill pill--good">Pinned</span>
                  : <span className="pill">No pin</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
    </>
  )
}
