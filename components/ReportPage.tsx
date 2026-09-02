'use client'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Chart, { Legend, isSplit, type Series } from '@/components/Chart'
import { EditableSection } from '@/components/RowEdit'
import EditReport from '@/components/EditReport'
import RawTable from '@/components/RawTable'
import RangeBar from '@/components/RangeBar'
import { useRange, inWindow } from '@/components/useRange'
import { refreshReport } from '@/app/actions/reports'

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

export default function ReportPage({ report, state, series: all, notes, checks, related, mayEdit, columns }: {
  columns: { key: string; label: string; type: 'text' | 'number' | 'date' }[]
  report: {
    id: string; name: string; entity: string; department: string; category: string | null
    sourceKind: string; sourceUrl: string | null; sourceTab: string | null
    refresh: string; restricted: boolean; chartType: string
    dateColumn: string | null; measures: string[]
  }
  state: {
    value: number | null; valueOn: string | null
    lastLook: string | null; lastLookOk: boolean | null; lastFailure: string | null
  }
  series: Series[]
  notes: { id: string; body: string; at: string }[]
  checks: { read_at: string; ok: boolean; failure: string | null; row_count: number | null; took_ms: number | null }[]
  related: { id: string; name: string; where: string; value: number | null }[]
  mayEdit: boolean
}) {
  const { range, setRange, window: win } = useRange()

  // The same question, answered once for the whole module: this page reads the
  // range Reporting was left on rather than asking again.
  const dated = !!report.dateColumn
  const series = useMemo(() => {
    if (!dated) return all
    return all
      .map((s) => ({ ...s, points: s.points.filter((p) => inWindow(p.on, win)) }))
      .filter((s) => s.points.length > 0)
  }, [all, dated, win])

  const head = series[0]?.points ?? []
  const newest = head[head.length - 1]
  const move = head.length > 1 ? newest.v - head[0].v : null
  const counted = {
    total: all.reduce((n, s) => n + s.points.length, 0),
    kept: series.reduce((n, s) => n + s.points.length, 0),
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
        <div className="sec__h"><div className="sec__t">
          <h2>The shape</h2>
          <p>What the number has been doing, from the readings Hopper has actually taken.</p>
        </div></div>

        <div className="card" style={{ padding: 18 }}><div className="shape">
          <div className="shape__c">
          {head.length < 2
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
                <Chart type={report.chartType} series={series} height={400} picked={picked} />
                {/* Only when the plot is shared. Split plots each carry their
                    own name and swatch, so a legend under them is a second
                    label for something already labelled. */}
                {!isSplit(series) && <Legend series={series} />}
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
        editForm={mayEdit ? <EditReport report={report} columns={columns} /> : undefined}
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
                  <p className="noteline__b">{n.body}</p>
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
