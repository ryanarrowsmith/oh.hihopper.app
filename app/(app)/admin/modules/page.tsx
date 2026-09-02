import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import { MODULES, CORE_MODULES } from '@/lib/access'

export default async function Modules() {
  const db = supabaseServer()
  const { data: entities } = await db.schema('hopper')
    .from('entity').select('id, name, parent_id').order('sort_order')
  const { data: rows } = await db.schema('hopper')
    .from('entity_module').select('entity_id, module_key, enabled')

  const on = (ent: string, key: string) =>
    (rows ?? []).some((r: any) => r.entity_id === ent && r.module_key === key && r.enabled)

  return (
    <>
      <div className="hi"><h1>Modules</h1>
        <p className="scopeline"><span>
          Two switches, and only one of them is here. What the account is
          entitled to comes from what you bought; which organizations run it is
          set below.
        </span></p>
      </div>

      <Section title="The core"
        blurb="What the flat fee already bought. On for everyone, and not for sale.">
        <div className="frame">
          <ul>{CORE_MODULES.map((m) => <li key={m}>{m.replace(/_/g, ' ')}</li>)}</ul>
        </div>
      </Section>

      <Section title="Optional modules"
        blurb="Switched on per organization. Off never deletes — the selection waits.">
        <div className="tblwrap"><table className="matrix">
          <thead><tr>
            <th>Organization</th>
            {MODULES.map((m) => <th key={m.key}>{m.label}</th>)}
          </tr></thead>
          <tbody>{(entities ?? []).map((e: any) => (
            <tr key={e.id}>
              <td style={{ paddingLeft: e.parent_id ? 30 : undefined }}><b>{e.name}</b></td>
              {MODULES.map((m) => (
                <td key={m.key}>
                  <input type="checkbox" readOnly defaultChecked={on(e.id, m.key)}
                         aria-label={`${e.name}: ${m.label}`} />
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
    </>
  )
}
