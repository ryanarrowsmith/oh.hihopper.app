/**
 * The marks News uses.
 *
 * Ryan: "Don't do text labels in boxes; use icons where you can with popover
 * labels." So a category is a shape with its name on the tip, a countdown is a
 * clock rather than a bordered pill saying "3 DAYS LEFT", and the actions on
 * the list are marks. The word never disappears -- it is the accessible name
 * and the tooltip, so a screen reader and a resting finger both still get it.
 *
 * No 'use client' on this file on purpose: a server page and a client form both
 * render these, and a plain record of elements exported across that boundary
 * arrives as a proxy rather than as itself. That cost two 500s already.
 */
export const I = (d: string, w = '1.8') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)

/** The shapes a category can wear. Chosen when the category is named. */
export const MARKS: Record<string, string> = {
  notice:   '<path d="M12 3v10"/><path d="M12 17v.1"/><circle cx="12" cy="12" r="9"/>',
  ops:      '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  people:   '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0 0-6"/>',
  money:    '<path d="M12 3v18"/><path d="M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.5s2.2 2.8 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/>',
  building: '<rect x="3" y="8" width="7" height="13"/><rect x="14" y="3" width="7" height="18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  warn:     '<path d="M12 4.5 21 20H3z"/><path d="M12 10v4"/><path d="M12 17v.1"/>',
  star:     '<path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9z"/>',
}
export const MARK_WORD: Record<string, string> = {
  notice: 'Notice', ops: 'Operations', people: 'People', money: 'Money',
  building: 'Building', calendar: 'Dated', warn: 'Warning', star: 'Highlight',
}

export const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'
export const CLIP  = '<path d="M21.4 11.1 12.3 20a5 5 0 0 1-7-7l9-8.9a3.3 3.3 0 0 1 4.7 4.7l-9 8.9a1.7 1.7 0 0 1-2.4-2.4l8.4-8.3"/>'
export const LINK  = '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
export const PAGE  = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'
export const PLUS  = '<path d="M12 5v14M5 12h14"/>'
export const PRINT = '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'
export const PEN   = '<path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z"/><path d="M14.5 5.5 18.5 9.5"/>'
export const TUNE  = '<path d="M4 6h16M7 12h10M10 18h4"/>'
export const X     = '<path d="M6 6l12 12M18 6L6 18"/>'
export const BOARD = '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 13h14M5 17h9"/>'

/** A category, as its shape, with its name where a name belongs. */
export function Kat({ mark, name }: { mark: string; name: string | null }) {
  if (!name) return null
  return (
    <span className="nkat" role="img" aria-label={name} data-tip={name}>
      {I(MARKS[mark] ?? MARKS.notice, '1.9')}
    </span>
  )
}

/** How long it has left on the banner. A clock, not a box of words. */
export function Left({ days, off }: { days: number; off: string }) {
  const when = new Date(`${off}T00:00:00`)
    .toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  const said = days <= 0 ? `Last day on the banner — off after ${when}`
    : `${days} ${days === 1 ? 'day' : 'days'} left on the banner — off after ${when}`
  return (
    <span className={`nleft${days <= 1 ? ' is-soon' : ''}`} role="img"
          aria-label={said} data-tip={said}>
      {I(CLOCK, '1.9')}<b>{Math.max(days, 0)}</b>
    </span>
  )
}

export const day = (d: string | null) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  : null

export const size = (n: number) =>
  n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB`
  : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`
