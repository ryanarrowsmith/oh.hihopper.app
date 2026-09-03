'use client'
import { useEffect, useState } from 'react'
import Choice from '@/components/Choice'
import { RowForm } from '@/components/RowEdit'
import { updateReport } from '@/app/actions/reports'
import { CHART_KINDS, KIND_ICON, appliesTo, measureCap } from '@/lib/charts'

type Col = { key: string; label: string; type: 'text' | 'number' | 'date' }

/**
 * Changing a report.
 *
 * Everything about a report was changeable except, once, the thing people
 * actually want to change: what it says. Name, address, tab, schedule, whether
 * it is restricted, and the whole chart are here, and a note is required before
 * any of it saves — a report that quietly changed shape is worse than no report
 * at all, and the only moment anyone knows why it changed is now.
 *
 * The columns come from the last read rather than from a fresh trip to the
 * sheet. Hopper already stored them, the sheet has not moved since it looked,
 * and making somebody wait on a network round-trip to open a form is a form
 * that feels broken.
 *
 * Two halves, and the order is the point. HOW IT SHOWS comes first, because it
 * is what people actually open this for and it is answered by LOOKING -- so
 * every control in it moves the real chart above as you touch it, before
 * anything is saved. WHAT IT READS is the plumbing underneath: an address, a
 * tab, a schedule. Changed once a year, and no amount of staring at the chart
 * tells you whether it is right.
 */
