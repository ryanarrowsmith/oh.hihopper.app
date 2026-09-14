/* ==========================================================================
   WHEN IT HAPPENS.

   Three small pieces of arithmetic that decide a date, kept pure and in one
   file so lib/booking.check.ts can run them against fixtures. No `server-only`
   and no database client, for the same reason lib/price.ts has neither.

   THE 811 WINDOW IS COMPUTED, NEVER STORED. Ryan's call, 14 Sep: the screen
   WARNS rather than refuses, and a warning that is a stored flag is a warning
   that goes stale. Whether a start falls outside the locate window is worked out
   here from three dates every time it is asked — so moving the start or calling
   a fresh locate corrects it on its own, and no write path has to remember to.
   ========================================================================== */

export type Window = {
  /** 'clear' inside the window · 'early' before the ticket matures ·
   *  'expired' after it dies · 'unknown' when the survey never recorded one. */
  state: 'clear' | 'early' | 'expired' | 'unknown'
  /** Days off the near or far edge. Zero inside the window. */
  off: number
  /** Working days left between the two ends of the locate. Null without both. */
  room: number | null
}

const DAY = 86_400_000
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const between = (a: string, b: string) => Math.round((+at(b) - +at(a)) / DAY)

/** Saturday and Sunday are not days anybody digs on. Neither end is counted. */
export function workdays(from: string, to: string): number {
  if (!from || !to) return 0
  let n = 0
  for (let d = +at(from) + DAY; d < +at(to) + DAY; d += DAY) {
    const day = new Date(d).getUTCDay()
    if (day !== 0 && day !== 6) n++
  }
  return n
}

/**
 * The last day on site, given a start and how many days it takes.
 *
 * Stored on the job rather than derived at read time — a job that ran long has
 * to be able to say so afterwards, and a derived figure would quietly rewrite
 * history the moment somebody corrected the duration.
 */
export function endsOn(start: string | null, days: number | null): string | null {
  if (!start || !days || days < 1) return null
  let left = days - 1
  let d = +at(start)
  while (left > 0) {
    d += DAY
    const w = new Date(d).getUTCDay()
    if (w !== 0 && w !== 6) left--
  }
  return iso(new Date(d))
}

/**
 * Whether the dig is inside what Oklahoma 811 allowed.
 *
 * The expiry is the half people forget. A job that slips three weeks gets dug on
 * a dead ticket and the marks on the ground are by then somebody's guess.
 */
export function digWindow(o: {
  startsOn: string | null
  digFrom: string | null
  locateExpires: string | null
}): Window {
  const room = o.digFrom && o.locateExpires ? workdays(o.digFrom, o.locateExpires) : null
  if (!o.startsOn || (!o.digFrom && !o.locateExpires)) {
    return { state: 'unknown', off: 0, room }
  }
  if (o.digFrom && o.startsOn < o.digFrom) {
    return { state: 'early', off: between(o.startsOn, o.digFrom), room }
  }
  if (o.locateExpires && o.startsOn > o.locateExpires) {
    return { state: 'expired', off: between(o.locateExpires, o.startsOn), room }
  }
  return { state: 'clear', off: 0, room }
}

/**
 * How long it takes, off the same arithmetic the price came from.
 *
 * The recipe prices labor in crew-hours and the takeoff already holds the
 * quantity, so the duration falls out of the quote rather than being guessed at
 * separately. It is an opening figure, not a ruling — the point is that it
 * starts right.
 */
export function daysFromHours(hours: number, crewSize: number | null): number | null {
  const size = crewSize && crewSize > 0 ? crewSize : 3
  if (!(hours > 0)) return null
  return Math.max(1, Math.ceil(hours / (size * 8)))
}

/** The labor hours in a priced job: every line the book sells by the hour. */
export function laborHours(lines: { uom: string | null; qty: number }[]): number {
  return lines
    .filter((l) => /^h(ou)?rs?$/i.test((l.uom ?? '').trim()))
    .reduce((s, l) => s + (Number(l.qty) || 0), 0)
}
