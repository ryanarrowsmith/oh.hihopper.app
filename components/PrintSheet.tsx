'use client'
import { useEffect, useState } from 'react'
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

  /**
   * Print when the page is actually ready, not when a timer says it might be.
   *
   * This was a 350ms setTimeout and it printed empty sheets. A chart here
   * measures its own box on layout and sizes its SVG from what it finds, so
   * printing before that has happened gives you a page of blank rectangles --
   * and the print dialog is modal, so by the time you see it there is nothing
   * to do but cancel. A guess at how long layout takes is a guess that is
   * wrong on a slow machine, on a cold cache, and on a tab that opened in the
   * background and was never given an animation frame.
   *
   * So it asks. Every chart is measured; when they all have width, and the
   * fonts have loaded -- a font swapping after layout re-wraps every label --
   * it prints. If something never measures it gives up after four seconds and
   * prints anyway, because the figures and the words are the report and a
   * missing chart is better than a dialog that never comes.
   */
  const [printed, setPrinted] = useState(false)
  useEffect(() => {
    if (!ready || printed) return
    let done = false
    const go = () => {
      if (done) return
      done = true
      setPrinted(true)
      window.print()
    }

    const measured = () => {
      const charts = document.querySelectorAll<SVGElement>('.paper__r svg.chart')
      // No charts at all is a legitimate ready: every report can be one that
      // has never been read, and that page is words.
      if (charts.length === 0) return true
      return [...charts].every((c) => c.getBoundingClientRect().width > 1)
    }

    const started = Date.now()
    let frame = 0
    const wait = () => {
      if (done) return
      if (measured() || Date.now() - started > 4000) { go(); return }
      frame = requestAnimationFrame(wait)
    }

    const fonts = (document as any).fonts?.ready ?? Promise.resolve()
    fonts.then(() => { frame = requestAnimationFrame(wait) })

    return () => { done = true; cancelAnimationFrame(frame) }
  }, [ready, printed])

  const w = windowOf(range)
  const said = range.preset === 'all' ? 'All time'
    : `${w.from ? on(w.from) : '—'} to ${w.to ? on(w.to) : '—'}`

  return (
    <div className="paper">
      <div className="paper__h">
        <span className="mark mark--sm">hopper<span className="pd">.</span></span>
        <span className="paper__meta">
          <b>{said}</b>
          <span>{sheets.length} report{sheets.length === 1 ? '' : 's'} ·
            printed {new Date().toLocaleDateString('en-US',
              { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </span>
        {/* Cancelling the dialog used to leave a page with no way to try
            again short of reloading. */}
        <button className="btn btn--amber noprint" type="button"
                onClick={() => window.print()}>Print</button>
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
          <section className="paper__r" key={s.id}>
            <div className="paper__rh">
              <span className="paper__t"><b>{s.name}</b><span>{s.where}</span></span>
              <span className="paper__v">
                {newest ? nf.format(newest.v) : s.value == null ? '—' : nf.format(s.value)}
                {move != null && <i className={move >= 0 ? 'up' : 'down'}>{nf.format(Math.abs(move))}</i>}
              </span>
            </div>
            {head.length < 2
              ? <p className="paper__none">
                  {s.dated && s.series.length > 0
                    ? 'No readings inside this range.'
                    : 'Nothing read yet.'}
                </p>
              : <>
                  <Chart type={s.chartType} series={series} height={isSplit(series) ? 330 : 210} />
                  {!isSplit(series) && <Legend series={series} />}
                </>}
            <p className="paper__f">
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
