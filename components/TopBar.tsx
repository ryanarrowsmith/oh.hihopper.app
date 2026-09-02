'use client'
import { useEffect, useRef, useState } from 'react'

type Entity = { id: string; name: string; parent_id: string | null }

export default function TopBar({ initials, entities }: { initials: string; entities: Entity[] }) {
  const [open, setOpen] = useState<'scope' | 'noti' | null>(null)
  const [scope, setScope] = useState('All organizations')
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('click', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', esc) }
  }, [])

  const roots = entities.filter((e) => !e.parent_id)
  const kidsOf = (id: string) => entities.filter((e) => e.parent_id === id)

  return (
    <header className="tbar" ref={wrap}>
      <span className="mark mark--sm">hopper<span className="pd">.</span></span>

      <div className="scopew">
        <button className="scope" type="button" aria-expanded={open === 'scope'}
                onClick={(e) => { e.stopPropagation(); setOpen(open === 'scope' ? null : 'scope') }}>
          <span className="scope__t">{scope}</span>
          <svg className="car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open === 'scope' && (
          <div className="scopepop">
            <button className={`orow${scope === 'All organizations' ? ' is-on' : ''}`} type="button"
                    onClick={() => { setScope('All organizations'); setOpen(null) }}>
              All organizations
            </button>
            {roots.map((r) => (
              <div key={r.id}>
                <button className={`orow${scope === r.name ? ' is-on' : ''}`} type="button"
                        onClick={() => { setScope(r.name); setOpen(null) }}>{r.name}</button>
                {kidsOf(r.id).map((k) => (
                  <button key={k.id} className={`orow orow--kid${scope === k.name ? ' is-on' : ''}`}
                          type="button" onClick={() => { setScope(k.name); setOpen(null) }}>
                    <svg className="olv" viewBox="0 0 14 14" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 2v6h6" /><path d="M7.5 5.5 10 8l-2.5 2.5" />
                    </svg>{k.name}
                  </button>
                ))}
              </div>
            ))}
            <a className="orow orow--foot" href="/admin/organizations">Manage organizations</a>
          </div>
        )}
      </div>

      <span className="tbar__sp" />
      <div className="tbar__act">
        {/* The popover hangs off the bell that raised it, the same way every
            other popover in the product hangs off its own control. It used to
            be a sibling of the whole bar with a hard-coded top and right, and
            since neither the bar nor the container is positioned it was
            measuring from the page -- which is why it landed beside the bell
            rather than under it. */}
        <span className="bellw">
          <button className="ibtn is-lit" type="button" aria-label="Notifications"
                  aria-expanded={open === 'noti'} aria-haspopup="dialog"
                  onClick={(e) => { e.stopPropagation(); setOpen(open === 'noti' ? null : 'noti') }}>
            <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          </button>

          {open === 'noti' && (
            <div className="notipop" role="dialog" aria-label="Notifications">
              <p className="nhead">Notifications <em>all read</em></p>
              <div className="empty" style={{ border: 0, background: 'transparent',
                color: 'rgba(251,249,245,.55)' }}>
                Nothing waiting. A notification is the small set that names you and that
                you haven&rsquo;t seen — everything else is the Activity Log&rsquo;s job.
              </div>
            </div>
          )}
        </span>
        <form action="/auth/sign-out" method="post">
          <button className="avatar" type="submit" title="Sign out">{initials}</button>
        </form>
      </div>
    </header>
  )
}
