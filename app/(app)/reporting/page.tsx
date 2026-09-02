import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import Reports, { type Card } from '@/components/Reports'

export const dynamic = 'force-dynamic'

/**
 * Reporting — the reports for the organizations you can open.
 *
 * Access is subtractive and silent: a report somebody may not see is ABSENT,
 * not greyed out and not counted. That is not enforced here — it is enforced by
 * the policy on hopper.report, which is why this page can read the whole table
 * and still be right. A count computed in JavaScript would be a second, weaker
 * answer to a question the database has already answered.
 */
export default async function Reporting() {
  const db = supabaseServer()

  const [{ data: state }, { data: cats }, { data: depts }, { data: ents }, { data: readings },
         { data: rights }, { data: specs }, { data: hearts }] =
    await Promise.all([
      db.schema('hopper').from('report_state').select('*'),
      db.schema('hopper').from('report_category').select('id, name, department_id'),
      db.schema('hopper').from('department').select('id, name, entity_id'),
      db.schema('hopper').from('entity').select('id, name').order('sort_order'),
      // The shape behind the number. Thirteen points is what the card draws;
      // more than that is a chart, and a chart belongs on the report's own page.
      db.schema('hopper').from('reading')
        .select('report_id, observed_on, value, measure')
        .order('observed_on', { ascending: true }),
      db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
      db.schema('hopper').from('report').select('id, chart_measures'),
      // Somebody's own hearts. my_favorites is already scoped to the person, so
      // there is no person_id to pass and no way to read anybody else's.
      db.schema('hopper').from('my_favorites').select('object, object_id').eq('object', 'report'),
    ])

  // Where this person may register one. The button is not rendered at all when
  // the answer is nowhere -- an offer you cannot accept is worse than no offer.
  const mayAdd = (rights ?? []).some((r: any) => r.may_edit)

  const catName = new Map((cats ?? []).map((c: any) => [c.id, c.name]))
  const deptName = new Map((depts ?? []).map((d: any) => [d.id, d.name]))
  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))

  // One entry per report per measure. The card and the chart both read this,
  // so a report with three measures draws three lines rather than one line
  // made of three measures interleaved -- which is what a single flat list
  // would have produced.
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

  const cards: Card[] = (state ?? []).map((r: any) => ({
    id: r.report_id,
    name: r.name,
    entity: entName.get(r.entity_id) ?? '—',
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
    // In the order the chart builder named them, so the first measure is the
    // one the headline number belongs to and the colours never shuffle between
    // one look at the page and the next.
    series: orderedSeries(series.get(r.report_id), measuresOf.get(r.report_id)),
    // Whether it can be put on a timeline at all.
    dated: !!r.date_column,
    favorite: hearted.has(r.report_id),
  }))

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Reporting</h1>
        <p className="scopeline">
          <span>{cards.length === 0
            ? 'Nothing registered yet.'
            : `${cards.length} report${cards.length === 1 ? '' : 's'} across the organizations you can open.`}</span>
        </p>
      </div>
      {mayAdd && <div className="hi__go">
        {/* Categories live under Reporting rather than beside it: one entry in
            the menu, and the vocabulary is reachable from the place it governs. */}
        <Link className="btn" href="/reporting/categories">Categories</Link>
        <Link className="btn btn--amber" href="/reporting/new">Add a report</Link>
      </div>}</div>

      {cards.length === 0
        ? <div className="empty">
            <p>A report in Hopper is a pointer, not data: a spreadsheet, one tab inside it, and
               a schedule for going back to look.</p>
            {mayAdd && <p><Link className="btn btn--amber" href="/reporting/new">Point it at something</Link></p>}
          </div>
        : <Reports cards={cards} />}
    </>
  )
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

  const still = Date.now() - new Date(r.value_on).getTime()
  const day = 86_400_000
  const allowed = r.refresh === 'weekly' ? 9 * day
    : r.refresh === 'daily' ? 2 * day
    : day
  return still > allowed ? 'behind' : 'good'
}
