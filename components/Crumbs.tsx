'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Entity = { id: string; name: string; parent_id: string | null }
type Named = { id: string; name: string }
type Crumb = { href: string; label: string }

/** Everything that isn't an organization id. */
const NAMES: Record<string, string> = {
  admin: 'Admin',
  organizations: 'Organizations',
  departments: 'Departments',
  locations: 'Locations',
  people: 'People',
  permissions: 'Permissions',
  modules: 'Modules',
  audit: 'Activity Log',
  calendar: 'Calendar',
  wiki: 'Wiki',
  links: 'Links',
  news: 'News',
  reporting: 'Reporting',
  projects: 'Projects',
  meetings: 'Meetings',
  support: 'Support',
  profile: 'Profile',
}

export default function Crumbs(
  { entities, places = [] }: { entities: Entity[]; places?: Named[] },
) {
  const path = usePathname()
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return null          // Home needs no trail to itself

  const byId = new Map(entities.map((e) => [e.id, e]))
  const placeById = new Map(places.map((p) => [p.id, p]))
  const crumbs: Crumb[] = []
  let href = ''

  for (const part of parts) {
    href += '/' + part
    const org = byId.get(part)
    if (org) {
      // An organization brings its ancestors with it, so the trail tells you
      // where in the portfolio you are and not merely which page you opened.
      const line: Entity[] = []
      for (let cur: Entity | undefined = org; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
        line.unshift(cur)
      }
      line.forEach((e) => crumbs.push({ href: `/admin/organizations/${e.id}`, label: e.name }))
      continue
    }
    const place = placeById.get(part)
    if (place) { crumbs.push({ href, label: place.name }); continue }

    // An id we cannot name is a page we should not pretend to label. Drop the
    // crumb rather than printing a uuid at somebody.
    if (/^[0-9a-f-]{36}$/i.test(part)) continue

    crumbs.push({ href, label: NAMES[part] ?? part.replace(/-/g, ' ') })
  }

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link href="/" className="crumbs__home" aria-label="Home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
        </svg>
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href + i} className="crumbs__step">
          <span className="crumbs__sep" aria-hidden="true">/</span>
          {i === crumbs.length - 1
            ? <span aria-current="page">{c.label}</span>
            : <Link href={c.href as any}>{c.label}</Link>}
        </span>
      ))}
    </nav>
  )
}
