'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { href: string; label: string; icon: JSX.Element; kids?: { href: string; label: string }[] }

const Elbow = () => (
  <svg className="lv" viewBox="0 0 14 14" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v6h6" /><path d="M7.5 5.5 10 8l-2.5 2.5" />
  </svg>
)
const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)

export const FRAME: Item[] = [
  { href: '/', label: 'Home', icon: I('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>') },
  { href: '/admin/organizations', label: 'Organizations',
    icon: I('<rect x="3" y="8" width="7" height="13"/><rect x="14" y="3" width="7" height="18"/>'),
    kids: [
      { href: '/admin/organizations/departments', label: 'Departments' },
      { href: '/admin/organizations/locations', label: 'Locations' },
    ] },
  { href: '/people', label: 'People',
    icon: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M17.5 20a6 6 0 0 0-2-4.5"/>') },
  { href: '/calendar', label: 'Calendar',
    icon: I('<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>') },
  { href: '/wiki', label: 'Wiki',
    icon: I('<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>'),
    kids: [{ href: '/wiki/links', label: 'Links' }] },
  { href: '/news', label: 'News',
    icon: I('<path d="M4 5h13v14H4z"/><path d="M17 9h3v8a2 2 0 0 1-3 2"/><path d="M7 9h7M7 13h7"/>') },
  { href: '/activity', label: 'Activity',
    icon: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>') },
]

export const MODULE_NAV: Record<string, Item> = {
  reporting: { href: '/reporting', label: 'Reporting',
    icon: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    kids: [
      { href: '/dashboards', label: 'Dashboards' },
      { href: '/reporting/categories', label: 'Categories' },
    ] },
  projects: { href: '/projects', label: 'Projects',
    icon: I('<path d="M4 6h16M4 12h16M4 18h9"/><circle cx="19.5" cy="18" r="1.6"/>') },
  staffing: { href: '/staffing', label: 'Staffing',
    icon: I('<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/><path d="M17 11h5M19.5 8.5v5"/>') },
  meetings: { href: '/meetings', label: 'Meetings',
    icon: I('<path d="M3 6h18v11H8l-5 4z"/><path d="M8 10h8M8 13h5"/>') },
}

export const TAIL: Item[] = [
  { href: '/support', label: 'Support',
    icon: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.3 2.5c-.6.2-.8.7-.8 1.3v.4"/><path d="M12 17.2v.1"/>') },
  { href: '/admin', label: 'Admin',
    icon: I('<path d="M12 3l7.5 3.4v5.2c0 4.3-3 7.6-7.5 9.4-4.5-1.8-7.5-5.1-7.5-9.4V6.4z"/>') },
]

function Group({ items, path, here }: { items: Item[]; path: string; here: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="nav">
      {items.map((it) => {
        const on = it.href === here
        if (!it.kids) return (
          <Link key={it.href} href={it.href as any} className={on ? 'on' : ''}
                aria-current={on ? 'page' : undefined}>{it.icon}{it.label}</Link>
        )
        // A submenu holding the current page opens itself. The old default of
        // closed meant landing on Locations lit the parent and hid the child --
        // the one item that was actually where you are.
        const holds = it.kids.some((k) => k.href === here)
        const isOpen = open[it.href] ?? (on || holds)
        return (
          <div key={it.href}>
            <div className="par" aria-expanded={isOpen}>
              <Link href={it.href as any} className={on ? 'on' : ''}
                    aria-current={on ? 'page' : undefined}>{it.icon}{it.label}</Link>
              <button className="navcar" type="button"
                aria-label={`${isOpen ? 'Hide' : 'Show'} what's under ${it.label}`}
                onClick={() => setOpen({ ...open, [it.href]: !isOpen })}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                     strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>
            <div className="kids">
              {it.kids.map((k) => (
                <Link key={k.href} href={k.href as any} className={k.href === here ? 'on' : ''}
                      aria-current={k.href === here ? 'page' : undefined}>
                  <Elbow />{k.label}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Which one entry is the current page.
 *
 * `startsWith` lit every ancestor at once: on /admin/organizations/locations
 * both Organizations and Admin claimed to be where you are, which is three
 * highlights for one location. The longest matching href wins instead -- the
 * most specific answer is the true one -- and matching stops at a path
 * boundary, so /admin/organizations never claims /admin/organizations-archive.
 */
function currentHref(path: string, items: Item[]) {
  const holds = (href: string) =>
    href === '/' ? path === '/' : path === href || path.startsWith(href + '/')
  const all = items.flatMap((i) => [i.href, ...(i.kids ?? []).map((k) => k.href)])
  return all.filter(holds).sort((a, b) => b.length - a.length)[0] ?? '/'
}

export default function Rail({ modules }: { modules: string[] }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const mods = modules.map((m) => MODULE_NAV[m]).filter(Boolean)
  const items = [...FRAME, ...mods, ...TAIL]
  const here = currentHref(path, items)
  const label = items.flatMap((i) => [i, ...(i.kids ?? [])])
    .find((i) => i.href === here)?.label ?? 'Home'

  return (
    <>
      <button className="menubtn" type="button" aria-expanded={open} aria-controls="rail"
              onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        Menu <span className="cur">· {label}</span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      <nav className={`rail${open ? ' open' : ''}`} id="rail" aria-label="Main"
           onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false) }}>
        <p className="rail__lbl">The frame</p>
        <Group items={FRAME} path={path} here={here} />
        {/* A module that is off is absent, not greyed out. */}
        {mods.length > 0 && <>
          <p className="rail__lbl">Modules</p>
          <Group items={mods} path={path} here={here} />
        </>}
        <div className="rail__cut" />
        <Group items={TAIL} path={path} here={here} />
      </nav>
    </>
  )
}
