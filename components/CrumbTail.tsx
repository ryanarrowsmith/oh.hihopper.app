'use client'
import { createContext, useContext, useEffect, useState } from 'react'

/**
 * The last crumb, named by the page that knows the name.
 *
 * A record's page lives at a uuid, and Crumbs quite rightly refuses to print a
 * uuid at somebody -- so it dropped the crumb entirely and the trail stopped
 * at "People", one step short of the person you were looking at. The layout
 * cannot fix that on its own: it has no idea which route is below it, and
 * fetching every person in the account on every page so a breadcrumb might
 * name one of them is a bad trade.
 *
 * So the page says. It already loaded the record; the name is sitting right
 * there. <CrumbTail>{d.full_name}</CrumbTail> hands it up, Crumbs uses it in
 * place of the crumb it dropped, and any record page can join in with one
 * line. It arrives a frame after the trail is first painted, which is why the
 * crumb appears rather than changing -- a label that rewrites itself in front
 * of you is worse than one that shows up.
 */
const Tail = createContext<{
  label: string | null
  set: (v: string | null) => void
}>({ label: null, set: () => {} })

export function CrumbTailProvider({ children }: { children: React.ReactNode }) {
  const [label, set] = useState<string | null>(null)
  return <Tail.Provider value={{ label, set }}>{children}</Tail.Provider>
}

export function useCrumbTail() { return useContext(Tail).label }

export default function CrumbTail({ children }: { children: string }) {
  const { set } = useContext(Tail)
  useEffect(() => { set(children); return () => set(null) }, [children, set])
  return null
}
