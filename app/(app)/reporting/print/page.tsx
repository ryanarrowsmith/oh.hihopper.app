import { supabaseServer } from '@/lib/supabase/server'
import PrintSheet from '@/components/PrintSheet'

export const dynamic = 'force-dynamic'

/**
 * The chosen reports, on paper.
 *
 * A page of its own rather than a print stylesheet over the list, for two
 * reasons. The cards on the list draw their chart at 64px, which is a shape to
 * glance at and not something anybody wants printed; and page breaks have to be
 * decided by something that knows where a report starts and ends, which a grid
 * of cards does not.
 *
 * The ids come through the address, and every one of them is re-read here
 * through the caller's own session — so an id somebody typed in for a report
 * they may not see comes back empty from the database rather than being
 * filtered out afterwards.
 */
export default async function Print({ searchParams }: { searchParams: { ids?: string } }) {
  const ids = (searchParams.ids ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40)
  if (ids.length === 0) return <p className="empty">Nothing chosen to print.</p>

  const db = supabaseServer()
  const [{ data: state }, { data: reports }, { data: readings },
         { data: ents }, { data: depts }, { data: cats }] = await Promise.all([
    db.schema('hopper').from('report_state').select('*').in('report_id', ids),
    db.schema('hopper').from('report').select('id, chart_measures, date_column').in('id', ids),
    db.schema('hopper').from('reading').select('report_id, observed_on, value, measure')
      .in('report_id', ids).order('observed_on', { ascending: true }),
    db.schema('hopper').from('entity').select('id, name'),
    db.schema('hopper').from('department').select('id, name'),
    db.schema('hopper').from('report_category').select('id, name'),
  ])

  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]))
  const catName = new Map((cats ?? []).map((c: any) => [c.id, c.name]))
  const spec = new Map((reports ?? []).map((r: any) => [r.id, r]))

  const byReport = new Map<string, Map<string, { on: string; v: number }[]>>()
  for (const r of readings ?? []) {
    const m = byReport.get(r.report_id) ?? new Map()
    const k = r.measure ?? 'Value'
    m.set(k, [...(m.get(k) ?? []), { on: r.observed_on, v: Number(r.value) }])
    byReport.set(r.report_id, m)
  }

  // In the order they were chosen, because that is the order the person meant.
  const sheets = ids.map((id) => {
    const st: any = (state ?? []).find((s: any) => s.report_id === id)
    if (!st) return null
    const sp: any = spec.get(id)
    const named: string[] = sp?.chart_measures?.length
      ? sp.chart_measures : [...(byReport.get(id)?.keys() ?? [])]
    return {
      id, name: st.name,
      where: [entName.get(st.entity_id), deptName.get(st.department_id), catName.get(st.category_id)]
        .filter(Boolean).join(' · '),
      chartType: st.chart_type ?? 'line',
      dated: !!sp?.date_column,
      value: st.value == null ? null : Number(st.value),
      valueOn: st.value_on,
      lastLook: st.last_look,
      refresh: st.refresh,
      series: named.filter((m) => byReport.get(id)?.has(m))
        .map((m) => ({ measure: m, points: byReport.get(id)!.get(m)! })),
    }
  }).filter(Boolean) as any[]

  return <PrintSheet sheets={sheets} />
}
