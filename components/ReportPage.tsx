'use client'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import Chart, { Legend, type Series } from '@/components/Chart'
import RawTable from '@/components/RawTable'
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

export default function ReportPage({ report, state, series, notes, checks, related, mayEdit }: {
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
  const head = series[0]?.points ?? []
  const move = head.length > 1 ? head[head.length - 1].v - head[0].v : null

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

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>The shape</h2>
          <p>What the number has been doing, from the readings Hopper has actually taken.</p>
        </div></div>

        <div className="card" style={{ padding: 18 }}>
          {head.length < 2
            ? <p className="empty" style={{ margin: 0 }}>
                {state.lastLook
                  ? 'One reading so far — a shape needs two.'
                  : 'Hopper has not read this one yet. Refresh it and the shape appears.'}
              </p>
            : <>
                {/* Full height here on purpose. This is the room the popover
                    does not have: measures orders of magnitude apart get a plot
                    each rather than one scale that flattens the small ones. */}
                <Chart type={report.chartType} series={series} height={400} />
                <Legend series={series} />
              </>}

          <div className="figs">
            <span className="fig"><span className="fig__l">Now</span>
              <span className="fig__v">{state.value == null ? '—' : nf.format(state.value)}</span></span>
            {move != null && <span className="fig"><span className="fig__l">Move</span>
              <span className={`fig__v ${move >= 0 ? 'up' : 'down'}`}>
                {move >= 0 ? '+' : ''}{nf.format(move)}
              </span></span>}
            <span className="fig"><span className="fig__l">Dated</span>
              <span className="fig__v" style={{ fontSize: 15 }}>
                {state.valueOn ? on(state.valueOn) : '—'}</span></span>
            <span className="fig"><span className="fig__l">Last look</span>
              <span className="fig__v" style={{ fontSize: 15 }}>
                {state.lastLook ? at(state.lastLook) : 'Never'}</span></span>
            <span className="fig"><span className="fig__l">Goes back</span>
              <span className="fig__v" style={{ fontSize: 15 }}>{cadence(report.refresh)}</span></span>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>The rows behind it</h2>
          <p>What the sheet actually said, the last time Hopper looked.</p>
        </div></div>
        <div className="card">
          <RawTable reportId={report.id} name={report.name}
                    everRead={state.lastLook != null} />
        </div>
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Where it points</h2>
          <p>A report is a pointer, not data. This is the other end of it.</p>
        </div></div>
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
      </section>

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
