'use client'
import { useState, useTransition } from 'react'
import { saveBuilt } from '@/app/actions/schedule'

/**
 * The third measure, beside the other two rather than over them.
 *
 * Drawn off a photograph, walked at the survey, and now what is standing in the
 * ground. The third genuinely differs from the second for reasons nobody could
 * have known — an oak nobody wanted to cut roots off — so it lives in its own
 * table and the first two stay exactly as they were recorded.
 *
 * A RUN THAT SHRANK ASKS WHY IN THE SAME ROW. Not in a note somewhere else:
 * "stopped short of the oak, customer agreed on site" is the sentence that
 * answers a question somebody asks in March, and it only gets typed if the box
 * is beside the number it explains.
 */

export type Row = {
  runId: string
  label: string
  drawn: number
  walked: number | null
  built: number | null
  why: string | null
}

const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`

export default function CloseoutRuns({
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
      run_id: r.runId, built: r.built, why: r.why,
    }))))
    go(async () => {
      const res = await saveBuilt(null, form)
      if (res.ok) setState('clean')
      else { setState('failed'); setWhy(res.message) }
    })
  }

  // What the customer is being billed for: the walked figure where somebody
  // walked it, and the drawn one where nobody did.
  const sold = rows.reduce((s, r) => s + (r.walked ?? r.drawn), 0)
  const built = rows.reduce((s, r) => s + (r.built ?? 0), 0)
  const any = rows.some((r) => r.built != null)
  const short = any ? built - sold : 0

  return (
    <div className="cobuilt">
      <table className="fxtable">
        <thead><tr>
          <th>Run</th><th>Drawn</th><th>Walked</th><th>Built</th><th>Why it moved</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.runId}>
              <td>{r.label}</td>
              <td className="fxnum">{ft(r.drawn)}</td>
              <td className="fxnum">{r.walked == null ? '—' : ft(r.walked)}</td>
              <td className="fxnum">
                {mayEdit ? (
                  <input className="field field--num" inputMode="decimal"
                         aria-label={`Built length of ${r.label}, feet`}
                         value={r.built ?? ''}
                         placeholder={String(Math.round(r.walked ?? r.drawn))}
                         onChange={(e) => set(i, {
                           built: e.target.value.trim() === '' ? null : Number(e.target.value),
                         })} />
                ) : (r.built == null ? '—' : ft(r.built))}
              </td>
              <td>
                {mayEdit ? (
                  <input className="field" value={r.why ?? ''}
                         aria-label={`Why ${r.label} moved`}
                         placeholder={
                           r.built != null && r.built < (r.walked ?? r.drawn)
                             ? 'What stopped it' : ''}
                         onChange={(e) => set(i, { why: e.target.value || null })} />
                ) : (r.why ?? <span className="fjnone">—</span>)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td><b>{any ? ft(built) : '—'}</b></td>
          <td className="fxnum">{ft(rows.reduce((s, r) => s + r.drawn, 0))}</td>
          <td className="fxnum">{ft(sold)}</td>
          <td className="fxnum" colSpan={2}>
            {any && short !== 0 && (
              <b className={short < 0 ? 'cominus' : undefined}>
                {short > 0 ? '+' : '−'}{ft(Math.abs(short))}
              </b>
            )}
          </td>
        </tr></tfoot>
      </table>

      {mayEdit && (
        <p className={`fxsaved fxsaved--${state}`}>
          {state === 'clean' ? 'Saved'
            : state === 'saving' ? 'Saving…'
            : state === 'failed' ? (why ?? 'Not saved')
            : 'Not saved yet'}
          {state !== 'saving' && state !== 'clean' && (
            <button type="button" className="lnk" onClick={save}>Save now</button>
          )}
          {state === 'clean' && (
            <button type="button" className="lnk" onClick={save}>Save</button>
          )}
        </p>
      )}
    </div>
  )
}
