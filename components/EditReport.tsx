'use client'
import { useEffect, useState } from 'react'
import Choice from '@/components/Choice'
import { RowForm } from '@/components/RowEdit'
import PivotBuild from '@/components/PivotBuild'
import { updateReport } from '@/app/actions/reports'
import { CHART_KINDS, KIND_ICON, KIND_NAME, type ChartKind } from '@/lib/charts'
import { type Col, type Spec } from '@/lib/pivot'

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
export default function EditReport({ report, columns, spec: saved, onPreview }: {
  report: {
    id: string; name: string; sourceUrl: string | null; sourceTab: string | null
    refresh: string; restricted: boolean
  }
  columns: Col[]
  spec: Spec
  /** Moves the real chart above this form, live, before anything is saved. */
  onPreview?: (s: Spec) => void
}) {
  const [spec, setSpec] = useState<Spec>(saved)
  const [restricted, setRestricted] = useState(report.restricted)

  // Whatever is in this form is what the chart above shows. Not on save: the
  // whole question -- is this the right cut, is this the right mark -- is one
  // you answer by seeing it.
  useEffect(() => { onPreview?.(spec) }, [spec, onPreview])

  return (
    <RowForm action={updateReport} label="Save the change" busy="Saving…">
      <input type="hidden" name="id" value={report.id} />
      {/* The boxes are the control; this carries what they said. */}
      <input type="hidden" name="chart_spec" value={JSON.stringify(spec)} />

      <p className="edh">How it shows</p>

      <div className="formrow">
        <div>
          <label htmlFor="er-name">Report name</label>
          <input className="field" id="er-name" name="name" defaultValue={report.name} required />
        </div>
        <div>
          <label htmlFor="er-kind">Drawn as</label>
          <Choice id="er-kind" name="chart_kind_display" defaultValue={spec.type}
                  filterFrom={99} placeholder="How to draw it"
                  onPick={(k) => setSpec({ ...spec, type: k })}
                  options={CHART_KINDS.flatMap((g) =>
                    g.kinds.map((k) => ({ value: k.k as string, label: k.t as string,
                                          hint: k.s as string, icon: KIND_ICON[k.k],
                                          group: g.group as string })))} />
        </div>
      </div>

      {/* The four boxes, in the edit form for the same reason they are in the
          add form: what a report draws is one question, and answering half of
          it in one place and half in another is how a report ends up drawing
          something nobody chose. */}
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label>What goes where</label>
          {columns.length === 0
            ? <p className="hint" style={{ marginTop: 0 }}>
                Hopper has not read this source yet, so it does not know what columns it has.
                Refresh it and they appear here.
              </p>
            : <>
                <PivotBuild cols={columns} spec={spec} onSpec={setSpec} />
                <p className="hint">
                  Drag a field into a box, or tap it and pick where it goes. The first thing in
                  Values is the headline — the number on the card and at the top of this page.
                </p>
              </>}
        </div>
      </div>

      <div className="inline1" style={{ marginTop: 14 }}>
        <label htmlFor="er-points">How many rows the chart draws</label>
        <input className="field" id="er-points" type="number"
               min={2} max={500} value={spec.points ?? ''} placeholder="Every one"
               onChange={(e) => setSpec({
                 ...spec, points: e.target.value === '' ? null : Number(e.target.value),
               })} />
        <p className="hint">On a date axis the most recent this many; on any other the biggest.
          Empty draws every row the pivot makes. The table is never cut.</p>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="er-together">Keep them on one plot</label>
          <div className="togline">
            <span className="tog">
              <input id="er-together" type="checkbox" checked={spec.together}
                     aria-label="Keep them on one plot"
                     onChange={(e) => setSpec({ ...spec, together: e.target.checked })} />
              <span className="tog__track" /><span className="tog__knob" />
            </span>
            <span className="togstate">{spec.together ? 'On' : 'Off'}</span>
            <span className="togsay">{spec.together
              ? 'One plot, one scale. Values much smaller than the biggest will be close to flat — that is the trade.'
              : 'Off, each thing being measured gets its own plot, because one scale would flatten the small ones.'}</span>
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
          <label>What dates the rows</label>
          {/* Not a question any more. It is whatever is in Rows, above, and
              asking it twice is how the two answers get to disagree. */}
          <p className="picked">
            <b>{spec.rows.map((r) => r.field).join(' · ') || 'Nothing — nothing is in Rows yet'}</b>
            <span>Hopper still keeps one reading per date per value when the report is one
              date down the side, taken as it is. That is what the card draws.</span>
          </p>
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
