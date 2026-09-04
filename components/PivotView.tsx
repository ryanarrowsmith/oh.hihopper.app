'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Chart, { Legend, type Series } from '@/components/Chart'
import {
  fromLong, keyWord, pivot, valueWord, whyNothing,
  type LongRow, type Spec, type Tab,
} from '@/lib/pivot'
import { figure } from '@/components/PivotBits'

/**
 * The pivot, drawn twice.
 *
 * A table and a chart of the same spec, behind a tab strip. They are not two
 * views that happen to agree -- they read the same pivot() result, so they
 * cannot disagree, and the table is always the answer to "where did that bar
 * come from".
 *
 * Three series is the cap on one plot, and the pivot makes it easy to ask for
 * more than three without noticing: series is Columns × Values, and neither
 * well looks like it is multiplying. So Values splits into a plot each -- the
 * rule the builder already used for measures -- and Columns is the color,
 * capped at three drawn with a sentence saying which three and why.
 */


/**
 * The database's answer, when the browser does not hold enough rows to give
 * one.
 *
 * report_rows keeps 500; DASH-Revenue Activity has 84,419. Pivoting the 500
 * and labelling the answer "three months" is not a smaller version of the
 * right answer, so past the sample the same spec goes to hopper.pivot() and
 * the whole table answers it.
 *
 * Debounced, because this runs while somebody is dragging a chip around, and a
 * request per keystroke in a filter box is a request per keystroke.
 */
function useFar(report: string | undefined, spec: Spec, tab: Tab, total?: number) {
  const [far, setFar] = useState<ReturnType<typeof fromLong> | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // The sample IS the sheet when the sheet is small enough. Nothing to ask.
  const need = Boolean(report) && (total ?? 0) > tab.rows.length
  const key = JSON.stringify(spec)
  const seq = useRef(0)

  useEffect(() => {
    if (!need) { setFar(null); setFailed(null); setWaiting(false); return }
    const mine = ++seq.current
    setWaiting(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/report/pivot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report, spec: JSON.parse(key) }),
        }).then((x) => x.json())
        // An answer to a spec two edits ago is not an answer.
        if (mine !== seq.current) return
        if (r.ok) {
          setFar(fromLong(r.long as LongRow[], JSON.parse(key), tab.columns))
          setFailed(null)
        } else setFailed(r.message ?? 'Hopper could not pivot that.')
      } catch {
        if (mine === seq.current) setFailed('Hopper could not reach the pivot.')
      } finally {
        if (mine === seq.current) setWaiting(false)
      }
    }, 260)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need, report, key, tab.columns])

  return { far, waiting, failed }
}

/** How many column keys one plot can color. */
const COLOR_CAP = 3

