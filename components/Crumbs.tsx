'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCrumbTail } from '@/components/CrumbTail'

type Entity = { id: string; name: string; parent_id: string | null }
type Named = { id: string; name: string }
type Crumb = { href: string | null; label: string }

/** Everything that isn't an organization id. */
const NAMES: Record<string, string> = {
  admin: 'Admin',
  organizations: 'Organizations',
  departments: 'Departments',
  locations: 'Locations',
  users: 'Users',
  people: 'People',
  staffing: 'Staffing',
  permissions: 'Permissions',
  modules: 'Modules',
  activity: 'Activity',
  calendar: 'Calendar',
  wiki: 'Wiki',
  links: 'Links',
  news: 'News',
  reporting: 'Reporting',
  todo: 'To Do',
  meetings: 'Meetings',
  support: 'Support',
  profile: 'Profile',
  favorites: 'Favorites',
  dashboards: 'Dashboards',
  me: 'You',
  access: 'What you may do',
}

/**
 * Segments that DO have an index page of their own beneath a record --
 * /admin/organizations/<org>/locations lists that organization's offices.
 * Everything else sitting directly after an id is a container in the URL and
 * gets printed rather than linked, because there is no page there to reach.
 *
 * This is a small list rather than a copy of the route table, and it has to be
 * added to when such a page is built. The alternative -- guessing from the
 * shape of the path alone -- is what sent people to a 404 in the first place,
 * and then, once the page existed, refused to link the one crumb that worked.
 */
const INDEXED_UNDER_RECORD = new Set(['locations'])

/** Words in a path that no page sits at. /people/me is one -- it exists only
 *  so /people/me/access has somewhere to hang. */
const NO_PAGE = new Set(['me'])

export default function Crumbs(
  { entities, places = [] }: { entities: Entity[]; places?: Named[] },
) {
  const path = usePathname()
  const tail = useCrumbTail()
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return null          // Home needs no trail to itself

  const byId = new Map(entities.map((e) => [e.id, e]))
  const placeById = new Map(places.map((p) => [p.id, p]))
  const crumbs: Crumb[] = []
  let href = ''
  // A word sitting directly after a record's id is a container in the URL, not
  // a page: /admin/organizations/<org>/locations/<place> has no Locations page
  // between the two, and linking it sent people to a 404. It still belongs in
  // the trail -- it says where you are -- so it is printed rather than linked.
  // Derived from the shape of the path rather than from a second copy of the
  // route table, which would be one more place to be wrong.
  let afterId = false

  for (const part of parts) {
    href += '/' + part
    const org = byId.get(part)
    if (org) {
      afterId = true
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
    if (place) { afterId = true; crumbs.push({ href, label: place.name }); continue }

    // An id we cannot name is a page we should not pretend to label. If the
    // page below has told us what it is looking at, that is the name; if it
    // has not, drop the crumb rather than printing a uuid at somebody.
    if (/^[0-9a-f-]{36}$/i.test(part)) {
      afterId = true
      if (part === parts[parts.length - 1] && tail) crumbs.push({ href: null, label: tail })
      continue
    }

    const container = NO_PAGE.has(part) || (afterId && !INDEXED_UNDER_RECORD.has(part))
    crumbs.push({ href: container ? null : href, label: NAMES[part] ?? part.replace(/-/g, ' ') })
    afterId = false
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
        <span key={`${c.href ?? c.label}-${i}`} className="crumbs__step">
          <span className="crumbs__sep" aria-hidden="true">/</span>
          {i === crumbs.length - 1
            ? <span aria-current="page">{c.label}</span>
            : c.href
              ? <Link href={c.href as any}>{c.label}</Link>
              : <span className="crumbs__plain">{c.label}</span>}
        </span>
      ))}
    </nav>
  )
}
