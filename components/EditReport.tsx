'use client'
import { useState } from 'react'
import Choice from '@/components/Choice'
import { RowForm } from '@/components/RowEdit'
import { updateReport } from '@/app/actions/reports'

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
 */
export default function EditReport({ report, columns }: {
  report: {
    id: string; name: string; sourceUrl: string | null; sourceTab: string | null
    refresh: string; restricted: boolean; chartType: string
    dateColumn: string | null; measures: string[]
  }
  columns: Col[]
}) {
  const [chartType, setChartType] = useState(report.chartType)
  const [measures, setMeasures] = useState<string[]>(report.measures)
  const [restricted, setRestricted] = useState(report.restricted)

  const dates = columns.filter((c) => c.type === 'date')
  const numbers = columns.filter((c) => c.type === 'number')
  const cap = chartType === 'pie' ? 1 : 3

  return (
    <RowForm action={updateReport} label="Save the change" busy="Saving…">
      <input type="hidden" name="id" value={report.id} />
      {/* The chips are the control; these carry what they chose. */}
      {measures.map((m) => <input key={m} type="hidden" name="measure" value={m} />)}
      <input type="hidden" name="chart_type" value={chartType} />

      <div className="formrow">
        <div>
          <label htmlFor="er-name">Report name</label>
          <input className="field" id="er-name" name="name" defaultValue={report.name} required />
        </div>
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
      </div>

      <div className="formrow" style={{ marginTop: 12 }}>
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
          <label>The chart</label>
          <div className="chips">
            {(['line', 'bar', 'pie'] as const).map((k) => (
              <button key={k} type="button"
                      className={`chip${chartType === k ? ' chip--on' : ''}`}
                      onClick={() => {
                        setChartType(k)
                        if (k === 'pie') setMeasures((m) => m.slice(0, 1))
                      }}>
                {k === 'line' ? 'A line' : k === 'bar' ? 'Bars' : 'A pie'}
              </button>
            ))}
          </div>
          <p className="hint">A line is what it has been doing; bars compare periods; a pie
            splits one total, and takes one measure.</p>
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
          <label>What is measured</label>
          {numbers.length === 0
            ? <p className="hint" style={{ marginTop: 0 }}>
                Hopper has not read this source yet, so it does not know what columns it has.
                Refresh it and they appear here.
              </p>
            : <>
                <div className="chips">
                  {numbers.map((c) => {
                    const on = measures.includes(c.label)
                    const full = !on && measures.length >= cap
                    return (
                      <button key={c.key} type="button" disabled={full}
                        className={`chip${on ? ' chip--on' : ''}`}
                        title={full ? (chartType === 'pie'
                          ? 'A pie shows one measure.'
                          : 'Three is the cap — only the first three colors separate at a glance.') : undefined}
                        onClick={() => setMeasures(on
                          ? measures.filter((m) => m !== c.label)
                          : [...measures, c.label])}>{c.label}</button>
                    )
                  })}
                </div>
                <p className="hint">
                  {chartType === 'pie' ? 'One measure.' : 'Up to three.'} The first one is the
                  headline — it is the number on the card and at the top of this page.
                </p>
              </>}
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
