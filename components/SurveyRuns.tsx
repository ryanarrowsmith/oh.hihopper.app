'use client'
import { useState, useTransition } from 'react'
import { saveWalked } from '@/app/actions/survey'

/**
 * The line as drawn, and the line as walked, side by side.
 *
 * The drawn figure never disappears. It is part of a number somebody signed,
 * and a survey that quietly overwrites it leaves nobody able to say what
 * changed or why the price moved — which is the whole reason the walked
 * measurement lives in its own table rather than on top of the run.
 *
 * A blank field is not zero. It means nobody corrected that run, so the drawn
 * figure stands and the row is never stored.
 */

export type Row = {
  runId: string
  label: string
  drawnFt: number
  /** What the elevation model said at estimate time, when it said anything. */
  fallFt: number | null
  steepest: number | null
  walkedFt: number | null
  gradePct: number | null
  measuredBy: string | null
}

const HOW = [
  { v: 'wheel', en: 'Wheel' },
  { v: 'laser', en: 'Laser' },
  { v: 'plans', en: 'Plans' },
  { v: 'typed', en: 'By eye' },
]

const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`

export default function SurveyRuns({
  jobId, rows: initial, mayEdit,
}: { jobId: string; rows: Row[]; mayEdit: boolean }) {
  const [rows, setRows] = useState(initial)
  const [state, setState] = useState<'clean' | 'dirty' | 'saving' | 'failed'>('clean')
  const [why, setWhy] = useState<string | null>(null)
  const [, go] = useTransition()

  const set = (i: number, patch: Partial<Row>) => {
    setRows((old) => old.map((r, ri) => (ri === i ? { ...r, ...patch } : r)))
    setState('dirty')
  }

  const save = () => {
    setState('saving'); setWhy(null)
    const form = new FormData()
    form.set('job_id', jobId)
    form.set('runs', JSON.stringify(rows.map((r) => ({
      run_id: r.runId, walked: r.walkedFt, grade: r.gradePct,
      measured_by: r.measuredBy ?? 'wheel',
    }))))
    go(async () => {
      const res = await saveWalked(null, form)
      if (res.ok) setState('clean')
      else { setState('failed'); setWhy(res.message) }
    })
  }

  /** A run's length after the survey: what was walked, or failing that, drawn. */
  const at = (r: Row) => (r.walkedFt && r.walkedFt > 0 ? r.walkedFt : r.drawnFt)
  const drawn = rows.reduce((s, r) => s + r.drawnFt, 0)
  const now = rows.reduce((s, r) => s + at(r), 0)
  const delta = Math.round(now - drawn)

  return (
    <div className="svruns">
      <table className="svtable">
        <thead>
          <tr>
            <th>Run</th><th>Drawn</th><th>Walked</th><th>Grade %</th>
            <th>Measured with</th><th>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const d = Math.round(at(r) - r.drawnFt)
            return (
              <tr key={r.runId}>
                <td data-l="Run">
                  <b>{r.label}</b>
                  {/* The terrain reading, where the ground said anything worth
                      saying. It never moved the quoted footage — a 7.5% grade
                      over 186 feet adds six inches — it says the crew will be
                      stepping panels here. */}
                  {(r.steepest ?? 0) >= 5 && (
                    <span className="svfall">
                      falls {ft(r.fallFt ?? 0)}, steepest {r.steepest}%
                    </span>
                  )}
                </td>
                <td data-l="Drawn" className="svnum svwas">{ft(r.drawnFt)}</td>
                <td data-l="Walked">
                  <input className="field field--n" inputMode="decimal" disabled={!mayEdit}
                         value={r.walkedFt ?? ''} placeholder="off the drawing"
                         onChange={(e) => set(i, {
                           walkedFt: e.target.value.trim() === '' ? null : Number(e.target.value),
                         })} />
                </td>
                <td data-l="Grade %">
                  <input className="field field--n" inputMode="decimal" disabled={!mayEdit}
                         value={r.gradePct ?? ''} placeholder="0"
                         onChange={(e) => set(i, {
                           gradePct: e.target.value.trim() === '' ? null : Number(e.target.value),
                         })} />
                </td>
                <td data-l="Measured with">
                  <select className="field" disabled={!mayEdit}
                          value={r.measuredBy ?? 'wheel'}
                          onChange={(e) => set(i, { measuredBy: e.target.value })}>
                    {HOW.map((h) => <option key={h.v} value={h.v}>{h.en}</option>)}
                  </select>
                </td>
                <td data-l="After" className="svnum">
                  {ft(at(r))}
                  {d !== 0 && (
                    <span className={`svdelta svdelta--${d > 0 ? 'up' : 'down'}`}>
                      {d > 0 ? '+' : '−'}{Math.abs(d)}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="svfoot">
        <b>{ft(now)}</b>
        <span>
          {rows.length} run{rows.length === 1 ? '' : 's'} · was {ft(drawn)} on the estimate
        </span>
        <span className="sp" />
        {delta !== 0 && (
          <span className={`svdelta svdelta--${delta > 0 ? 'up' : 'down'}`}>
            {delta > 0 ? '+' : '−'}{Math.abs(delta)} ft
          </span>
        )}
        {mayEdit && (
          <button className={`btn${state === 'dirty' ? ' btn--amber' : ''}`} type="button"
                  disabled={state === 'clean' || state === 'saving'} onClick={save}>
            {state === 'saving' ? 'Saving…' : state === 'clean' ? 'Saved' : 'Save the measurements'}
          </button>
        )}
      </div>
      {why && <p className="note note--err" style={{ marginTop: 10 }}>{why}</p>}
    </div>
  )
}
