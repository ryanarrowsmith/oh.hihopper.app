'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { CATALOG, type WidgetKey } from '@/lib/widgets'

/**
 * How somebody's home page is arranged.
 *
 * One write for the whole page rather than one per widget, because the order is
 * a single fact: two widgets swapping places is one change, and saving it as
 * two would leave a moment where both claim the same slot.
 *
 * Nothing here checks who this is beyond naming them. The policy on
 * home_widget does that, and a second copy of it in JavaScript is a second
 * place to be wrong.
 */
export async function saveHome(keys: WidgetKey[], on: WidgetKey[]) {
  const session = await currentSession()
  if (!session?.personId) return { ok: false, message: 'You have no person record in Hopper yet.' }

  const known = new Map(CATALOG.map((w) => [w.key, w]))
  const lit = new Set(on)

  // An unbuilt widget cannot be switched on however the request arrives. The
  // picker already greys them out, but the picker is the browser's copy of the
  // rule and this is the one that holds.
  const rows = keys
    .filter((k) => known.has(k))
    .map((key, i) => ({
      account_id: session.accountId,
      person_id: session.personId!,
      widget_key: key,
      sort_order: i,
      enabled: lit.has(key) && !!known.get(key)!.built,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length === 0) return { ok: true }

  const { error } = await supabaseServer().schema('hopper')
    .from('home_widget').upsert(rows, { onConflict: 'person_id,widget_key' })

  if (error) {
    return { ok: false, message: /row-level security|permission denied/i.test(error.message)
      ? 'That is not yours to change.' : error.message }
  }

  revalidatePath('/')
  return { ok: true }
}
