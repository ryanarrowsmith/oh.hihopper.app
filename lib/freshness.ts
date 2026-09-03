/**
 * Whether a report is current, how far behind it is, and whether that wants a
 * person.
 *
 * Lifted out of lib/cards.ts when the home page started asking the same
 * question. Two answers to "is this report late" is how a home page and a
 * reporting page end up disagreeing in front of somebody -- and the one that
 * disagrees is always the one nobody looked at.
 *
 * Plain module, deliberately: no `server-only`, no `use client`. The rule is
 * arithmetic on a row, and both sides need it.
 */
export type Freshness = 'new' | 'good' | 'behind' | 'failed' | 'snapshot'
export type Attention = 'late' | 'bad' | 'never' | null

/**
 * A date the sheet supplied is a DAY, not an instant, and `new Date('2026-08-08')`
 * is UTC midnight -- which west of Greenwich renders as the 7th. Anchoring at
 * the start of the day is what keeps "still since Aug 8" and "24 days late"
 * talking about one Aug 8.
 */
const dayStart = (iso: string) => new Date(`${iso}T00:00:00`).getTime()

/**
 * A report may go without moving for about as long as its schedule implies.
 * Nine days for a weekly one and not seven, because a sheet updated every
 * Monday is not late on Sunday night -- an allowance with no slack flags every
 * healthy report once a week, and a flag that cries wolf is worse than none.
 */
export function allowedFor(refresh: string | null) {
  const day = 86_400_000
  return refresh === 'weekly' ? 9 * day : refresh === 'daily' ? 2 * day : day
}

/**
 * Current, behind, or failed.
 *
 * When Hopper last LOOKED and when the data last MOVED are different questions,
 * and only the second one matters: a sheet nobody has touched in three weeks
 * still answers every request instantly, so calling that fresh fails quietly,
 * which is the worst way to fail.
 */
export function freshnessOf(r: {
  snapshot_at?: string | null; last_look?: string | null
  last_look_ok?: boolean | null; value_on?: string | null; refresh?: string | null
}): Freshness {
  if (r.snapshot_at) return 'snapshot'
  if (!r.last_look) return 'new'
  if (r.last_look_ok === false) return 'failed'
  if (!r.value_on) return 'good'
  return Date.now() - dayStart(r.value_on) > allowedFor(r.refresh ?? null) ? 'behind' : 'good'
}

/**
 * How many days past its allowance, so the card can say so in a number.
 *
 * "Behind" is a state you file; "24 days late" is a length you act on. Floored
 * rather than rounded -- a warning that rounds up overstates its case, and this
 * one is asking somebody to go and do something.
 */
export function lateBy(r: {
  snapshot_at?: string | null; value_on?: string | null; refresh?: string | null
}): number | null {
  if (r.snapshot_at || !r.value_on) return null
  const over = Date.now() - dayStart(r.value_on) - allowedFor(r.refresh ?? null)
  return over > 0 ? Math.max(1, Math.floor(over / 86_400_000)) : null
}

/**
 * Whether a report wants a person, and which kind of wanting.
 *
 * A snapshot never does: Hopper did not go back to look, said so, and flagging
 * it would invent a duty nobody signed up for.
 */
export function attentionOf(c: { freshness: Freshness }): Attention {
  if (c.freshness === 'failed') return 'bad'
  if (c.freshness === 'behind') return 'late'
  if (c.freshness === 'new') return 'never'
  return null
}
