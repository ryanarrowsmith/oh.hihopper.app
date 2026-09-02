import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import { MODULES } from '@/lib/access'

export default async function Entity({ params }: { params: { id: string } }) {
  const db = supabaseServer()
  const { data: e } = await db.schema('hopper')
    .from('entity').select('*').eq('id', params.id).maybeSingle()
  if (!e) notFound()

  const [{ data: departments }, { data: locations }, { data: mods }] = await Promise.all([
    db.schema('hopper').from('department').select('id, name').eq('entity_id', params.id).order('sort_order'),
    db.schema('hopper').from('location').select('*').eq('entity_id', params.id).order('name'),
    db.schema('hopper').from('entity_module').select('module_key, enabled').eq('entity_id', params.id),
  ])
  const on = new Set((mods ?? []).filter((m: any) => m.enabled).map((m: any) => m.module_key))

  return (
    <>
      <div className="hi">
        <h1>{e.name}</h1>
        <p className="scopeline">
          <span>{e.legal_name ?? 'No legal name on file'} · {e.status}</span>
          <a href="/admin/organizations">Back to the portfolio</a>
        </p>
      </div>

      <Section title="Departments" blurb="A department hangs off this organization and has no page of its own."
        action={<a className="btn">Add a department</a>}>
        {(departments?.length ?? 0) === 0 ? <p className="empty">No departments yet.</p> : (
          <div className="items">
            {departments!.map((d: any) => (
              <div className="item" key={d.id}><div><b>{d.name}</b></div></div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Office locations"
        blurb="A location supplies a person's address and weather. Its time zone is a fact about the office."
        action={<a className="btn">Add a location</a>}>
        {(locations?.length ?? 0) === 0 ? <p className="empty">No locations yet.</p> : (
          <div className="tblwrap"><table className="tbl">
            <thead><tr><th>Name</th><th>City</th><th>Time zone</th><th>Head office</th></tr></thead>
            <tbody>{locations!.map((l: any) => (
              <tr key={l.id}>
                <td><b>{l.name}</b></td>
                <td>{[l.city, l.region].filter(Boolean).join(', ') || '—'}</td>
                <td className="mono" style={{ fontSize: 12.5 }}>{l.time_zone}</td>
                <td>{l.is_head_office ? <span className="pill pill--good">Head office</span> : '—'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Section>

      <Section title="Modules"
        blurb="What this organization runs. Switching one off never deletes — turn it back on and it is where you left it.">
        <div className="tblwrap"><table className="tbl">
          <thead><tr><th>Module</th><th>State</th></tr></thead>
          <tbody>{MODULES.map((m) => (
            <tr key={m.key}>
              <td><b>{m.label}</b></td>
              <td>{on.has(m.key)
                ? <span className="pill pill--good">On</span>
                : <span className="pill">Off</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
    </>
  )
}
