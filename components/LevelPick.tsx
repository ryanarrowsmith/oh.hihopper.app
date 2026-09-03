'use client'
import { useState } from 'react'
import { LEVELS, LEVEL_WORD, rank, type Level } from '@/lib/access'

const I = (d: string, w = '2.2') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
export const LEVEL_MARK: Record<Level, string> = {
  read: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z"/><path d="M14.5 5.5 18.5 9.5"/>',
  admin: '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>',
}

/**
 * The scale, as one control.
 *
 * Three steps, always all three visible, and everything up to the level held is
 * filled -- because Admin IS Edit and Edit IS Read, and filling only the last
 * step would say they were alternatives. A dropdown would hide the containment,
 * which is the only thing anybody needs to understand here.
 *
 * Pressing the step you already hold turns it off. That is the only way to say
 * "none" without a fourth button whose whole job is to be the absence of the
 * other three.
 */
export default function LevelPick({ name, start, inherited, onPick, disabled, max }: {
  name: string
  start: Level | null
  /** shown but not settable here -- it comes from somewhere above */
  inherited?: boolean
  onPick?: (l: Level | null) => void
  disabled?: boolean
  /** the highest step this thing has. Some permissions genuinely stop at Read
   *  -- a step that saves and changes nothing is worse than a step that is not
   *  offered. */
  max?: Level
}) {
  const [now, setNow] = useState<Level | null>(start ?? null)
  const top = rank(now)

  return (
    <span className={`lvl${inherited ? ' lvl--from' : ''}${now ? '' : ' lvl--off'}`
                     + `${now === 'admin' ? ' lvl--admin' : ''}`}>
      {/* The form only ever carries a level, never three booleans. */}
      <input type="hidden" name={name} value={now ?? 'none'} />
      {LEVELS.filter((l) => rank(l) <= rank(max ?? 'admin')).map((l, i) => {
        const n = i + 1
        const cls = n < top ? 'is-on' : n === top ? 'is-top' : ''
        return (
          <button key={l} type="button" className={cls} disabled={disabled || inherited}
                  aria-pressed={rank(now) >= n}
                  aria-label={`${LEVEL_WORD[l]}${rank(now) >= n ? ' — held' : ''}`}
                  onClick={() => {
                    const next = now === l ? null : l
                    setNow(next); onPick?.(next)
                  }}>
            {I(LEVEL_MARK[l])}{LEVEL_WORD[l]}
          </button>
        )
      })}
    </span>
  )
}
