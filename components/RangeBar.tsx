'use client'
import DateField from '@/components/DateField'
import { PRESETS, type Range } from '@/components/useRange'

/**
 * The range sits above the groups because it governs all of them, and it says
 * what it is standing on. A window with no readings in it should say so rather
 * than looking like a portfolio that lost its numbers.
 */
export default function RangeBar({ range, setRange, kept, total, undated }: {
  range: Range
  setRange: (r: Range) => void
  /** Readings inside the window, and in total, across everything on the page. */
  kept: number
  total: number
  /** Reports whose source carries no dates, and so cannot be filtered at all. */
  undated: number
}) {
  const w = range
  return (
    <>
      <div className="rbar">
        <span className="rbar__l">Which time</span>
        <div className="seg" role="group" aria-label="Which time">
          {PRESETS.map((p) => (
            <button key={p.k} className="seg__b" type="button"
                    aria-pressed={range.preset === p.k}
                    onClick={() => setRange({ preset: p.k, from: null, to: null })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="rbar__f">
          <DateField label="From" value={w.from}
                     onChange={(v) => setRange({ preset: 'custom', from: v, to: w.to })} />
          <span>to</span>
          <DateField label="To" value={w.to}
                     onChange={(v) => setRange({ preset: 'custom', from: w.from, to: v })} />
        </div>
      </div>
      {(range.preset !== 'all' || undated > 0) && (
        <p className="rbar__say">
          {range.preset !== 'all' && <>
            <b>{kept.toLocaleString()}</b> of {total.toLocaleString()} readings fall inside it.{' '}
          </>}
          {undated > 0 && <>
            {undated} report{undated === 1 ? '' : 's'} {undated === 1 ? 'has' : 'have'} no date
            column, so {undated === 1 ? 'it is' : 'they are'} shown whole rather than pretending
            to be filtered.
          </>}
        </p>
      )}
    </>
  )
}
