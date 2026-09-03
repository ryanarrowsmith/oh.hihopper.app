'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/**
 * One chart kit, drawn once and used everywhere.
 *
 * The card on the reporting list, the popover and the report's own page all
 * come through here, so one report is one picture wherever you meet it. Two
 * screens drawing the same report with two renderers is how the same number
 * ends up wearing two different shapes.
 *
 * Three series is the cap on one plot. Only the first three of the chart
 * palette pass all-pairs colour-vision separation, so a fourth would be a line
 * somebody cannot tell from another line. A pie is the exception — its wedges
 * are adjacent by construction, so it may use all six, capped at six named
 * slices plus an "Other (n)" wedge.
 */

export type Series = { measure: string; points: { on: string; v: number }[] }

const SERIES_VAR = ['--s1', '--s2', '--s3'] as const
const PIE_VAR = ['--s1', '--s2', '--s3', '--steel', '--amber', '--canvas-3'] as const

/**
 * Twelve types, named by the question they answer.
 *
 * Grouped this way because nobody arrives wanting "a stacked column" -- they
 * arrive wanting to know what a total is made of. Exported so the builder and
 * the renderer cannot disagree about what exists.
 */
export const CHART_KINDS = [
  { group: 'Compare', kinds: [
    { k: 'col',  t: 'Columns',           s: 'One measure, period by period.' },
    { k: 'colg', t: 'Grouped columns',   s: 'Two or three measures side by side in each period.' },
    { k: 'barh', t: 'Horizontal bars',   s: 'When the labels are long. The reason this exists.' },
  ] },
  { group: 'Over time', kinds: [
    { k: 'line', t: 'Line',              s: 'The shape of a number, named at the end of its own line.' },
    { k: 'area', t: 'Area',              s: 'A line that says which way is up.' },
    { k: 'combo', t: 'Columns and a line', s: 'Two measures, two marks. Never two axes.' },
  ] },
  { group: 'Parts of a whole', kinds: [
    { k: 'stack',     t: 'Stacked columns', s: 'What the total is made of.' },
    { k: 'stack100',  t: '100% stacked',    s: 'The mix, when the total does not matter.' },
    { k: 'areastack', t: 'Stacked area',    s: 'The mix, over time.' },
    { k: 'pie',       t: 'Pie',             s: 'How one total splits. The latest reading only.' },
  ] },
  { group: 'Relationship', kinds: [
    { k: 'scatter', t: 'Scatter', s: 'Does one move with the other. Exactly two measures.' },
  ] },
  { group: 'One number', kinds: [
    { k: 'big', t: 'One number', s: 'No chart. The figure, and when it was read.' },
  ] },
] as const

export type ChartKind =
  'col'|'colg'|'barh'|'line'|'area'|'combo'|'stack'|'stack100'|'areastack'|'pie'|'scatter'|'big'|'bar'

/** How many measures a type will actually draw. The builder reads this rather
 *  than carrying its own copy of the rule. */
export function measureCap(kind: string) {
  if (kind === 'pie' || kind === 'big') return 1
  if (kind === 'scatter') return 2
  if (kind === 'combo') return 2
  if (kind === 'col' || kind === 'barh') return 1
  // Stacked marks touch only their neighbours in a fixed order, so they carry
  // six; everything else past three is split into a plot each, where a heading
  // rather than a colour says which is which.
  if (kind === 'stack' || kind === 'stack100' || kind === 'areastack') return 6
  return 10
}

/** Which marks stack, so the scale is the running total rather than the value. */
const STACKED = new Set(['stack', 'stack100', 'areastack'])
/** Which marks sit in a slot rather than on a point. */
const SLOTTED = new Set(['col', 'colg', 'bar', 'stack', 'stack100', 'combo'])

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/**
 * An axis figure, abbreviated only when abbreviating still tells them apart.
 *
 * Churn revenue running 1,984 to 2,150 was labelled "2.1k / 2.1k / 2.0k" —
 * two identical ticks on the same axis, which is worse than a long number. So
 * the SPAN decides, not the magnitude: k and M only once the range itself is
 * wide enough that a rounded figure is still a distinct figure.
 */