export default function PivotView({ tab, spec, height = 300, tabs = true, only,
                                    report, total, stored }: {
  tab: Tab
  spec: Spec
  height?: number
  /** Whether the strip is shown. A card has no room for it and shows the chart. */
  tabs?: boolean
  only?: 'table' | 'chart'
  /** Which report these rows belong to. Given, and only when the sheet is
   *  bigger than the sample, the pivot is run in the database instead. */
  report?: string
  /** How many rows the source actually has, as of the last read. */
  total?: number
  /** How many of them actually reached the row store. Null means the last read
   *  did not finish storing them, so the table is a fragment of a sheet and
   *  must not be pivoted as though it were one. */
  stored?: number | null
}) {
  const [show, setShow] = useState<'table' | 'chart'>(only ?? 'chart')
  const here = useMemo(() => pivot(tab, spec), [tab, spec])
  // A half-stored sheet is not a smaller sheet. Until the row store says it
  // finished, the browser answers over the sample and says so -- rather than
  // the database answering confidently over a fragment.
  const whole = stored != null && stored >= (total ?? 0)
  const { far, waiting, failed } = useFar(whole ? report : undefined, spec, tab, total)
  const p = far ?? here
  const nothing = whyNothing(spec)

  if (nothing) return <p className="empty" style={{ margin: 0 }}>{nothing}</p>
  if (p.rowKeys.length === 0) {
    return <p className="empty" style={{ margin: 0 }}>
      Nothing came through the filters, so there is nothing to draw.
    </p>
  }

  const at = (label: string) => tab.columns.find((c) => c.key === label || c.label === label)
  const rowName = spec.rows.map((r) => r.field).join(' · ') || 'All'
  // "Total" is only the right word when the margin really is a total. The
  // average of a row is not its total, and calling it one would be a label
  // that lies quietly.
  const summed = spec.values.every((v) => v.agg === 'sum' || v.agg === 'count' || v.agg === 'countd')
  const marginWord = summed ? 'Total' : 'All'

  const rk = (k: string) => keyWord(k, p.rowGrain)
  const ck = (k: string) => keyWord(k, p.colGrain)
  const wide = p.colKeys.length > 0

  // ------------------------------------------------------------------ table
  const table = (
    <div className="pvscroll">
      <table className="pvgrid">
        <thead>
          {wide && spec.values.length > 1 && (
            <tr>
              <th />
              {p.colKeys.map((c) => (
                <th key={c} colSpan={spec.values.length} className="pvgrid__grp">{ck(c)}</th>
              ))}
              <th colSpan={spec.values.length} className="pvgrid__grp">{marginWord}</th>
            </tr>
          )}
          <tr>
            <th>{rowName}</th>
            {wide
              ? <>
                  {p.colKeys.map((c) => spec.values.map((v, vi) => (
                    <th key={`${c}-${vi}`}>
                      {spec.values.length > 1 ? valueWord(v) : ck(c)}
                    </th>
                  )))}
                  {spec.values.map((v, vi) => (
                    <th key={`m-${vi}`} className="pv-tot">
                      {spec.values.length > 1 ? valueWord(v) : marginWord}
                    </th>
                  ))}
                </>
              : spec.values.map((v, vi) => <th key={vi}>{valueWord(v)}</th>)}
          </tr>
        </thead>
        <tbody>
          {p.rowKeys.map((r) => (
            <tr key={r}>
              <td>{rk(r)}</td>
              {wide
                ? <>
                    {p.colKeys.map((c) => spec.values.map((_, vi) => (
                      <td key={`${c}-${vi}`}>{figure(p.cell(r, c, vi))}</td>
                    )))}
                    {spec.values.map((_, vi) => (
                      <td key={`m-${vi}`} className="pv-tot">{figure(p.rowTotal(r, vi))}</td>
                    ))}
                  </>
                : spec.values.map((_, vi) => <td key={vi}>{figure(p.rowTotal(r, vi))}</td>)}
            </tr>
          ))}
          <tr className="pv-tot">
            <td>{marginWord}</td>
            {wide
              ? <>
                  {p.colKeys.map((c) => spec.values.map((_, vi) => (
                    <td key={`${c}-${vi}`}>{figure(p.colTotal(c, vi))}</td>
                  )))}
                  {spec.values.map((_, vi) => <td key={`m-${vi}`}>{figure(p.grand(vi))}</td>)}
                </>
              : spec.values.map((_, vi) => <td key={vi}>{figure(p.grand(vi))}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  )

  // ------------------------------------------------------------------ chart
  /**
   * Which column keys get a color.
   *
   * On a date axis the interesting three are the most recent three. On a
   * category axis the keys are already biggest-first, so the interesting three
   * are the first. Either way the chart says which it took, because a chart
   * that quietly drops a series somebody put in a well is a chart that lies.
   */
  const dated = Boolean(p.colGrain) || at(spec.columns[0]?.field ?? '')?.type === 'date'
  const drawn = p.colKeys.length > COLOR_CAP
    ? (dated ? p.colKeys.slice(-COLOR_CAP) : p.colKeys.slice(0, COLOR_CAP))
    : p.colKeys
  const dropped = p.colKeys.length - drawn.length

  const plots = spec.values.map((v, vi) => ({
    value: v,
    series: (drawn.length ? drawn : ['']).map<Series>((c) => ({
      measure: drawn.length ? ck(c) : valueWord(v),
      points: p.rowKeys
        .map((r) => ({ on: r, v: p.cell(r, c, vi) }))
        .filter((q): q is { on: string; v: number } => q.v !== null),
    })).filter((s) => s.points.length > 0),
  })).filter((plot) => plot.series.length > 0)

  const axis = { order: p.rowKeys, label: rk }

  const chart = plots.length === 0
    ? <p className="empty" style={{ margin: 0 }}>
        Nothing in these cells is a number, so there is nothing to plot.
      </p>
    : (
      <>
        {dropped > 0 && (
          <p className="splitwhy">
            {drawn.length} of {p.colKeys.length} drawn, {dated ? 'the most recent' : 'the largest'}:
            {' '}{drawn.map(ck).join(', ')}. Past three, a color can no longer say which is which —
            only the first three separate for every kind of color vision. The table has all of them.
          </p>
        )}
        {plots.length > 1 && (
          <p className="splitwhy">
            A plot each, because {plots.length} things are being measured and one scale would
            flatten the smaller ones into the axis. Each plot names what it is drawing.
          </p>
        )}
        <div className={plots.length > 1 ? 'charts' : undefined}>
          {plots.map((plot, i) => (
            <div key={`${plot.value.field}-${i}`}
                 className={plots.length > 1 ? 'charts__one' : undefined}>
              {plots.length > 1 && <p className="charts__l">{valueWord(plot.value)}</p>}
              <Chart type={spec.type} series={plot.series} axis={axis} together={spec.together}
                     height={plots.length > 1 ? Math.max(150, Math.round(height / plots.length)) : height} />
              <Legend series={plot.series} />
            </div>
          ))}
        </div>
      </>
    )

  const shown = only ?? show
  return (
    <>
      {tabs && !only && (
        <div className="pvtabs" role="tablist">
          {(['table', 'chart'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={shown === t}
                    onClick={() => setShow(t)}>
              {t === 'table' ? 'Table' : 'Chart'}
            </button>
          ))}
          <span className="pvtabs__r">
            {p.rowKeys.length}{p.colKeys.length ? ` × ${p.colKeys.length}` : ''}
            {p.matched > p.rowKeys.length ? ` of ${p.matched}` : ''}
          </span>
        </div>
      )}
      <div className={shown === 'table' ? 'pvbody pvbody--table' : 'pvbody'}>
        {shown === 'table' ? table : chart}
      </div>
      {/* Which rows this was worked out from. The sample and the whole sheet
          give different answers, and a screen that shows one while implying
          the other is the whole reason report_row exists. */}
      {report && (total ?? 0) > tab.rows.length && !far && (
        <p className="pvnote">
          {!whole
            ? `Hopper has not finished storing this sheet — ${(stored ?? 0).toLocaleString()} of ${(total ?? 0).toLocaleString()} rows are in. Drawn from the first ${tab.rows.length.toLocaleString()} until it has. Refresh it if this does not clear.`
            : failed
            ? `${failed} Drawn from the first ${tab.rows.length.toLocaleString()} rows instead.`
            : waiting
              ? `Working this out over all ${(total ?? 0).toLocaleString()} rows — showing the first ${tab.rows.length.toLocaleString()} in the meantime.`
              : `Drawn from the first ${tab.rows.length.toLocaleString()} of ${(total ?? 0).toLocaleString()} rows.`}
        </p>
      )}

      {/* Said out loud rather than swallowed. "Value as it is" takes the last
          row in a cell, which is what a sheet means when the same day appears
          twice -- but only if somebody knows it happened. */}
      {p.collided > 0 && (
        <p className="pvnote">
          {p.collided} {p.collided === 1 ? 'row' : 'rows'} landed in a cell that already had one.
          A value taken as it is keeps the last, which is what a sheet means when the same key
          appears twice — the lower row is the correction. Sum or Average if that is not what
          you meant.
        </p>
      )}
    </>
  )
}
