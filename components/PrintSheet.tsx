'use client'
import { useEffect } from 'react'
import Chart, { Legend, isSplit, type Series } from '@/components/Chart'
import { useRange, inWindow, windowOf } from '@/components/useRange'

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const on = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', year: 'numeric' })

type Sheet = {
  id: string; name: string; where: string; chartType: string; dated: boolean
  value: number | null; valueOn: string | null; lastLook: string | null; refresh: string
  series: Series[]
}

/**
 * One report per block, each one whole.
 *
 * `break-inside: avoid` on the block is the entire point of doing this as a
 * page: a report cut in half by a page break is a report somebody has to hold
 * two sheets up to read.
 *
 * The date range comes along, because printing a window and not saying which
 * window is how a printout ends up on a desk meaning nothing.
 */
export default function PrintSheet({ sheets }: { sheets: Sheet[] }) {
  const { range, ready, window: win } = useRange()

  // Print once the page has actually settled — charts measure their box on
  // layout, and printing before that gives you a sheet of empty rectangles.
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [ready])

  const w = windowOf(range)
  const said = range.preset === 'all' ? 'All time'
    : `${w.from ? on(w.from) : '—'} to ${w.to ? on(w.to) : '—'}`

  return (
    <div className="sheet">
      <div className="sheet__h">
        <span className="mark mark--sm">hopper<span className="pd">.</span></span>
        <span className="sheet__meta">
          <b>{said}</b>
          <span>{sheets.length} report{sheets.length === 1 ? '' : 's'} ·
            printed {new Date().toLocaleDateString('en-US',
              { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </span>
        <button className="btn noprint" type="button" onClick={() => window.print()}>Print</button>
      </div>

      {sheets.map((s) => {
        const series = s.dated
          ? s.series.map((x) => ({ ...x, points: x.points.filter((p) => inWindow(p.on, win)) }))
              .filter((x) => x.points.length > 0)
          : s.series
        const head = series[0]?.points ?? []
        const newest = head[head.length - 1]
        const move = head.length > 1 ? newest.v - head[0].v : null
        return (
          <section className="sheet__r" key={s.id}>
            <div className="sheet__rh">
              <span className="sheet__t"><b>{s.name}</b><span>{s.where}</span></span>
              <span className="sheet__v">
                {newest ? nf.format(newest.v) : s.value == null ? '—' : nf.format(s.value)}
                {move != null && <i className={move >= 0 ? 'up' : 'down'}>{nf.format(Math.abs(move))}</i>}
              </span>
            </div>
            {head.length < 2
              ? <p className="sheet__none">
                  {s.dated && s.series.length > 0
                    ? 'No readings inside this range.'
                    : 'Nothing read yet.'}
                </p>
              : <>
                  <Chart type={s.chartType} series={series} height={isSplit(series) ? 330 : 210} />
                  {!isSplit(series) && <Legend series={series} />}
                </>}
            <p className="sheet__f">
              {newest ? <>Dated {on(newest.on)}. </> : null}
              {s.lastLook ? <>Last looked {new Date(s.lastLook).toLocaleString('en-US',
                { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. </> : null}
              {!s.dated && 'This source carries no dates, so the range does not apply to it.'}
            </p>
          </section>
        )
      })}
    </div>
  )
}