function axisFigure(n: number, span: number) {
  if (span >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (span >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  if (Number.isInteger(n) || span >= 10) return nf.format(Math.round(n))
  return n.toFixed(span >= 1 ? 1 : 2)
}
const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/**
 * How far apart two measures may be before one plot stops working.
 *
 * Sixteen thousand and a hundred and twenty-seven share an axis by lying flat
 * along the bottom of it. Twenty-five is where a series stops having enough of
 * the plot's height left to show a shape at all: at that ratio the smaller one
 * occupies the bottom 4% and every move it makes is under a pixel.
 */
const SPREAD_LIMIT = 25

/**
 * Whether these measures will be drawn as separate plots. Exported because a
 * caller has to know: a legend under split plots is a second label for
 * something each plot already labels itself.
 */
export function isSplit(series: Series[], type?: string) {
  const live = series.filter((s) => s.points.length > 0)
  // A stacked or single-mark chart is never split: its whole point is that the
  // measures share one picture.
  if (type && (STACKED.has(type) || ['pie', 'big', 'scatter', 'barh', 'combo'].includes(type))) return false
  // Past three, colour stops being able to say which line is which -- only the
  // first three separate all-pairs -- so identity moves to a heading and each
  // measure gets its own plot. That is also what happens when two measures are
  // orders of magnitude apart, for a different reason with the same answer.
  return live.length > 3 || (live.length > 1 && spreadOf(live) > SPREAD_LIMIT)
}

function spreadOf(series: Series[]) {
  const scale = series.map((s) => Math.max(...s.points.map((p) => Math.abs(p.v)), 0))
    .filter((n) => n > 0)
  if (scale.length < 2) return 1
  return Math.max(...scale) / Math.min(...scale)
}

/**
 * How wide the chart actually is.
 *
 * Every plot used to be an 820-unit viewBox squashed into whatever box it
 * landed in with preserveAspectRatio="none". That stretches the DRAWING, not
 * just the data: a 2.2px stroke becomes 3.9px horizontally and 2.2px
 * vertically, and the axis text is scaled with it, which is why the figures
 * looked subtly wrong at every size but never at one you could point at.
 *
 * Measuring instead means one unit is one pixel, the type is the size it says
 * it is, and the chart genuinely fills the room it is given.
 */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(820)

  /**
   * Measured synchronously, before the browser paints.
   *
   * A ResizeObserver alone was not enough and the reason is worth keeping: its
   * callbacks are delivered on an animation frame, and a tab that is not
   * painting -- backgrounded, or being driven by a test -- never gets one. The
   * chart sat at its 820 default and was then scaled into whatever box it
   * landed in, which is the stretching this was supposed to end.
   *
   * useLayoutEffect reads the box directly, so the first paint is already
   * right. The observer stays for everything after: a window resize, the rail
   * appearing at 1000px, a drawer opening next to it.
   */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      if (next > 0) setW((prev) => (Math.abs(prev - next) > 1 ? next : prev))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    window.addEventListener('resize', read)
    return () => { ro.disconnect(); window.removeEventListener('resize', read) }
  }, [])

  return { ref, w }
}

export type Picked = {
  /** ISO days currently chosen. Empty means nothing is chosen, which is not the
   *  same as everything being chosen -- an empty selection filters nothing. */
  days: Set<string>
  /** extend=true is shift-click: take everything between the last pick and this
   *  one, which is how anyone selects a stretch of time. */
  pick: (day: string, extend: boolean) => void
}

