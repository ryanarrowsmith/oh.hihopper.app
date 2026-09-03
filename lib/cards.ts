import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import type { Card } from '@/components/Reports'

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
      db.schema('hopper').from('report').select('id, chart_measures'),
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
    series: orderedSeries(series.get(r.report_id), measuresOf.get(r.report_id)),
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
) {
  if (!byMeasure) return []
  const order = named?.length ? named : [...byMeasure.keys()]
  return order
    .filter((m) => byMeasure.has(m))
    .map((m) => ({ measure: m, points: byMeasure.get(m)! }))
}

/**
 * Current, behind, or failed.
 *
 * When Hopper last LOOKED and when the data last MOVED are different questions,
 * and only the second one matters: a sheet nobody has touched in three weeks
 * still answers every request instantly, so calling that "fresh" fails quietly,
 * which is the worst way to fail. A report may go without moving for about as
 * long as its schedule implies; past that it is behind, whatever the last look
 * said.
 */
function freshnessOf(r: any): 'new' | 'good' | 'behind' | 'failed' | 'snapshot' {
  if (r.snapshot_at) return 'snapshot'
  if (!r.last_look) return 'new'
  if (r.last_look_ok === false) return 'failed'
  if (!r.value_on) return 'good'

  const still = Date.now() - dayStart(r.value_on)
  return still > allowedFor(r.refresh) ? 'behind' : 'good'
}

/**
 * A report may go without moving for about as long as its schedule implies.
 * Nine days for a weekly one and not seven, because a sheet updated every
 * Monday is not late on Sunday night -- an allowance with no slack in it flags
 * every healthy report once a week, and a flag that cries wolf is worse than
 * no flag.
 */
function allowedFor(refresh: string | null) {
  const day = 86_400_000
  return refresh === 'weekly' ? 9 * day : refresh === 'daily' ? 2 * day : day
}

/**
 * How many days past its allowance, for the card to say so in a number.
 *
 * "Behind" is a yes or no; how far behind is what decides whether you deal with
 * it now or on Friday, and the card has room to say which. Counted from the
 * allowance and not from the last reading, so the figure means "overdue by",
 * which is the thing a person acts on.
 */
function lateBy(r: any): number | null {
  if (r.snapshot_at || !r.value_on) return null
  const over = Date.now() - dayStart(r.value_on) - allowedFor(r.refresh)
  // Floored, not rounded. A warning that rounds up is a warning that overstates
  // its case, and this one is asking somebody to go and do something.
  return over > 0 ? Math.max(1, Math.floor(over / 86_400_000)) : null
}

/**
 * A date the sheet supplied is a DAY, not an instant, and `new Date('2026-08-08')`
 * is UTC midnight -- the same trap the card's own date formatter documents.
 * Anchoring both at the start of the day is what keeps "still since Aug 8" and
 * "24 days late" talking about one Aug 8.
 */
const dayStart = (iso: string) => new Date(`${iso}T00:00:00`).getTime()
