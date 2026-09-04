import type { LStatus } from '@/lib/todo'

/**
 * The four words a list can be called.
 *
 * The coloured status cell and the progress bar that used to live here went
 * with the portfolio table they belonged to. What is left is the word itself,
 * which is all the status line and the picker need.
 */
export const WORD: Record<LStatus, string> = {
  on_track: 'On track', at_risk: 'At risk', blocked: 'Blocked', complete: 'Complete',
}