export default function Chart({
  type, series, height = 250, labels = true, compact = false, bare = false, picked,
}: {
  type: string; series: Series[]; height?: number
  labels?: boolean; compact?: boolean
  /** Linked selection with the rows behind it. Absent means the plot is not
   *  interactive, which is right on a card. */
  picked?: Picked
  /** No gridlines, no axis figures. For a card, where the chart is a shape you
   *  glance at on the way past the number rather than something you read. */
  bare?: boolean
}) {
  const live = series.filter((s) => s.points.length > 0)
  if (live.length === 0) return null
  if (type === 'pie') return <Pie series={live} height={height} compact={compact} />
  if (type === 'big') return <Big series={live} />
  if (type === 'barh') return <BarH series={live} height={height} bare={bare} />
  if (type === 'scatter') return <Scatter series={live} height={height} bare={bare} labels={labels} />

  // 'bar' is what 'col' was called before the kit had twelve types, and every
  // report that already says so still means this.
  const kind = type === 'bar' ? 'col' : type

  /**
   * One plot, or one plot each.
   *
   * Measures of a like size belong together -- that is the whole reason to put
   * two lines on one chart, and separating them would cost you the comparison.
   * Measures orders of magnitude apart do not: sharing a scale flattens the
   * small one into the axis, and giving them two axes on one plot is a chart
   * that can be made to say anything by choosing where each axis starts.
   *
   * So they get a plot each, stacked, each with its own scale and its name and
   * latest figure on it. Nothing is flattened and nothing is fudged; it costs
   * vertical room, which is why a card never does this and shows the headline
   * measure alone instead.
   */
  if (!bare && isSplit(live, type)) {
    /**
     * The first measure is the headline -- it is the number on the card and at
     * the top of the page -- so it gets the room to show it. Three plots at
     * identical weight say the three matter equally, which is the one thing the
     * report has already told us is not true.
     */
    const weights = live.map((_, i) => (i === 0 ? 1.55 : 1))
    const total = weights.reduce((a, b) => a + b, 0)
    const room = height - (live.length - 1) * 18
    return (
      <div className="charts">
        {live.map((s, i) => {
          const each = Math.max(84, Math.round((room * weights[i]) / total))
          return (
          <div className={`charts__one${i === 0 ? ' charts__one--head' : ''}`} key={s.measure}>
            <p className="charts__l">
              <span className="legend__k" style={{ background: `var(${SERIES_VAR[i % 3]})` }} />
              {s.measure}
              <b>{nf.format(s.points[s.points.length - 1].v)}</b>
            </p>
            <Axes type={kind === 'colg' ? 'col' : kind} series={[s]} height={each} colourFrom={i}
                  labels={labels && i === live.length - 1}
                  days={unionDays(live)} picked={picked} />
          </div>
        )})}
      </div>
    )
  }

  return <Axes type={kind} series={live} height={height} labels={labels && !bare} bare={bare}
                days={unionDays(live)} picked={picked} />
}

/**
 * Every day any series has a reading for, in order.
 *
 * The x axis used to be "index within this series", which quietly assumed every
 * measure had a reading on every date. One measure missing a Tuesday shifted
 * its whole line left by a day against the others. Positions come from the DAY
 * now, so a gap is a gap.
 */
function unionDays(series: Series[]) {
  const all = new Set<string>()
  for (const s of series) for (const p of s.points) all.add(p.on)
  return [...all].sort()
}

/**
 * Bars and lines share an axis, a scale and a set of gridlines, so they share
 * a component. Only the marks differ, which is the only thing that should.
 */
