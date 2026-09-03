'use server'

import { supabaseServer } from '@/lib/supabase/server'

const KINDS = ['report', 'dashboard', 'entity', 'person', 'location'] as const
export type RecentKind = (typeof KINDS)[number]

/**
 * Remember that somebody opened something.
 *
 * Deliberately quiet: it returns nothing, it is not awaited by anything that
 * renders, and a failure is dropped. This is a convenience on a page, and a
 * page that would not load because it could not write down that you had loaded
 * it would be an absurd trade.
 *
 * The trimming to ten lives in the database rather than here, so the list
 * cannot grow past ten whatever forgets to prune it -- and this is written to
 * on every record page there is.
 */
export async function remember(kind: RecentKind, id: string, label: string, sub?: string | null) {
  if (!KINDS.includes(kind) || !id || !label) return
  try {
    await supabaseServer().schema('hopper').rpc('remember', {
      p_kind: kind, p_object: id, p_label: label, p_sub: sub ?? null,
    })
  } catch { /* never worth failing a page over */ }
}
