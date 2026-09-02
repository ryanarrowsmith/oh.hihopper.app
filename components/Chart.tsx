'use client'

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

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const short = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
  : nf.format(n)
const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function Chart({
  type, series, height = 250, labels = true, compact = false, bare = false,
}: {
  type: string; series: Series[]; height?: number
  labels?: boolean; compact?: boolean
  /** No gridlines, no axis figures. For a card, where the chart is a shape you
   *  glance at on the way past the number rather than something you read. */
  bare?: boolean
}) {
  const live = series.filter((s) => s.points.length > 0)
  if (live.length === 0) return null
  if (type === 'pie') return <Pie series={live} height={height} compact={compact} />
  return <Axes type={type === 'bar' ? 'bar' : 'line'} series={live}
                height={height} labels={labels && !bare} bare={bare} />
}

/**
 * Bars and lines share an axis, a scale and a set of gridlines, so they share
 * a component. Only the marks differ, which is the only thing that should.
 */
function Axes({ type, series, height, labels, bare }: {
  type: 'bar' | 'line'; series: Series[]; height: number; labels: boolean; bare?: boolean
}) {
  const w = 820, h = height
  const padL = bare ? 2 : 46, padR = bare ? 2 : 16
  const padT = bare ? 4 : 16, padB = bare ? 4 : (labels ? 30 : 12)

  // Every series is drawn against ONE scale. Two y-axes on one plot is a chart
  // that can be made to say anything by choosing where each axis starts.
  const all = series.flatMap((s) => s.points.map((p) => p.v))
  const rawLo = Math.min(...all), rawHi = Math.max(...all)
  // Bars are read as areas, so their baseline has to be zero or the picture
  // lies about the ratio between them. A line is read as a slope and may be
  // zoomed into the band the numbers actually occupy.
  const lo = type === 'bar' ? Math.min(0, rawLo) : rawLo
  const hi = rawHi
  const span = hi - lo || 1

  const n = Math.max(...series.map((s) => s.points.length))
  const x = (i: number) => padL + (n === 1 ? (w - padL - padR) / 2 : (i / (n - 1)) * (w - padL - padR))
  const y = (v: number) => h - padB - ((v - lo) / span) * (h - padT - padB)

  const ticks = [lo, lo + span / 2, hi]
  const first = series[0]?.points ?? []
  const every = Math.max(1, Math.ceil(first.length / 7))

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
         role="img" aria-label={series.map((s) => s.measure).join(', ')}>
      {!bare && ticks.map((t, i) => (
        <g key={i}>
          <line className="chart__gr" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
          <text className="chart__ax" x={padL - 8} y={y(t) + 3.5} textAnchor="end">{short(t)}</text>
        </g>
      ))}

      {type === 'bar' ? series.map((s, si) => {
        // Bars for several series sit side by side in the slot, never stacked:
        // a stack answers "what is the total", and these are three separate
        // measures that have no meaningful total.
        const slot = (w - padL - padR) / Math.max(1, n)
        const bw = Math.max(2, (slot * 0.62) / series.length)
        return (
          <g key={s.measure} style={{ fill: `var(${SERIES_VAR[si % 3]})` }}>
            {s.points.map((p, i) => {
              const cx = x(i) - (bw * series.length) / 2 + si * bw
              const top = y(p.v), base = y(Math.max(lo, 0))
              return <rect key={p.on} x={cx} width={bw}
                           y={Math.min(top, base)} height={Math.max(1, Math.abs(base - top))} />
            })}
          </g>
        )
      }) : series.map((s, si) => {
        const d = s.points.map((p, i) =>
          `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
        const last = s.points[s.points.length - 1]
        return (
          <g key={s.measure} style={{ stroke: `var(${SERIES_VAR[si % 3]})` }}>
            {series.length === 1 && (
              <path className="chart__ar" style={{ fill: `var(${SERIES_VAR[si % 3]})`, stroke: 'none' }}
                    d={`${d} L${x(s.points.length - 1).toFixed(1)} ${h - padB} L${x(0).toFixed(1)} ${h - padB} Z`} />
            )}
            <path className="chart__ln" d={d} />
            <circle className="chart__pt" cx={x(s.points.length - 1)} cy={y(last.v)} r="3.6"
                    style={{ fill: `var(${SERIES_VAR[si % 3]})`, stroke: 'none' }} />
          </g>
        )
      })}

      {labels && first.map((p, i) => i % every === 0 || i === first.length - 1 ? (
        <text key={p.on} className="chart__ax" x={x(i)} y={h - 9} textAnchor="middle">{day(p.on)}</text>
      ) : null)}
    </svg>
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
