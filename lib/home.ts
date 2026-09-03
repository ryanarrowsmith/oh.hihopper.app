import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { CATALOG, type WidgetKey } from '@/lib/widgets'

/**
 * Reading somebody's home page.
 *
 * Split from the catalogue itself because the catalogue is shared with the
 * browser -- the picker has to name every widget -- and this is not: it reads
 * the table, so it must never be bundled into a client component. `server-only`
 * is what makes that a build error rather than a leak nobody notices.
 */
/**
 * A page nobody has arranged yet.
 *
 * Four widgets, and every one of them has something to show on the day an
 * account is opened -- which is the only defensible test for a default. A
 * default that arrives empty teaches somebody the product is empty.
 */
const DEFAULT: WidgetKey[] = ['favs', 'dash', 'locs']

export type Placed = { key: WidgetKey; on: boolean }

/**
 * This person's page, as an ordered list.
 *
 * Stored rows win; anything the catalogue has that they have never touched
 * follows, off. So adding a widget to the catalogue later puts it in everyone's
 * picker and on nobody's page, which is the only way round that does not
 * rearrange a page somebody already arranged.
 */
export async function loadWidgets(): Promise<Placed[]> {
  const db = supabaseServer()
  const { data } = await db.schema('hopper').from('home_widget')
    .select('widget_key, sort_order, enabled').order('sort_order')

  const said = new Map((data ?? []).map((r: any) => [r.widget_key as WidgetKey, !!r.enabled]))
  const order = (data ?? []).map((r: any) => r.widget_key as WidgetKey)

  const known = new Set(CATALOG.map((w) => w.key))
  const placed: Placed[] = []

  // Their arrangement first, skipping any key the catalogue has since dropped
  // -- a retired widget leaves a row behind and must not leave a hole.
  for (const k of order) if (known.has(k)) placed.push({ key: k, on: said.get(k) !== false })

  // Then everything they have never said anything about: on if it is a default
  // and they have said nothing at all, off otherwise.
  const fresh = placed.length === 0
  for (const w of CATALOG) {
    if (placed.some((p) => p.key === w.key)) continue
    placed.push({ key: w.key, on: w.built && (fresh ? DEFAULT.includes(w.key) : false) })
  }

  return placed
}
