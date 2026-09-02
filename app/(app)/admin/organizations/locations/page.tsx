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
            <thead><tr><th>Name</th><th>Organization</th></tr></thead>
            <tbody>{rows!.map((r: any) => (
              <tr key={r.id}><td><b>{r.name}</b></td><td>{nameOf(r.entity_id)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>
    </>
  )
}
