import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import ReportPage from '@/components/ReportPage'
import Remember from '@/components/Remember'

export const dynamic = 'force-dynamic'

/**
 * One report, with room.
 *
 * The popover on the list is for a look; this is the permanent address — the
 * thing you send somebody. It is also where a chart stops having to apologise
 * for its container: three measures orders of magnitude apart get a plot each
 * here, at a height that shows their shape, rather than being squeezed onto one
 * scale that flattens two of them into the axis.
 *
 * A report this person may not see is not an explanation, it is a 404 — the
 * same answer as a report that does not exist, because a locked door is still a
 * door somebody can see. RLS decides that, not this file.
 */
export default async function Page({ params }: { params: { id: string } }) {
  const db = supabaseServer()

  const { data: rep } = await db.schema('hopper').from('report')
    .select('*').eq('id', params.id).maybeSingle()
  if (!rep) notFound()

  // The columns as of the last read. The edit form offers these rather than
  // going back to the sheet: Hopper already stored them, and making somebody
  // wait on a network round-trip to open a form is a form that feels broken.
  const { data: shape } = await db.schema('hopper').from('report_rows')
    .select('columns').eq('report_id', params.id).maybeSingle()

  const [{ data: state }, { data: readings }, { data: notes }, { data: checks },
         { data: ents }, { data: depts }, { data: cats }, { data: rights }, { data: siblings },
         { data: people }] =
    await Promise.all([
      db.schema('hopper').from('report_state').select('*').eq('report_id', params.id).maybeSingle(),
      db.schema('hopper').from('reading')
        .select('observed_on, value, measure').eq('report_id', params.id)
        .order('observed_on', { ascending: true }),
      db.schema('hopper').from('report_note')
        .select('id, body, created_at, author_id').eq('report_id', params.id)
        .order('created_at', { ascending: false }),
      // The looks, newest first. A failure is kept as a failure, so this is
      // where you find out what went wrong three days ago.
      db.schema('hopper').from('report_check')
        .select('read_at, ok, failure, row_count, took_ms').eq('report_id', params.id)
        .order('read_at', { ascending: false }).limit(8),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('department').select('id, name'),
      db.schema('hopper').from('report_category').select('id, name'),
      db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
      // Related runs through the same access test as the list, because it is
      // the same table with the same policy on it. Nothing surfaces here that
      // would have been hidden there.
      db.schema('hopper').from('report_state').select('*').neq('report_id', params.id),
      // Who a note may name. RLS decides which people come back, which is also
      // the access check: a mention cannot light up somebody you cannot see.
      db.schema('hopper').from('directory').select('id, full_name').eq('active', true),
    ])

  const roster = (people ?? []).map((p: any) => ({ id: p.id, name: p.full_name }))

  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]))
  const catName = new Map((cats ?? []).map((c: any) => [c.id, c.name]))

  // In the order the chart builder named them, so the first measure is the one
  // the headline number belongs to and the colours never shuffle.
  const byMeasure = new Map<string, { on: string; v: number }[]>()
  for (const r of readings ?? []) {
    const k = r.measure ?? 'Value'
    byMeasure.set(k, [...(byMeasure.get(k) ?? []), { on: r.observed_on, v: Number(r.value) }])
  }
  const named: string[] = rep.chart_measures?.length ? rep.chart_measures : [...byMeasure.keys()]
  const series = named.filter((m) => byMeasure.has(m))
    .map((m) => ({ measure: m, points: byMeasure.get(m)! }))

  // Its own department first, then its category elsewhere in the organization,
  // then the rest of the organization. That is the order anyone actually reads
  // one number in: by reaching for the next one along.
  const rank = (r: any) =>
    r.department_id === rep.department_id ? 0
    : r.category_id === rep.category_id ? 1
    : r.entity_id === rep.entity_id ? 2 : 3
  const related = (siblings ?? [])
    .map((r: any) => ({ ...r, rank: rank(r) }))
    .filter((r: any) => r.rank < 3)
    .sort((a: any, b: any) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, 6)

  return (
    <>
    {/* Written down here rather than in the page component: this is the only
        place that knows the report was OPENED, as opposed to re-rendered. */}
    <Remember kind="report" id={rep.id} label={rep.name}
              sub={[entName.get(rep.entity_id), deptName.get(rep.department_id)]
                    .filter(Boolean).join(' · ') || null} />
    <ReportPage
      report={{
        id: rep.id, name: rep.name,
        entity: entName.get(rep.entity_id) ?? '—',
        department: deptName.get(rep.department_id) ?? 'No department',
        category: catName.get(rep.category_id) ?? null,
        sourceKind: rep.source_kind, sourceUrl: rep.source_url, sourceTab: rep.source_tab,
        refresh: rep.refresh, restricted: rep.restricted,
        chartType: rep.chart_type ?? 'line',
        dateColumn: rep.date_column,
        measures: rep.chart_measures ?? [],
        points: rep.chart_points ?? null,
        together: rep.chart_together === true,
      }}
      state={{
        value: state?.value == null ? null : Number(state.value),
        valueOn: state?.value_on ?? null,
        lastLook: state?.last_look ?? null,
        lastLookOk: state?.last_look_ok ?? null,
        lastFailure: state?.last_failure ?? null,
      }}
      series={series}
      roster={roster}
      notes={(notes ?? []).map((n: any) => ({ id: n.id, body: n.body, at: n.created_at }))}
      checks={checks ?? []}
      related={related.map((r: any) => ({
        id: r.report_id, name: r.name,
        where: [entName.get(r.entity_id), deptName.get(r.department_id)].filter(Boolean).join(' · '),
        value: r.value == null ? null : Number(r.value),
      }))}
      mayEdit={(rights ?? []).some((r: any) => r.entity_id === rep.entity_id && r.may_edit)}
      columns={(shape?.columns as any[]) ?? []}
    />
    </>
  )
}
