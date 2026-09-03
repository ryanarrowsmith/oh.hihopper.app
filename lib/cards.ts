import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import type { Card } from '@/components/Reports'
import { freshnessOf, lateBy } from '@/lib/freshness'

/**
 * Every report this reader may see, as cards.
 *
 * Lifted out of the Reporting page when dashboards arrived, because a
 * dashboard draws the same card from the same eight reads and a second copy of
 * this would be a second answer to "what does a report look like". Access is
 * not enforced here and must not be: the policy on hopper.report is what
 * decides, which is why this can read the whole table and still be right.
 * Anything a person may not see comes back absent, so it is absent from the
 * dashboard too -- a card that vanishes is the correct behaviour for a report
 * somebody has been un-granted.
 */
export async function loadCards(): Promise<Card[]> {
  const db = supabaseServer()

  const [{ data: state }, { data: cats }, { data: depts }, { data: ents },
         { data: readings }, { data: specs }, { data: hearts }] =
    await Promise.all([
      db.schema('hopper').from('report_state').select('*'),
      db.schema('hopper').from('report_category').select('id, name, department_id'),
      db.schema('hopper').from('department').select('id, name, entity_id'),
      db.schema('hopper').from('entity').select('id, name').order('sort_order'),
      db.schema('hopper').from('reading')
        .select('report_id, observed_on, value, measure')
        .order('observed_on', { ascending: true }),
      db.schema('hopper').from('report').select('id, chart_measures, chart_points'),
      db.schema('hopper').from('my_favorites').select('object, object_id').eq('object', 'report'),
    ])

  const catName = new Map((cats ?? []).map((c: any) => [c.id, c.name]))
  const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]))
  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))

  const series = new Map<string, Map<string, { on: string; v: number }[]>>()
  for (const r of readings ?? []) {
    const byMeasure = series.get(r.report_id) ?? new Map()
    const key = r.measure ?? 'Value'
    const list = byMeasure.get(key) ?? []
    list.push({ on: r.observed_on, v: Number(r.value) })
    byMeasure.set(key, list)
    series.set(r.report_id, byMeasure)
  }

  const measuresOf = new Map((specs ?? []).map((r: any) => [r.id, r.chart_measures as string[] | null]))
  const pointsOf = new Map((specs ?? []).map((r: any) => [r.id, r.chart_points as number | null]))
  const hearted = new Set((hearts ?? []).map((h: any) => h.object_id))

  return (state ?? []).map((r: any) => ({
    id: r.report_id,
    name: r.name,
    entity: entName.get(r.entity_id) ?? '—',
    entityId: r.entity_id ?? null,
    department: deptName.get(r.department_id) ?? 'No department',
    category: catName.get(r.category_id) ?? null,
    value: r.value == null ? null : Number(r.value),
    valueOn: r.value_on,
    chartType: r.chart_type ?? 'line',
    refresh: r.refresh,
    snapshotAt: r.snapshot_at,
    restricted: r.restricted,
    lastLook: r.last_look,
    lastLookOk: r.last_look_ok,
    lastFailure: r.last_failure,
    freshness: freshnessOf(r),
    lateBy: lateBy(r),
    series: orderedSeries(series.get(r.report_id), measuresOf.get(r.report_id),
                          pointsOf.get(r.report_id) ?? null),
    dated: !!r.date_column,
    favorite: hearted.has(r.report_id),
  }))
}

/**
 * The series a report draws, in the order its chart names them.
 *
 * Every reading, not the last thirteen: the date range decides what is drawn,
 * and pre-slicing here would mean a window reaching further back than thirteen
 * readings quietly found nothing in it.
 *
 * Reading order out of the database is by date, not by measure, and a Map keeps
 * insertion order -- so without this the colours would follow whichever measure
 * happened to have the oldest row, and could change between two loads of the
 * same page.
 */
function orderedSeries(
  byMeasure: Map<string, { on: string; v: number }[]> | undefined,
  named: string[] | null | undefined,
  /** How many of the most recent readings to draw. Null means all of them. */
  points: number | null,
) {
  if (!byMeasure) return []
  const order = named?.length ? named : [...byMeasure.keys()]
  return order
    .filter((m) => byMeasure.has(m))
    .map((m) => {
      const all = byMeasure.get(m)!
      // Sliced from the END, per measure, and AFTER the ordering -- the last
      // ten readings of each measure, not the last ten rows of the table. A
      // measure that missed a week would otherwise be drawn a week short
      // against its neighbours.
      return { measure: m, points: points ? all.slice(-points) : all }
    })
}
