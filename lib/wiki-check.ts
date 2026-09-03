/**
 * The freshness rules, with no database in them.
 *
 * These live apart from lib/wiki.ts on purpose: the button that marks a
 * document checked is a client component, and importing this from there used
 * to drag the server Supabase client -- and next/headers with it -- into the
 * browser bundle. Pure functions belong in a file with no imports.
 */

/**
 * How long a procedure may go unconfirmed before it stops being trustworthy.
 * A year is the point at which somebody has changed a supplier, a machine or a
 * rule and not told the handbook.
 */
export const CHECK_DUE_DAYS = 365
export const CHECK_OLD_DAYS = 730

export type CheckState = 'ok' | 'due' | 'old' | 'never'

export function checkState(at: string | null): CheckState {
  if (!at) return 'never'
  const days = (Date.now() - new Date(at).getTime()) / 86400000
  return days > CHECK_OLD_DAYS ? 'old' : days > CHECK_DUE_DAYS ? 'due' : 'ok'
}

/** The initials Hopper puts in a circle, worked out the same way everywhere. */
export const initialsOf = (name?: string | null) => (name ?? '')
  .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || null
