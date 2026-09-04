'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'

export type Note = {
  id: string; kind: string; title: string; body: string | null
  href: string; at: string; read_at: string | null; shown_at: string | null
}

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const MARK: Record<string, string> = {
  mention: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  grant: '<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L21 2l1 3-2 1 1 2-2.5 1"/>',
  admin: '<path d="M12 3l7.5 3.4v5.2c0 4.3-3 7.6-7.5 9.4-4.5-1.8-7.5-5.1-7.5-9.4V6.4z"/>',
  source: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 17h.01"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  assigned: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  status: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  // To Do. blocked, unblocked and moved could already arrive and had no mark of
  // their own -- they fell through to the @ symbol, which says "mention" and
  // means nothing about a padlock. The calendar is the same one the log uses,
  // so a date that changed looks like a date that changed wherever you meet it.
  blocked: '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>',
  unblocked: '<path d="M6 11V8a6 6 0 0 1 11.6-2"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>',
  moved: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  due: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  late: '<path d="M12 4.5 21 20H3z"/><path d="M12 10v4"/><path d="M12 17v.1"/>',
}

export function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'Yesterday' : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The boxes, and the websocket that brings them.
 *
 * Lives at the top of the app rather than inside the bell, because a toast has
 * to survive the bell being closed -- and because the same subscription feeds
 * both. Two subscriptions to one table is two answers to "how many are
 * unread".
 *
 * A notification is shown ONCE. `shown_at` is written the moment a box appears,
 * so a refresh does not replay the last hour at somebody, and seeing a box
 * float past is deliberately not the same as having read it.
 */
export default function Notifications({ personId, initial }: {
  personId: string | null; initial: Note[]
}) {
  const [all, setAll] = useState<Note[]>(initial)
  const [toasts, setToasts] = useState<Note[]>([])
  const db = useRef(supabaseBrowser())
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => { setAll(initial) }, [initial])

  const drop = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id]); delete timers.current[id]
  }, [])

  const raise = useCallback((n: Note) => {
    setToasts((t) => (t.some((x) => x.id === n.id) ? t : [...t, n].slice(-4)))
    // Ten seconds, then it goes. It stays in the list under the bell either
    // way, so nothing is lost by missing it.
    timers.current[n.id] = setTimeout(() => drop(n.id), 10_000)
    db.current.schema('hopper').from('notification')
      .update({ shown_at: new Date().toISOString() }).eq('id', n.id).then(() => {})
  }, [drop])

  // Anything that arrived while this tab was closed, shown once on arrival.
  useEffect(() => {
    for (const n of initial) if (!n.shown_at && !n.read_at) raise(n)
    // Only on the first list: re-running this on every refresh would show the
    // same boxes again the moment the page revalidated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!personId) return
    const ch = db.current
      .channel(`noti:${personId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'hopper', table: 'notification', filter: `person_id=eq.${personId}` },
        (p: any) => { const n = p.new as Note; setAll((a) => [n, ...a].slice(0, 30)); raise(n) })
      .subscribe()
    return () => { db.current.removeChannel(ch) }
  }, [personId, raise])

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout) }, [])

  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="region" aria-label="New notifications" aria-live="polite">
      {toasts.map((n) => (
        <div className="toast" key={n.id}>
          <Link className="toast__hit" href={n.href as any} onClick={() => drop(n.id)}
                aria-label={n.title} />
          <span className="toast__i">{I(MARK[n.kind] ?? MARK.mention)}</span>
          <span className="toast__t">
            <b>{n.title}</b>
            {n.body && <span>{n.body}</span>}
          </span>
          <button className="toast__x" type="button" aria-label="Dismiss"
                  onClick={() => drop(n.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
          </button>
          <span className="toast__bar" />
        </div>
      ))}
    </div>
  )
}

/** The list under the bell. Fed by the same rows the boxes came from. */
export function NotiList({ notes, onRead }: { notes: Note[]; onRead: () => void }) {
  if (notes.length === 0) {
    return (
      <div className="nempty">
        Nothing waiting. A notification is the small set that names you and that you
        haven&rsquo;t seen — everything else is the Activity Log&rsquo;s job.
      </div>
    )
  }
  return (
    <>
      <div className="nbody">
        {notes.map((n) => (
          <Link className={`nrow2${n.read_at ? '' : ' is-new'}`} key={n.id} href={n.href as any}>
            <span className="nrow2__i">{I(MARK[n.kind] ?? MARK.mention)}</span>
            <span className="nrow2__t">
              <b>{n.title}</b>
              {n.body && <span>{n.body}</span>}
              <em>{ago(n.at)}</em>
            </span>
            {!n.read_at && <span className="nrow2__d" aria-label="Unread" />}
          </Link>
        ))}
      </div>
      <p className="nfoot">Only what names you. Everything else is the Activity Log&rsquo;s job.</p>
    </>
  )
}