export default function EditReport({ report, columns, onPreview }: {
  report: {
    id: string; name: string; sourceUrl: string | null; sourceTab: string | null
    refresh: string; restricted: boolean; chartType: string
    dateColumn: string | null; measures: string[]; points?: number | null
    together?: boolean
  }
  columns: Col[]
  /** Moves the real chart above this form, live, before anything is saved. */
  onPreview?: (d: { measures: string[]; chartType: string; points: number | null
                    together: boolean }) => void
}) {
  const [chartType, setChartType] = useState(report.chartType)
  const [measures, setMeasures] = useState<string[]>(report.measures)
  const [points, setPoints] = useState<string>(report.points ? String(report.points) : '')
  const [together, setTogether] = useState(report.together === true)
  const [restricted, setRestricted] = useState(report.restricted)

  const dates = columns.filter((c) => c.type === 'date')
  const numbers = columns.filter((c) => c.type === 'number')
  // measureCap, not a number typed out here. The cap was 3 long after the kit
  // went to ten, because the rule lived in three places and only two of them
  // were updated -- the third quietly refused a fourth measure and said the
  // reason was colour.
  const cap = measureCap(chartType)

  // Whatever is in this form is what the chart above shows. Not on save: the
  // whole question -- is this the right headline, is this the right mark -- is
  // one you answer by seeing it.
  useEffect(() => {
    const n = Number(points)
    onPreview?.({ measures, chartType, together,
      points: Number.isFinite(n) && n >= 2 ? Math.round(n) : null })
  }, [measures, chartType, points, together, onPreview])

  const moveMeasure = (i: number, by: number) => setMeasures((m) => {
    const j = i + by
    if (j < 0 || j >= m.length) return m
    const next = [...m]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })

  return (
    <RowForm action={updateReport} label="Save the change" busy="Saving…">
      <input type="hidden" name="id" value={report.id} />
      {/* The chips are the control; these carry what they chose. */}
      {measures.map((m) => <input key={m} type="hidden" name="measure" value={m} />)}
      <input type="hidden" name="chart_type" value={chartType} />

      <p className="edh">How it shows</p>

      <div className="formrow">
        <div>
          <label htmlFor="er-name">Report name</label>
          <input className="field" id="er-name" name="name" defaultValue={report.name} required />
        </div>
        <div>
          <label htmlFor="er-kind">Drawn as</label>
          <Choice id="er-kind" name="chart_kind_display" defaultValue={chartType}
                  filterFrom={99} placeholder="How to draw it"
                  onPick={(k) => {
                    setChartType(k)
                    // A kind that draws fewer than are chosen takes the first
                    // ones, rather than leaving a selection the chart will
                    // silently ignore.
                    setMeasures((m) => m.slice(0, measureCap(k)))
                  }}
                  options={CHART_KINDS.flatMap((g) =>
                    g.kinds.filter((k) => appliesTo(k.k, Math.max(measures.length, 1)))
                      .map((k) => ({ value: k.k as string, label: k.t as string,
                                     hint: k.s as string, icon: KIND_ICON[k.k],
                                     group: g.group as string })))} />
        </div>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label>What is drawn, and in what order</label>
          {numbers.length === 0
            ? <p className="hint" style={{ marginTop: 0 }}>
                Hopper has not read this source yet, so it does not know what columns it has.
                Refresh it and they appear here.
              </p>
            : <>
                {/* The chosen ones, ORDERED. The first is the headline -- the
                    big number on the card and at the top of the page -- and
                    until now the only way to change which one that was, was to
                    unpick everything and pick it again in the right order.
                    Nobody discovered that. They just lived with a report whose
                    headline was the week number. */}
                {measures.length > 0 && (
                  <ol className="mord">
                    {measures.map((m, i) => (
                      <li className="mord__r" key={m}>
                        <span className="mord__n">{i + 1}</span>
                        <span className="mord__l">{m}</span>
                        {i === 0 && <span className="mord__h">Headline</span>}
                        <span className="mord__b">
                          <button type="button" className="mord__x" aria-label={`Move ${m} up`}
                                  disabled={i === 0} onClick={() => moveMeasure(i, -1)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 15l6-6 6 6" /></svg>
                          </button>
                          <button type="button" className="mord__x" aria-label={`Move ${m} down`}
                                  disabled={i === measures.length - 1}
                                  onClick={() => moveMeasure(i, 1)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9l6 6 6-6" /></svg>
                          </button>
                          <button type="button" className="mord__x mord__x--off"
                                  aria-label={`Take ${m} off the chart`}
                                  onClick={() => setMeasures(measures.filter((x) => x !== m))}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12" /></svg>
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="chips" style={{ marginTop: measures.length ? 10 : 0 }}>
                  {numbers.filter((c) => !measures.includes(c.label)).map((c) => {
                    const full = measures.length >= cap
                    return (
                      <button key={c.key} type="button" disabled={full} className="chip"
                        title={full ? `${chartType === 'pie' || chartType === 'big'
                          ? 'This one draws a single measure.'
                          : `This one draws ${cap}.`}` : undefined}
                        onClick={() => setMeasures([...measures, c.label])}>+ {c.label}</button>
                    )
                  })}
                </div>
                <p className="hint">
                  The first is the headline — it is the number on the card and at the top of
                  this page. {cap === 1 ? 'This chart draws one.' : `This chart draws up to ${cap}.`}
                </p>
              </>}
        </div>
      </div>

      <div className="inline1" style={{ marginTop: 14 }}>
        <label htmlFor="er-points">How many readings the chart draws</label>
        <input className="field" id="er-points" name="chart_points" type="number"
               min={2} max={500} value={points} placeholder="Every one in the range"
               onChange={(e) => setPoints(e.target.value)} />
        <p className="hint">The most recent this many. Empty draws every reading the date
          range holds, which is what a report meant before this existed.</p>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="er-together">Keep them on one plot</label>
          <div className="togline">
            <span className="tog">
              <input id="er-together" name="chart_together" type="checkbox" checked={together}
                     aria-label="Keep them on one plot"
                     onChange={(e) => setTogether(e.target.checked)} />
              <span className="tog__track" /><span className="tog__knob" />
            </span>
            <span className="togstate">{together ? 'On' : 'Off'}</span>
            <span className="togsay">{together
              ? 'One plot, one scale. Measures much smaller than the biggest will be close to flat — that is the trade.'
              : 'Off, Hopper gives each measure its own plot when they are orders of magnitude apart, because one scale would flatten the small ones.'}</span>
          </div>
        </div>
      </div>

      <p className="edh">What it reads</p>

      <div className="formrow">
        <div>
          <label htmlFor="er-url">Where the data lives</label>
          <input className="field" id="er-url" name="source_url"
                 defaultValue={report.sourceUrl ?? ''} />
        </div>
        <div>
          <label htmlFor="er-tab">Tab</label>
          <input className="field" id="er-tab" name="source_tab"
                 defaultValue={report.sourceTab ?? ''}
                 placeholder="The one the link points at" />
          <p className="hint">Tab names are case-sensitive. Changing either of these does not
            re-read the sheet — press Refresh afterwards to see what came back.</p>
        </div>
      </div>

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="er-ref">How often Hopper goes back</label>
          <Choice id="er-ref" name="refresh" defaultValue={report.refresh}
                  options={[
                    { value: 'hourly', label: 'Hourly', hint: 'Looks every 30 minutes' },
                    { value: 'twice_daily', label: 'Twice a day', hint: 'Looks hourly' },
                    { value: 'daily', label: 'Daily', hint: 'Looks every 4 hours' },
                    { value: 'weekly', label: 'Weekly', hint: 'Looks once a day at 3 AM' },
                  ]} />
        </div>
        <div>
          <label htmlFor="er-date">What dates the rows</label>
          {dates.length
            ? <Choice id="er-date" name="date_column" defaultValue={report.dateColumn ?? ''}
                      placeholder="Choose a column"
                      options={dates.map((c) => ({ value: c.label, label: c.label }))} />
            : <input className="field" id="er-date" name="date_column"
                     defaultValue={report.dateColumn ?? ''}
                     placeholder="Nothing in this source reads as a date" />}
          <p className="hint">Hopper keeps one reading per date per measure, and this is the
            column it dates them by.</p>
        </div>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="er-restricted">Restricted</label>
          <div className="togline">
            <span className="tog">
              <input id="er-restricted" name="restricted" type="checkbox" checked={restricted}
                     aria-label="Restricted"
                     onChange={(e) => setRestricted(e.target.checked)} />
              <span className="tog__track" /><span className="tog__knob" />
            </span>
            <span className="togstate">{restricted ? 'On' : 'Off'}</span>
            <span className="togsay">{restricted
              ? 'Absent for anyone not granted it by name. No role template can stamp it.'
              : 'Anyone who can open the organization can see it.'}</span>
          </div>
        </div>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="er-note">What changed, and why?</label>
          <textarea className="field" id="er-note" name="note" rows={3} required
                    placeholder="The sheet moved to a new tab, so the address changed." />
          <p className="hint">Required, and kept on the report forever. This is the only moment
            anybody knows why.</p>
        </div>
      </div>
    </RowForm>
  )
}
