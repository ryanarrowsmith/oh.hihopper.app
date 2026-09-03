'use client'
import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Which organization, asked once.
 *
 * The switcher in the top bar has been there since the frame went up and never
 * did anything: it set a label in its own component state, and no other part of
 * the product ever read it. A control that moves and changes nothing is worse
 * than no control -- it teaches you the page is already filtered when it is
 * not, which is the same failure as a stale number.
 *
 * Kept by id and not by name. A name is a label an organization wears, not the
 * organization; two of them may share one, and renaming one would silently
 * point the stored choice at nothing.
 */
const KEY = 'hopper.scope'

/**
 * The chosen organization, and every organization it contains.
 *
 * Picking a parent has to mean the parent AND what hangs under it, or choosing
 * a holding company shows an empty page while every one of its businesses sits
 * one level down. Resolving that needs the org tree, which only the top bar
 * has -- so the bar writes the answer down here, and everything downstream asks
 * a set rather than walking a tree it was never given.
 */
export type Scope = { id: string | null; ids: string[] }
const ALL: Scope = { id: null, ids: [] }

/**
 * Where an organization is a meaningful question AND something reads the
 * answer. Both halves matter: listing a page here that does not filter itself
 * puts an idle switcher back on it, which is the exact bug this file exists to
 * fix, only quieter and harder to find.
 *
 * So a page joins this list in the same change that teaches it to filter, never
 * before. Favorites is deliberately absent -- they are yours and they cross
 * organizations, and one of the things you may favorite IS an organization.
 */
const SCOPED = ['/reporting', '/dashboards', '/people']

export function scopeApplies(path: string) {
  return SCOPED.some((p) => path === p || path.startsWith(p + '/'))
}

/** So a change in the bar reaches the page under it without a round trip. */
const CHANGED = 'hopper:scope'

export function useScope() {
  // Starts wide and corrects on mount. The server has no localStorage, and a
  // first paint that disagrees with the second is a flash of the wrong answer.
  const [scope, setScope] = useState<Scope>(ALL)
  const path = usePathname()

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(KEY)
        const v = raw ? JSON.parse(raw) : null
        setScope(v && v.id ? { id: v.id, ids: Array.isArray(v.ids) ? v.ids : [v.id] } : ALL)
      } catch { /* a browser that refuses storage still gets a working page */ }
    }
    read()
    // Two listeners, two different journeys: `storage` is this account in
    // another tab, and the custom event is the bar three elements up from the
    // list it filters -- same document, so `storage` never fires for it.
    window.addEventListener('storage', read)
    window.addEventListener(CHANGED, read)
    return () => {
      window.removeEventListener('storage', read)
      window.removeEventListener(CHANGED, read)
    }
  }, [])

  const put = useCallback((next: Scope) => {
    setScope(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* not fatal */ }
    window.dispatchEvent(new Event(CHANGED))
  }, [])

  /**
   * Whether a row belongs to what is chosen. Wide open answers yes to
   * everything, INCLUDING a row with no organization at all -- "all
   * organizations" is not a filter and must not quietly behave like one.
   */
  const covers = useCallback(
    (entityId: string | null | undefined) =>
      scope.id === null || (!!entityId && scope.ids.includes(entityId)),
    [scope],
  )

  return { scope, setScope: put, covers, applies: scopeApplies(path ?? '/') }
}
