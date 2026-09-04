import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import type { Card } from '@/components/Reports'
import { freshnessOf, lateBy } from '@/lib/freshness'
import { dateShaped, drawnCols, fromLong, keyWord, readSpec, valueWord,
         type Col, type LongRow } from '@/lib/pivot'

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
         { data: readings }, { data: specs }, { data: hearts },
         { data: kept }, { data: shapes }] =
    await Promise.all([
      db.schema('hopper').from('report_state').select('*'),
      db.schema('hopper').from('report_category').select('id, name, department_id'),
      db.schema('hopper').from('department').select('id, name, entity_id'),
      db.schema('hopper').from('entity').select('id, name').order('sort_order'),
      db.schema('hopper').from('reading')
        .select('report_id, observed_on, value, measure')
        .order('observed_on', { ascending: true }),
      db.schema('hopper').from('report').select('id, chart_measures, chart_points, chart_spec'),
      db.schema('hopper').from('my_favorites').select('object, object_id').eq('object', 'report'),
      // A pivot report writes no readings -- there is no date to hang one on --
      // so its card had no number and no shape and said "Not read yet" about a
      // sheet it had read eighty-four thousand rows of. The kept pivot is
      // exactly the material a card needs, and it is already computed.
      db.schema('hopper').from('report_pivot_fresh').select('report_id, cells'),
      // Only the column list. report_rows also carries five hundred rows of
      // sample per report, and a page of cards has no use for any of them.
      db.schema('hopper').from('report_rows').select('report_id, columns'),
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

  const keptOf = new Map((kept ?? []).map((r: any) => [r.report_id, r.cells as LongRow[]]))
  const colsOf = new Map((shapes ?? []).map((r: any) => [r.report_id, (r.columns ?? []) as Col[]]))
  const specOf = new Map((specs ?? []).map((r: any) => [r.id, r.chart_spec]))

  const measuresOf = new Map((specs ?? []).map((r: any) => [r.id, r.chart_measures as string[] | null]))
  const pointsOf = new Map((specs ?? []).map((r: any) => [r.id, r.chart_points as number | null]))
  const hearted = new Set((hearts ?? []).map((h: any) => h.object_id))

  return (state ?? []).map((r: any) => {
  const drawn = pivotCard(r.report_id, specOf.get(r.report_id),
                          keptOf.get(r.report_id), colsOf.get(r.report_id))
  return {
    id: r.report_id,
    name: r.name,
    entity: entName.get(r.entity_id) ?? '—',
    entityId: r.entity_id ?? null,
    department: deptName.get(r.department_id) ?? 'No department',
    category: catName.get(r.category_id) ?? null,
    value: drawn ? drawn.value : r.value == null ? null : Number(r.value),
    valueOn: drawn ? null : r.value_on,
    chartType: drawn ? drawn.type : r.chart_type ?? 'line',
    refresh: r.refresh,
    snapshotAt: r.snapshot_at,
    restricted: r.restricted,
    lastLook: r.last_look,
    lastLookOk: r.last_look_ok,
    lastFailure: r.last_failure,
    freshness: freshnessOf(r),
    lateBy: lateBy(r),
    series: drawn ? drawn.series
                  : orderedSeries(series.get(r.report_id), measuresOf.get(r.report_id),
                                  pointsOf.get(r.report_id) ?? null),
    // A pivot is not on a timeline, so the date range has nothing to cut and
    // the card is shown whole -- same as a source with no date column.
    dated: !drawn && !!r.date_column,
    axis: drawn ? drawn.axis : null,
    favorite: hearted.has(r.report_id),
  }
  })
}

/**
 * A card for a report whose chart is a pivot.
 *
 * Its number is the grand total -- which the pivot already worked out with the
 * right arithmetic, so an average stays an average rather than becoming a sum
 * of averages.
 *
 * Its picture is the REPORT'S OWN CHART, small. The first version drew the
 * column margins instead -- three month totals where the report draws five
 * accounts by three months -- and it was numerically perfect and the wrong
 * picture: a card is the small version of the thing you get when you click it,
 * and this one summarised a chart it was supposed to be a thumbnail of. Same
 * row keys along the axis, same three columns colored, same rule for choosing
 * which three, because drawnCols() is the one that decides for both.
 *
 * Null for anything that is not a pivot, or whose kept answer is not current --
 * the view only hands back one that still answers the report's own spec over
 * the rows it holds, so absent here means the card falls back to readings
 * exactly as it always did.
 */
function pivotCard(id: string, raw: unknown, cells?: LongRow[], cols?: Col[]) {
  if (!raw || !cells || cells.length === 0) return null
  const spec = readSpec(raw)
  if (spec.values.length === 0 || spec.rows.length === 0) return null
  if (dateShaped(spec) !== null) return null

  const p = fromLong(cells, spec, cols ?? [])
  if (p.rowKeys.length === 0) return null

  // Exactly what PivotView builds for the first measure. Nothing in Columns
  // means the row totals ARE the series, which is what p.cell falls back to.
  const drawn = drawnCols(p, spec, cols ?? [])
  const series = (drawn.length ? drawn : ['']).map((c) => ({
    measure: drawn.length ? keyWord(c, p.colGrain) : valueWord(spec.values[0]),
    points: p.rowKeys
      .map((r) => ({ on: r, v: p.cell(r, c, 0) }))
      .filter((q): q is { on: string; v: number } => q.v !== null),
  })).filter((s) => s.points.length > 0)
  if (series.length === 0) return null

  return {
    value: p.grand(0),
    type: spec.type,
    series,
    // The order the pivot put them in, so a card does not re-sort a category
    // axis alphabetically behind the chart's back.
    //
    // The GRAIN, not a function that closes over it. This is loaded by a
    // server component and handed to a client one, and a function cannot
    // cross that boundary -- it throws at render, which is a 500 on the home
    // page rather than a type error at build. The client writes the label; it
    // has keyWord() too, and this way the two cannot disagree either.
    axis: { order: p.rowKeys, grain: p.rowGrain ?? null },
  }
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