function Axes({ type, series, height, labels, bare, colourFrom = 0, days, picked }: {
  type: string; series: Series[]; height: number; labels: boolean; bare?: boolean
  /** Which palette slot this plot starts at, so a series keeps its colour when
   *  it is pulled out onto a plot of its own. */
  colourFrom?: number
  days: string[]
  picked?: Picked
}) {
  const { ref, w } = useWidth()
  const gid = useId().replace(/:/g, '')
  const h = height
  // Wide enough for a grouped five-figure number, which is what an unabbreviated
  // tick can now be.
  // A line that names itself at its own end needs somewhere to put the name.
  // Without this the text is drawn past the viewBox and simply vanishes, which
  // reads as the chart being broken rather than as a label not fitting.
  const named = !bare && series.length > 1 && (type === 'line' || type === 'area')
  const padL = bare ? 2 : 56, padR = bare ? 2 : (named ? 104 : 16)
  const padT = bare ? 4 : 16, padB = bare ? 4 : (labels ? 30 : 12)

  // Every series is drawn against ONE scale. Two y-axes on one plot is a chart
  // that can be made to say anything by choosing where each axis starts.
  // A stacked mark is measured by its running TOTAL, not by any one value:
  // scaling to the largest single measure would run every column off the top.
  const stacked = STACKED.has(type)
  const totals = days.map((d) =>
    series.reduce((n, s) => n + (s.points.find((p) => p.on === d)?.v ?? 0), 0))
  const all = type === 'stack100' ? [0, 100]
    : stacked ? totals
    : series.flatMap((s) => s.points.map((p) => p.v))
  const rawLo = Math.min(...all), rawHi = Math.max(...all)
  // Bars are read as areas, so their baseline has to be zero or the picture
  // lies about the ratio between them. A line is read as a slope and may be
  // zoomed into the band the numbers actually occupy.
  /**
   * A flat series has no span, and a scale with no span puts every point on the
   * floor -- so a single reading rendered pinned to the bottom of the box,
   * which reads as "this number is zero" rather than "there is one of it".
   * Giving a flat line a band around itself puts it in the middle, which is
   * what one reading, or six identical ones, actually look like.
   */
  const flat = rawHi === rawLo
  const pad = flat ? Math.abs(rawHi) * 0.5 || 1 : 0
  // Bars and columns are read as AREAS, so their baseline has to be zero or the
  // picture lies about the ratio between them. A line is read as a slope and
  // may be zoomed into the band the numbers actually occupy.
  const fromZero = SLOTTED.has(type) || stacked
  const lo = fromZero ? Math.min(0, rawLo) : rawLo - pad
  const hi = rawHi + (fromZero ? 0 : pad)
  const span = hi - lo || 1

  const n = days.length
  const at = new Map(days.map((d, i) => [d, i]))
  const x = (i: number) => padL + (n === 1 ? (w - padL - padR) / 2 : (i / (n - 1)) * (w - padL - padR))
  const y = (v: number) => h - padB - ((v - lo) / span) * (h - padT - padB)
  const chosen = picked?.days
  const anyChosen = (chosen?.size ?? 0) > 0

  const ticks = [lo, lo + span / 2, hi]
  // One label per ~110px of plot. Guessing a fixed count crowded them on a
  // narrow card and stranded them on a wide page.
  const room = Math.max(2, Math.floor((w - padL - padR) / 110))
  const every = Math.max(1, Math.ceil(days.length / room))
  const slot = (w - padL - padR) / Math.max(1, n)

  return (
    <div className="chartbox" ref={ref} style={{ height: h }}>
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}
         role="img" aria-label={series.map((s) => s.measure).join(', ')}>
      <defs>
        {/* The area under a line is there to say which way is up, not to be a
            slab of colour. It fades out before it reaches the floor, so the eye
            lands on the line. */}
        <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopOpacity=".26" stopColor="currentColor" />
          <stop offset="100%" stopOpacity="0" stopColor="currentColor" />
        </linearGradient>
      </defs>

      {!bare && ticks.map((t, i) => (
        <g key={i}>
          {/* The floor is a real line; the ones above it are hints. Three equal
              hairlines is three things competing to be the reference. */}
          <line className={i === 0 ? 'chart__base' : 'chart__gr'}
                x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
          <text className="chart__ax" x={padL - 8} y={y(t) + 3.5} textAnchor="end">
            {axisFigure(t, span)}</text>
        </g>
      ))}

      {/* A chosen day gets a guide the whole height of the plot, drawn UNDER the
          marks so it never covers a value. */}
      {chosen && days.map((d, i) => chosen.has(d) ? (
        <line key={`g${d}`} className="chart__pick" x1={x(i)} x2={x(i)} y1={padT} y2={h - padB} />
      ) : null)}

      {/* ── stacked marks ──────────────────────────────────────────────
          Each measure starts where the one below it ended, so the height of
          the pile is the total. 100% divides by that total instead, which is
          the same picture with the total taken out of it -- right when the mix
          is the question and the size is not. */}
      {STACKED.has(type) ? (() => {
        const run = new Map(days.map((d) => [d, 0]))
        const bw = Math.max(2, slot * 0.6)
        return series.map((s, si) => {
          const seg = days.map((d) => {
            const raw = s.points.find((p) => p.on === d)?.v ?? 0
            const tot = series.reduce((n, o) => n + (o.points.find((p) => p.on === d)?.v ?? 0), 0)
            const v = type === 'stack100' ? (tot ? (raw / tot) * 100 : 0) : raw
            const y0 = run.get(d)!, y1 = y0 + v
            run.set(d, y1)
            return { d, y0, y1 }
          })
          const fill = `var(${SERIES_VAR[(si + colourFrom) % 3] ?? PIE_VAR[si % 6]})`
          const col = `var(${PIE_VAR[(si + colourFrom) % 6]})`
          if (type === 'areastack') {
            const up = seg.map((g, k) => `${k ? 'L' : 'M'}${x(at.get(g.d)!).toFixed(1)} ${y(g.y1).toFixed(1)}`).join(' ')
            const down = [...seg].reverse()
              .map((g) => `L${x(at.get(g.d)!).toFixed(1)} ${y(g.y0).toFixed(1)}`).join(' ')
            return <path key={s.measure} d={`${up} ${down} Z`} style={{ fill: col, opacity: 0.74 }} />
          }
          return (
            <g key={s.measure} style={{ fill: col }}>
              {seg.map((g) => (
                <rect key={g.d} x={x(at.get(g.d)!) - bw / 2} width={bw}
                      y={y(g.y1)} height={Math.max(1, y(g.y0) - y(g.y1))} />
              ))}
            </g>
          )
        })
      })() : type === 'combo' ? (() => {
        /* Two measures, two marks, ONE axis and no second one.
           Where two scales line up is an arbitrary choice, and publishing both
           manufactures a correlation that is not in the data. When the two are
           far apart the honest answer is two charts, which is what the split
           rule already gives -- so this draws them against the shared scale and
           lets that be visible. */
        const [b, l] = series
        const bw = Math.max(2, slot * 0.5)
        return <>
          <g style={{ fill: `var(${SERIES_VAR[0]})` }}>
            {b.points.map((p) => {
              const i = at.get(p.on); if (i == null) return null
              const top = y(p.v), base = y(Math.max(lo, 0))
              return <rect key={p.on} x={x(i) - bw / 2} width={bw}
                           y={Math.min(top, base)} height={Math.max(1, Math.abs(base - top))} />
            })}
          </g>
          {l && (
            <g style={{ stroke: `var(${SERIES_VAR[1]})` }}>
              <path className="chart__ln" d={l.points
                .map((p) => ({ ...p, i: at.get(p.on) }))
                .filter((p): p is typeof p & { i: number } => p.i != null)
                .map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')} />
            </g>
          )}
        </>
      })() : SLOTTED.has(type) ? series.map((s, si) => {
        // Side by side in the slot, never piled: a pile answers "what is the
        // total", and grouped columns are measures that have no meaningful one.
        const grouped = type === 'colg'
        const bw = grouped
          ? Math.max(2, (slot * 0.66) / series.length)
          : Math.max(2, slot * 0.6)
        return (
          <g key={s.measure} style={{ fill: `var(${SERIES_VAR[(si + colourFrom) % 3]})` }}>
            {s.points.map((p) => {
              const i = at.get(p.on); if (i == null) return null
              const cx = grouped ? x(i) - (bw * series.length) / 2 + si * bw : x(i) - bw / 2
              const top = y(p.v), base = y(Math.max(lo, 0))
              return <rect key={p.on} x={cx} width={bw}
                           className={anyChosen && !chosen!.has(p.on) ? 'is-dim' : undefined}
                           y={Math.min(top, base)} height={Math.max(1, Math.abs(base - top))} />
            })}
          </g>
        )
      }) : series.map((s, si) => {

        // Positioned by DAY, not by position within this series. A measure
        // missing a Tuesday used to shift its whole line a day to the left.
        const pts = s.points.map((p) => ({ ...p, i: at.get(p.on) }))
          .filter((p): p is typeof p & { i: number } => p.i != null)
        if (pts.length === 0) return null
        const d = pts.map((p, k) =>
          `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
        const last = pts[pts.length - 1]
        return (
          <g key={s.measure} style={{ stroke: `var(${SERIES_VAR[(si + colourFrom) % 3]})` }}>
            {(series.length === 1 || type === 'area') && (
              <path className="chart__ar"
                    style={{ color: `var(${SERIES_VAR[(si + colourFrom) % 3]})`,
                             fill: `url(#${gid}-a)`, stroke: 'none' }}
                    d={`${d} L${x(last.i).toFixed(1)} ${h - padB} L${x(pts[0].i).toFixed(1)} ${h - padB} Z`} />
            )}
            {/* The line stays whole even when only some days are chosen. Drawing
                it through a non-contiguous subset would invent segments between
                days that are not next to each other -- a picture of something
                that never happened. The dots carry the selection instead. */}
            <path className="chart__ln" d={d} />
            {picked && pts.slice(0, -1).map((p) => (
              <circle key={p.on} className="chart__pt" cx={x(p.i)} cy={y(p.v)}
                      r={chosen!.has(p.on) ? 4.5 : 2.6}
                      style={{ fill: `var(${SERIES_VAR[(si + colourFrom) % 3]})`, stroke: 'none' }}
                      opacity={anyChosen && !chosen!.has(p.on) ? 0.26 : 0.85} />
            ))}
            {/* The end of the line is where you are now. A filled ring on the
                surface reads as a destination; another identical dot reads as
                one more reading. */}
            <circle className="chart__now" cx={x(last.i)} cy={y(last.v)} r="4.4"
                    style={{ stroke: `var(${SERIES_VAR[(si + colourFrom) % 3]})` }} />
            {/* The line says its own name where the line ends, which is where
                your eye already is. A legend makes you match a colour to a key
                and look back -- three operations to answer "which one is that". */}
            {!bare && series.length > 1 && (
              <text className="chart__end" x={x(last.i) + 8} y={y(last.v) + 4}
                    style={{ fill: `var(${SERIES_VAR[(si + colourFrom) % 3]})`, stroke: 'none' }}>
                {s.measure}
              </text>
            )}
          </g>
        )
      })}

      {/* One invisible column per day, the full height of the plot, so a day is
          chosen by clicking anywhere above or below its point rather than by
          hitting a three-pixel dot. */}
      {picked && days.map((d, i) => (
        <rect key={`h${d}`} className="chart__hit" x={x(i) - slot / 2} width={slot}
              y={padT} height={h - padT - padB}
              onClick={(e) => picked.pick(d, e.shiftKey)}>
          <title>{day(d)}</title>
        </rect>
      ))}

    </svg>
    </div>
  )
}


