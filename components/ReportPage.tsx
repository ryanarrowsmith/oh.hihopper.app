'use client'
import Link from 'next/link'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Chart, { Legend, isSplit, splitWhy, type Series } from '@/components/Chart'
import PivotView from '@/components/PivotView'
import { dateShaped, type Cell, type Spec } from '@/lib/pivot'
import ChartPick from '@/components/ChartPick'
import { setChartTogether } from '@/app/actions/reports'
import { EditableSection } from '@/components/RowEdit'
import EditReport from '@/components/EditReport'
import Mentioned from '@/components/Mentioned'
import type { Named } from '@/lib/mentions'
import RawTable from '@/components/RawTable'
import RangeBar from '@/components/RangeBar'
import { useRange, inWindow } from '@/components/useRange'
import { refreshReport } from '@/app/actions/reports'
import CrumbTail from '@/components/CrumbTail'

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** A day the sheet supplied is a DAY. Parsed bare it is UTC midnight, which
 *  west of Greenwich renders as the day before. */
const on = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' })

const at = (iso: string) =>
  new Date(iso).toLocaleString('en-US',
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const cadence = (r: string) => r === 'hourly' ? 'Every 30 minutes'
  : r === 'twice_daily' ? 'Every hour' : r === 'daily' ? 'Every 4 hours'
  : r === 'weekly' ? 'Once a day, at 3 AM' : 'Never — this is a snapshot'

const sourceName = (k: string) => k === 'google_sheet' ? 'Google Sheets'
  : k === 'airtable' ? 'Airtable' : k === 'microsoft' ? 'Microsoft 365'
  : k === 'link' ? 'A link' : k === 'upload' ? 'An uploaded file' : 'Pasted data'

export default function ReportPage({ report, state, series: all, notes, roster, checks, related, mayEdit, columns, rows, spec }: {
  columns: { key: string; label: string; type: 'text' | 'number' | 'date' }[]
  /** The tab as it was last read. What the pivot draws from when the report is
   *  not one date down the side. */
  rows: Cell[][]
  spec: Spec
  report: {
    id: string; name: string; entity: string; department: string; category: string | null
    sourceKind: string; sourceUrl: string | null; sourceTab: string | null
    refresh: string; restricted: boolean; chartType: string
    dateColumn: string | null; measures: string[]; points?: number | null
    together?: boolean
  }
  state: {
    value: number | null; valueOn: string | null
    lastLook: string | null; lastLookOk: boolean | null; lastFailure: string | null
  }
  series: Series[]
  notes: { id: string; body: string; at: string }[]
  roster: Named[]
  checks: { read_at: string; ok: boolean; failure: string | null; row_count: number | null; took_ms: number | null }[]
  related: { id: string; name: string; where: string; value: number | null }[]
  mayEdit: boolean
}) {
  const { range, setRange, window: win } = useRange()

  // The same question, answered once for the whole module: this page reads the
  // range Reporting was left on rather than asking again.
  const dated = !!report.dateColumn

  /**
   * How the chart is drawn RIGHT NOW: the mark, the measures in order, and how
   * many readings. Seeded from the report and moved by the picker in the header
   * and by the edit form below -- before either has reached the server, so the
   * chart answers the question the control is asking while it is being asked.
   */
  const [drawSpec, setDrawSpec] = useState<Spec>(spec)
  const drawAs = drawSpec.type
  const drawOrder = drawSpec.values.map((v) => v.field)
  const drawPoints = drawSpec.points
  const drawTogether = drawSpec.together
  const [swapping, swap] = useTransition()
  const preview = useCallback((s: Spec) => setDrawSpec(s), [])
  const setDrawAs = useCallback((t: string) => setDrawSpec((sp) => ({ ...sp, type: t })), [])
  const setDrawTogether = useCallback(
    (on: boolean) => setDrawSpec((sp) => ({ ...sp, together: on })), [])
  /**
   * Which of the two renderings this report gets.
   *
   * A report that is one date down the side, taken as it is, keeps the one it
   * has had all along: readings, which carry more history than the stored rows
   * do, and which the day-picker and the range are built on. Anything else --
   * anything the pivot made possible -- is drawn from the rows themselves,
   * because there are no readings for it to draw from. Two paths, because they
   * are answering two different questions about what a report IS, and pretending
   * otherwise would cost the four live reports their history.
   */
  const asPivot = dateShaped(drawSpec) === null
  const windowed = useMemo(() => {
    if (!dated) return all
    return all
      .map((s) => ({ ...s, points: s.points.filter((p) => inWindow(p.on, win)) }))
      .filter((s) => s.points.length > 0)
  }, [all, dated, win])

  /**
   * The series as the report currently says to draw them: only the chosen
   * measures, in the chosen order, and only the last N of each.
   *
   * Order is not decoration. series[0] is the headline -- the big number on the
   * card and at the top of this page -- so reordering here is how a report
   * whose headline was the week number stops being one.
   */
  const series = useMemo(() => {
    const by = new Map(windowed.map((s) => [s.measure, s]))
    const chosen = drawOrder.length
      ? drawOrder.map((m) => by.get(m)).filter(Boolean) as typeof windowed
      : windowed
    if (!drawPoints) return chosen
    return chosen.map((s) => ({ ...s, points: s.points.slice(-drawPoints) }))
  }, [windowed, drawOrder, drawPoints])

  const head = series[0]?.points ?? []
  const newest = head[head.length - 1]
  const move = head.length > 1 ? newest.v - head[0].v : null
  const counted = {
    total: all.reduce((n, s) => n + s.points.length, 0),
    kept: windowed.reduce((n, s) => n + s.points.length, 0),
    undated: dated ? 0 : 1,
  }

  /**
   * One selection, shared by the chart and the rows.
   *
   * They can be linked at all because both are indexed by the same thing: the
   * day. A chart point IS a day, and a row carries that day in the column the
   * report is dated by. A report with no date column has no correspondence
   * between the two, and the linking is simply not offered rather than offered
   * and wrong.
   */
  /** Opened from the header, and by the pencil on the section below it. One
   *  answer, because two edit forms is two things to keep in step. */
  const [editing, setEditing] = useState(false)
  // What the chart is drawn as RIGHT NOW. Seeded from the report and moved by
  // the picker before the server has answered, so the chart redraws on the
  // click rather than a round trip later.

  const [days, setDays] = useState<Set<string>>(new Set())
  const [last, setLast] = useState<string | null>(null)
  const allDays = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map((p) => p.on)))].sort(),
    [series])

  const pick = useCallback((day: string, extend: boolean) => {
    setDays((prev) => {
      const next = new Set(prev)
      // Shift takes everything between the last pick and this one, which is how
      // anyone selects a stretch of time.
      if (extend && last) {
        const a = allDays.indexOf(last), b = allDays.indexOf(day)
        if (a >= 0 && b >= 0) {
          for (const d of allDays.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(d)
          return next
        }
      }
      next.has(day) ? next.delete(day) : next.add(day)
      return next
    })
    setLast(day)
  }, [allDays, last])

  const clear = useCallback(() => { setDays(new Set()); setLast(null) }, [])
  const picked = report.dateColumn ? { days, pick, clear } : undefined

  // Expanding does not move the table in the tree -- only the classes around it
  // change -- so its sort, its hidden columns and its density all survive.
  const [wide, setWide] = useState(false)

  return (
    <>
      <CrumbTail>{report.name}</CrumbTail>

      <div className="hi">
        <div className="hi__t">
          <h1>{report.name}</h1>
          <p className="scopeline">
            <span>
              {[report.entity, report.department, report.category].filter(Boolean).join(' · ')}
              {report.restricted && <> · <b>Restricted</b></>}
            </span>
          </p>
        </div>
        <div className="hi__go">
          {/* Edit belongs beside Refresh, where everything else you can do to
              this report already is. The pencil in the section header below
              opens the same form -- but a pencil on one section reads as
              "rename this heading", not as "change what this report reads". */}
          {mayEdit && (
            <button className="btn" type="button" onClick={() => setEditing(true)}>
              <svg viewBox="0 0 24 24">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              Edit
            </button>
          )}
          <RefreshBtn id={report.id} />
          <Link className="btn" href="/reporting">All reports</Link>
        </div>
      </div>

      {state.lastLookOk === false && state.lastFailure && (
        // A failure is kept as a failure rather than overwriting the last good
        // number, so the figures below are still whatever Hopper last knew.
        <p className="note note--err" style={{ marginTop: 14 }}>
          <b>The last look failed.</b> {state.lastFailure}
        </p>
      )}

      <RangeBar range={range} setRange={setRange}
                kept={counted.kept} total={counted.total} undated={counted.undated} />

      <section className="sec">
        <div className="sec__h">
          <div className="sec__t">
            <h2>The shape</h2>
            <p>What the number has been doing, from the readings Hopper has actually taken.</p>
          </div>
          {/* Nothing a person may not do is rendered, so a reader gets the
              chart and no control over it. */}
          {mayEdit && series.length > 0 && (
            <div className="sec__a">
              <ChartPick id={report.id} current={drawAs} measures={series.length}
                         onDraft={setDrawAs} />
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 18 }}><div className="shape">
          <div className="shape__c">
          {asPivot
            ? <PivotView tab={{ columns, rows }} spec={drawSpec} height={400} />
            : head.length < 2
            ? <p className="empty" style={{ margin: 0 }}>
                {!state.lastLook
                  ? 'Hopper has not read this one yet. Refresh it and the shape appears.'
                  : counted.total > counted.kept
                  ? 'Nothing in this window. Widen the range and the shape comes back.'
                  : 'One reading so far — a shape needs two.'}
              </p>
            : <>
                {/* Full height here on purpose. This is the room the popover
                    does not have: measures orders of magnitude apart get a plot
                    each rather than one scale that flattens the small ones. */}
                {/* The reason stays whichever way round it is, because "why
                    are there three charts" and "why is this one flat" are the
                    same question and deserve the same answer. The switch is in
                    the sentence: it is where you are already looking. */}
                {splitWhy(series, drawAs, drawTogether) && (
                  <p className="splitwhy">
                    {splitWhy(series, drawAs, drawTogether)}
                    {mayEdit && (
                      <button className="splitwhy__go" type="button" disabled={swapping}
                              onClick={() => {
                                const next = !drawTogether
                                setDrawTogether(next)
                                swap(async () => {
                                  const r = await setChartTogether(report.id, next)
                                  if (!r.ok) setDrawTogether(!next)
                                })
                              }}>
                        {drawTogether ? 'Give each its own plot' : 'Put them on one plot'}
                      </button>
                    )}
                  </p>
                )}
                <Chart type={drawAs} series={series} height={400} picked={picked}
                       together={drawTogether} />
                {/* Only when the plot is shared. Split plots each carry their
                    own name and swatch, so a legend under them is a second
                    label for something already labelled. */}
                {(drawTogether || !isSplit(series, drawAs)) && <Legend series={series} />}
              </>}
          </div>

          <div className="figs shape__f">
            <span className="fig"><span className="fig__l">Now</span>
              <span className="fig__v">{newest ? nf.format(newest.v)
                : state.value == null ? '—' : nf.format(state.value)}</span></span>
            {/* The arrow carries the direction, so the sign would say it twice. */}
            {move != null && <span className="fig"><span className="fig__l">Move</span>
              <span className={`fig__v ${move >= 0 ? 'up' : 'down'}`}>
                {nf.format(Math.abs(move))}
              </span></span>}
            <span className="fig"><span className="fig__l">Dated</span>
              <span className="fig__v" style={{ fontSize: 15 }}>
                {newest ? on(newest.on) : state.valueOn ? on(state.valueOn) : '—'}</span></span>
            <span className="fig"><span className="fig__l">Last look</span>
              <span className="fig__v" style={{ fontSize: 15 }}>
                {state.lastLook ? at(state.lastLook) : 'Never'}</span></span>
            <span className="fig"><span className="fig__l">Goes back</span>
              <span className="fig__v" style={{ fontSize: 15 }}>{cadence(report.refresh)}</span></span>
          </div>
        </div></div>
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>The rows behind it</h2>
          <p>{picked
            ? 'What the sheet actually said. Click a point on the chart, or a row here — the two follow each other.'
            : 'What the sheet actually said, the last time Hopper looked.'}</p>
        </div></div>
        <div className={wide ? 'rscrim' : undefined}
             onMouseDown={wide ? (e) => { if (e.target === e.currentTarget) setWide(false) } : undefined}>
          <div className={wide ? 'rpop rpop--rows' : 'card'}>
            <RawTable reportId={report.id} name={report.name}
                      everRead={state.lastLook != null}
                      dateColumn={report.dateColumn} picked={picked}
                      expanded={wide} onExpand={() => setWide((o) => !o)} />
          </div>
        </div>
      </section>

      {/* Editing happens in place, under the thing being edited, so the report
          you are changing is still on screen while you change it. Nothing a
          person may not do is rendered: no pencil without the right to use it. */}
      <EditableSection
        title="Where it points"
        blurb="A report is a pointer, not data. This is the other end of it."
        editLabel="Change this report"
        editForm={mayEdit
          ? <EditReport report={report} columns={columns} spec={drawSpec} onPreview={preview} />
          : undefined}
        editOpen={editing} onEditOpen={setEditing}
      >
        <div className="card"><div className="facts">
          <div className="row"><span className="row__l">Source</span>
            <span className="row__v">{sourceName(report.sourceKind)}</span></div>
          {report.sourceUrl && (
            <div className="row"><span className="row__l">Address</span>
              <span className="row__v">
                {/* rel=noreferrer because this address came from a form and
                    Hopper has no business vouching for where it goes. */}
                <a href={report.sourceUrl} target="_blank" rel="noreferrer noopener">Open the source</a>
              </span></div>
          )}
          <div className="row"><span className="row__l">Tab</span>
            <span className="row__v">{report.sourceTab || 'The one the link points at'}</span></div>
          <div className="row"><span className="row__l">Dated by</span>
            <span className="row__v">{report.dateColumn || 'Nothing — this source has no dates'}</span></div>
          <div className="row"><span className="row__l">Measures</span>
            <span className="row__v">{report.measures.length ? report.measures.join(', ') : 'None chosen'}</span></div>
        </div></div>
      </EditableSection>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Every look</h2>
          <p>When Hopper went back, what came of it, and how long it took.</p>
        </div></div>
        <div className="card"><div className="facts">
          {checks.length === 0
            ? <p className="empty" style={{ margin: 0 }}>Hopper has never looked at this one.</p>
            : checks.map((c) => (
                <div className="row" key={c.read_at}>
                  <span className="row__l">
                    <span className={`dot dot--${c.ok ? 'good' : 'bad'}`} /> {at(c.read_at)}
                  </span>
                  <span className="row__v">
                    {c.ok
                      ? `${(c.row_count ?? 0).toLocaleString()} rows${c.took_ms ? ` · ${c.took_ms} ms` : ''}`
                      : (c.failure ?? 'It failed and did not say why.')}
                  </span>
                </div>
              ))}
        </div></div>
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Notes</h2>
          <p>Why this report exists and what has changed about it. Required on every save,
             because a report that quietly changed shape is worse than no report at all.</p>
        </div></div>
        <div className="card"><div className="facts">
          {notes.length === 0
            ? <p className="empty" style={{ margin: 0 }}>No notes.</p>
            : notes.map((n) => (
                <div className="noteline" key={n.id}>
                  <p className="noteline__at">{at(n.at)}</p>
                  <p className="noteline__b"><Mentioned text={n.body} roster={roster} /></p>
                </div>
              ))}
        </div></div>
      </section>

      {related.length > 0 && (
        <section className="sec">
          <div className="sec__h"><div className="sec__t">
            <h2>Related</h2>
            <p>The rest of its department first, then its category elsewhere — which is how
               anyone actually reads one number: by reaching for the next.</p>
          </div></div>
          <div className="rgrid rgrid--md">
            {related.map((r) => (
              <Link className="rcard" key={r.id} href={`/reporting/${r.id}`}>
                <span className="rcard__c">{r.where}</span>
                <span className="rcard__n">{r.name}</span>
                {r.value == null
                  ? <span className="rcard__none">Not read yet</span>
                  : <span className="rcard__v">{nf.format(r.value)}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function RefreshBtn({ id }: { id: string }) {
  const [state, run] = useFormState(refreshReport, null)
  return (
    <form action={run} className="rpop__ref">
      <input type="hidden" name="id" value={id} />
      <Go />
      {state && <span className={state.ok ? 'rpop__said' : 'rpop__fail'}>{state.message}</span>}
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Looking…' : 'Refresh'}</button>
}
