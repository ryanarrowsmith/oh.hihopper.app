'use client'
import { useEffect, useRef } from 'react'
import { remember, type RecentKind } from '@/app/actions/recent'

/**
 * Writes down that this page was opened.
 *
 * A client component firing once on mount, rather than a call inside the server
 * component that renders the page. Two reasons, and both matter: a server
 * component runs again on every revalidation and prefetch, so the visit would
 * be recorded for pages nobody actually looked at; and rendering is supposed to
 * have no side effects, which is not a rule to break for a convenience.
 *
 * The ref is what makes it once. React mounts twice in development, and
 * without it the first thing anybody would notice is their own history
 * doubling.
 */
export default function Remember({ kind, id, label, sub }: {
  kind: RecentKind; id: string; label: string; sub?: string | null
}) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    remember(kind, id, label, sub)
  }, [kind, id, label, sub])
  return null
}