/**
 * One number, and when it was read. No chart at all.
 *
 * A single figure drawn as a one-point line is a chart apologising for having
 * nothing to show. Some reports are a number; this is what they look like.
 */
function Big({ series }: { series: Series[] }) {
  const s = series[0]
  const last = s.points[s.points.length - 1]
  const prev = s.points[s.points.length - 2]
  const move = prev ? last.v - prev.v : null
  return (
    <div className="bignum">
      <b className="tnum">{nf.format(last.v)}</b>
      <span>
        {s.measure} · {day(last.on)}
        {move !== null && move !== 0 && (
          <em className={move > 0 ? 'up' : 'down'}>
            {move > 0 ? '▲' : '▼'} {nf.format(Math.abs(move))}
          </em>
        )}
      </span>
    </div>
  )
}

/**
 * Bars along the axis instead of up it.
 *
 * This type exists for one reason -- long labels -- so the label is the point
 * of it and gets real room. Reads newest-first down the page, because that is
 * the order somebody scans a list.
 */
function BarH({ series, height, bare }: { series: Series[]; height: number; bare?: boolean }) {
  const s = series[0]
  const pts = s.points.slice(-12).reverse()
  const max = Math.max(...pts.map((p) => Math.abs(p.v)), 1)
  const rowH = Math.max(18, Math.min(34, height / Math.max(1, pts.length)))
  const labelW = bare ? 0 : 74
  const figW = bare ? 0 : 62
  return (
    <div className="chartbox" style={{ height: rowH * pts.length + 4 }}>
      <svg className="chart" viewBox={`0 0 400 ${rowH * pts.length + 4}`} preserveAspectRatio="none"
           role="img" aria-label={s.measure}>
        {pts.map((p, i) => {
          const w = (Math.abs(p.v) / max) * (400 - labelW - figW - 8)
          const y = i * rowH + rowH * 0.18
          return (
            <g key={p.on}>
              {!bare && (
                <text className="chart__ax" x={labelW - 8} y={y + rowH * 0.42} textAnchor="end">
                  {day(p.on)}
                </text>
              )}
              <rect x={labelW} y={y} width={Math.max(1, w)} height={rowH * 0.62}
                    style={{ fill: 'var(--s1)' }} />
              {!bare && (
                <text className="chart__ax" x={labelW + w + 6} y={y + rowH * 0.42}>
                  {nf.format(p.v)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * Does one measure move with the other.
 *
 * Two measures, and the axes are the measures rather than time -- which is the
 * whole difference between this and every other type in the kit. A point is a
 * DAY, so the same day's two readings are what get paired; pairing by position
 * would quietly compare Monday's sales with Tuesday's count the moment one
 * measure missed a day.
 */
function Scatter({ series, height, bare, labels }: {
  series: Series[]; height: number; bare?: boolean; labels?: boolean
}) {
  const { ref, w } = useWidth()
  const [ax, ay] = series
  if (!ax || !ay) return null

  const byDay = new Map(ay.points.map((p) => [p.on, p.v]))
  const pairs = ax.points
    .filter((p) => byDay.has(p.on))
    .map((p) => ({ on: p.on, x: p.v, y: byDay.get(p.on)! }))
  if (pairs.length === 0) return null

  const padL = bare ? 4 : 56, padR = bare ? 4 : 16
  const padT = bare ? 6 : 16, padB = bare ? 6 : (labels ? 28 : 12)
  const xs = pairs.map((p) => p.x), ys = pairs.map((p) => p.y)
  const xlo = Math.min(...xs), xhi = Math.max(...xs)
  const ylo = Math.min(...ys), yhi = Math.max(...ys)
  const sx = (v: number) => padL + ((v - xlo) / ((xhi - xlo) || 1)) * (w - padL - padR)
  const sy = (v: number) => height - padB - ((v - ylo) / ((yhi - ylo) || 1)) * (height - padT - padB)

  return (
    <div className="chartbox" ref={ref} style={{ height }}>
      <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img"
           aria-label={`${ax.measure} against ${ay.measure}`}>
        <line className="chart__base" x1={padL} x2={w - padR} y1={height - padB} y2={height - padB} />
        <line className="chart__gr" x1={padL} x2={padL} y1={padT} y2={height - padB} />
        {pairs.map((p) => (
          <circle key={p.on} cx={sx(p.x)} cy={sy(p.y)} r={bare ? 3 : 5}
                  style={{ fill: 'var(--s1)' }} opacity=".75">
            <title>{`${day(p.on)} · ${nf.format(p.x)} / ${nf.format(p.y)}`}</title>
          </circle>
        ))}
        {!bare && <>
          <text className="chart__ax" x={w - padR} y={height - 6} textAnchor="end">{ax.measure}</text>
          <text className="chart__ax" x={padL} y={padT - 4}>{ay.measure}</text>
        </>}
      </svg>
    </div>
  )
}

/**
 * A pie of the newest reading per slice. Six named wedges is the cap and the
 * rest become "Other (n)" — past six, adjacent wedges start wearing colours
 * nobody can tell apart, and a pie's wedges are adjacent by construction.
 */
function Pie({ series, height, compact }: { series: Series[]; height: number; compact?: boolean }) {
  const s = series[0]
  const pts = s.points.slice(-12)
  const total = pts.reduce((t, p) => t + Math.max(0, p.v), 0)
  if (total <= 0) return null

  const named = pts.slice(-6)
  const restV = pts.slice(0, Math.max(0, pts.length - 6)).reduce((t, p) => t + Math.max(0, p.v), 0)
  const slices = [
    ...named.map((p) => ({ label: day(p.on), v: Math.max(0, p.v) })),
    ...(restV > 0 ? [{ label: `Other (${pts.length - named.length})`, v: restV }] : []),
  ]

  const r = Math.min(height, 260) / 2 - 8
  const cx = r + 8, cy = r + 8
  let a = -Math.PI / 2

  return (
    <div className="pie">
      <svg className="chart chart--pie" viewBox={`0 0 ${(r + 8) * 2} ${(r + 8) * 2}`}
           style={{ width: (r + 8) * 2, height: (r + 8) * 2 }}
           role="img" aria-label={s.measure}>
        {slices.map((sl, i) => {
          const frac = sl.v / total
          const a0 = a, a1 = a + frac * Math.PI * 2
          a = a1
          // A single slice is a whole circle, and an arc cannot draw 360°.
          if (frac >= 0.9999) {
            return <circle key={sl.label} cx={cx} cy={cy} r={r}
                           style={{ fill: `var(${PIE_VAR[i % 6]})` }} />
          }
          const p = (ang: number) => `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`
          return (
            <path key={sl.label} style={{ fill: `var(${PIE_VAR[i % 6]})` }}
                  d={`M${cx} ${cy} L${p(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z`} />
          )
        })}
      </svg>
      {/* On a card the pie is a shape you glance at; the legend is what you
          read, and there is no room to read. It comes back at full size. */}
      {!compact && <ul className="legend">
        {slices.map((sl, i) => (
          <li key={sl.label}>
            <span className="legend__k" style={{ background: `var(${PIE_VAR[i % 6]})` }} />
            {sl.label}<b>{nf.format(sl.v)}</b>
            <span className="legend__p">{Math.round((sl.v / total) * 100)}%</span>
          </li>
        ))}
      </ul>}
    </div>
  )
}

/** Which line is which. Absent for one series, because naming the only thing
 *  on the plot is noise. */
export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <ul className="legend legend--row">
      {series.map((s, i) => (
        <li key={s.measure}>
          <span className="legend__k" style={{ background: `var(${SERIES_VAR[i % 3]})` }} />
          {s.measure}
        </li>
      ))}
    </ul>
  )
}
