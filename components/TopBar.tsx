'use client'
import { useEffect, useRef, useState } from 'react'
import { useScope } from '@/components/useScope'

type Entity = { id: string; name: string; parent_id: string | null }

export default function TopBar(
  { initials, entities, personId, displayName, accountName, email }:
  { initials: string; entities: Entity[]
    personId: string | null; displayName: string; accountName: string
    email: string | null },
) {
  const [open, setOpen] = useState<'scope' | 'noti' | 'me' | null>(null)
  // The choice lives outside this component now. It used to be local state
  // holding a NAME, which is why the switcher moved and nothing happened: no
  // page could see it, and a name is not something you can filter rows by.
  const { scope, setScope, applies } = useScope()
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
  // A stored id whose organization has since gone, or was never this account's,
  // reads as "all" rather than as a name the bar cannot produce.
  const here = entities.find((e) => e.id === scope.id) ?? null

  /** An organization and everything under it, however deep it goes. */
  const withKids = (id: string) => {
    const out: string[] = []
    const walk = (n: string) => {
      out.push(n)
      for (const k of entities.filter((e) => e.parent_id === n)) walk(k.id)
    }
    walk(id)
    return out
  }
  const choose = (id: string) => { setScope({ id, ids: withKids(id) }); setOpen(null) }

  // The tree can change under a stored choice -- a new depot, a business moved
  // beneath another. Re-resolving on mount is what stops yesterday's answer
  // from quietly leaving today's subsidiary out of its own parent.
  useEffect(() => {
    if (!scope.id) return
    if (!entities.some((e) => e.id === scope.id)) { setScope({ id: null, ids: [] }); return }
    const now = withKids(scope.id)
    if (now.length !== scope.ids.length || now.some((i) => !scope.ids.includes(i))) {
      setScope({ id: scope.id, ids: now })
    }
  }, [scope.id, entities])

  return (
    <header className="tbar" ref={wrap}>
      <span className="mark mark--sm">hopper<span className="pd">.</span></span>

      {/* On a page with no organization dimension the switcher is not rendered
          at all. Leaving it visible and inert is the bug this replaced, only
          quieter -- it would still teach you the page was scoped when nothing
          about it was. */}
      {applies && (
      <div className="scopew">
        <button className="scope" type="button" aria-expanded={open === 'scope'}
                onClick={(e) => { e.stopPropagation(); setOpen(open === 'scope' ? null : 'scope') }}>
          <span className="scope__t">{here?.name ?? 'All organizations'}</span>
          <svg className="car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open === 'scope' && (
          <div className="scopepop">
            <button className={`orow${scope.id === null ? ' is-on' : ''}`} type="button"
                    onClick={() => { setScope({ id: null, ids: [] }); setOpen(null) }}>
              All organizations
            </button>
            {roots.map((r) => (
              <div key={r.id}>
                <button className={`orow${scope.id === r.id ? ' is-on' : ''}`} type="button"
                        onClick={() => choose(r.id)}>{r.name}</button>
                {kidsOf(r.id).map((k) => (
                  <button key={k.id} className={`orow orow--kid${scope.id === k.id ? ' is-on' : ''}`}
                          type="button" onClick={() => choose(k.id)}>
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
      )}

      <span className="tbar__sp" />
      <div className="tbar__act">
        {/* The popover hangs off the bell that raised it, the same way every
            other popover in the product hangs off its own control. It used to
            be a sibling of the whole bar with a hard-coded top and right, and
            since neither the bar nor the container is positioned it was
            measuring from the page -- which is why it landed beside the bell
            rather than under it. */}
        {/* The heart sits with the bell because both are yours rather than the
            page's: one is what wants you, the other is what you wanted. */}
        <a className="ibtn" href="/favorites" aria-label="Your favorites" title="Favorites">
          <svg viewBox="0 0 24 24">
            <path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z" />
          </svg>
        </a>

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
        {/* The avatar is a menu, not a button that logs you out.
            It was a bare submit -- one stray click on your own face and you
            were on the sign-in page, which is a trap rather than a control.
            A destructive action should never be the whole of a target you are
            invited to click, and it should never be the only thing behind it. */}
        <span className="avaw">
          <button className="avatar" type="button" aria-label="You"
                  aria-haspopup="menu" aria-expanded={open === 'me'}
                  onClick={(e) => { e.stopPropagation(); setOpen(open === 'me' ? null : 'me') }}>
            {initials}
          </button>

          {open === 'me' && (
            <div className="mepop" role="menu">
              {/* Who you are signed in as, by email. It is the one fact that
                  settles "am I in the right account" and it is the reason the
                  menu opens with it rather than with a row you can click. */}
              <p className="mehead">
                <span className="avatar avatar--lg" aria-hidden="true">{initials}</span>
                <span className="mewho">
                  <b>{displayName}</b>
                  <small>{email ?? accountName}</small>
                </span>
              </p>

              {personId && (
                <a className="mrow" role="menuitem" href={`/people/${personId}`}>
                  <svg className="meic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                  </svg>
                  <span><b>Profile</b><em>Your details, your photo, and what people see</em></span>
                </a>
              )}

              {/* Second, not third. "Why can't I see that report" is a question
                  people ask about themselves, and the screen that answers it
                  about somebody else is one only an administrator can open --
                  exactly the wrong shape. */}
              <a className="mrow" role="menuitem" href="/people/me/access">
                <svg className="meic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.6" />
                  <path d="M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9" />
                </svg>
                <span><b>What you may do</b><em>Which organizations you can open, and what you hold</em></span>
              </a>

              {/* A button, not a link: signing out changes something, and a
                  thing that changes something is not a place you can go. */}
              <form action="/auth/sign-out" method="post">
                <button className="mrow mrow--out" role="menuitem" type="submit">
                  <svg className="meic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2" />
                    <path d="M19 12H9" /><path d="m16 8 4 4-4 4" />
                  </svg>
                  <span><b>Sign out</b></span>
                </button>
              </form>
            </div>
          )}
        </span>
      </div>
    </header>
  )
}
