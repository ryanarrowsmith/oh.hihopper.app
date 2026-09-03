'use client'
import { useEffect, useState } from 'react'
import Chart, { type Series } from '@/components/Chart'
import { useRange, inWindow, windowOf } from '@/components/useRange'
import type { Card } from '@/components/Reports'

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US',
    { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * A dashboard on paper.
 *
 * Printing is not screenshotting. A screen is one endless column; paper is a
 * sequence of fixed rectangles, and every decision worth making here is about
 * where the cuts fall -- which is exactly what the person pressing the button
 * cannot decide. So: break-inside on every report, a header the first report
 * flows under rather than a cover page nobody asked for, and a contents list
 * only when there is more than a page to have contents of.
 */
type Board = {
  id: string; title: string; name: string; owner_name: string; is_mine: boolean
}

export default function DashPrint(
  { board, cards, who }: { board: Board; cards: Card[]; who: string },
) {
  const { range, ready, window: win } = useRange()
  const [printed, setPrinted] = useState(false)

  /**
   * Print when the page is ready, not when a timer says it might be.
   *
   * A chart measures its own box on layout and sizes its SVG from what it
   * finds, so printing before that gives a sheet of blank rectangles -- and
   * the dialog is modal, so by the time you see it there is nothing to do but
   * cancel. Fonts too: one swapping in after layout re-wraps every label.
   * Four seconds and it prints regardless, because the figures are the report
   * and a missing chart beats a dialog that never comes.
   */
  useEffect(() => {
    if (!ready || printed) return
    let done = false
    let frame = 0
    const go = () => { if (!done) { done = true; setPrinted(true); window.print() } }
    const measured = () => {
      const c = document.querySelectorAll<SVGElement>('.pblock svg.chart')
      return c.length === 0 || [...c].every((x) => x.getBoundingClientRect().width > 1)
    }
    const started = Date.now()
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
    : `${w.from ? day(w.from) : '—'} to ${w.to ? day(w.to) : '—'}`
  const printedOn = new Date().toLocaleDateString('en-US',
    { day: 'numeric', month: 'short', year: 'numeric' })

  // Each report narrowed to the range, exactly as the board narrowed it. A
  // printout of a window that does not say which window is a sheet of paper
  // on a desk meaning nothing, which is why the range is in the header AND
  // the footer.
  const sheets = cards.map((c) => {
    const series: Series[] = c.dated
      ? c.series.map((s) => ({ ...s, points: s.points.filter((p) => inWindow(p.on, win)) }))
          .filter((s) => s.points.length > 0)
      : c.series
    const head = series[0]?.points ?? []
    const last = head[head.length - 1]
    return { c, series, value: last ? last.v : c.value, on: last ? last.on : c.valueOn }
  })

  return (
    <div className="pdoc">
      <button className="btn btn--amber noprint pdoc__again" type="button"
              onClick={() => window.print()}>Print</button>

      <div className="pdoc__top">
        <span className="pdoc__mark mark mark--sm">hopper<span className="pd">.</span></span>
        <div className="pdoc__t">
          <h1>{board.is_mine ? board.title : board.name}</h1>
          <p>A dashboard belonging to {board.is_mine ? who : board.owner_name}</p>
        </div>
        <div className="pdoc__meta">
          <b>{said}</b>
          {sheets.length} report{sheets.length === 1 ? '' : 's'}
          <br />Printed {printedOn}
        </div>
      </div>

      {/* Contents earns its place past one page. For three reports on one sheet
          it is furniture. */}
      {sheets.length > 3 && (
        <div className="pdoc__toc">
          <p>What is on it</p>
          <ol>
            {sheets.map(({ c, value }) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <i>{c.entity}</i>
                <b>{value == null ? '—' : nf.format(value)}</b>
              </li>
            ))}
          </ol>
        </div>
      )}

      {sheets.length === 0 && (
        <p className="empty">There is nothing on this dashboard yet.</p>
      )}

      {sheets.map(({ c, series, value, on }) => {
        const stale = c.lastLookOk === false
        return (
          <section className={`pblock${stale ? ' pblock--stale' : ''}`} key={c.id}>
            <div className="pblock__h"><h2>{c.name}</h2></div>
            <div className="pblock__b">
              <div className="pblock__fig">
                <div className="pblock__v">{value == null ? '—' : nf.format(value)}</div>
                <p className="pblock__on">
                  {[c.category, on ? `as at ${day(on)}` : null].filter(Boolean).join(' · ')}
                </p>
                <p className="pblock__facts">
                  <b>Reads</b> {c.refresh === 'none' ? 'never — a snapshot' : c.refresh}<br />
                  <b>Last looked</b>{' '}
                  {c.lastLook
                    ? new Date(c.lastLook).toLocaleString('en-US',
                        { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                    : 'never'}
                </p>
              </div>
              <div className="pblock__c">
                {series.length > 0 && series[0].points.length > 1
                  ? <Chart type={c.chartType} series={series} height={150} />
                  : <p className="pblock__none">
                      {c.dated && c.series.length > 0
                        ? 'No readings inside this range.'
                        : 'Nothing read yet.'}
                    </p>}
                <span className="pblock__w">
                  {[c.entity, c.department].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>
            {/* A report that could not be read says so where its number is,
                rather than printing the last good figure as though it were
                current. A PDF outlives the moment it was made. */}
            {stale && c.lastFailure && (
              <p className="pblock__warn">
                Hopper could not read this the last time it looked: {c.lastFailure} The
                figure above is what it last knew.
              </p>
            )}
          </section>
        )
      })}

      <div className="pdoc__foot">
        <span>{board.is_mine ? board.title : board.name} · {said}</span>
        <span>hopper — printed {printedOn}</span>
      </div>
    </div>
  )
}
