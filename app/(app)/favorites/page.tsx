import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import { OrgMark, PlaceMark } from '@/components/Icons'
import Unheart from '@/components/Unheart'

export const dynamic = 'force-dynamic'

/**
 * The things you hearted.
 *
 * Not a page of its own kind of object -- a page of shortcuts, which is why it
 * groups by what a thing IS rather than showing one long list. A report and an
 * office are not comparable and pretending otherwise makes both harder to find.
 *
 * hopper.my_favorites is already scoped to the person by policy, so there is no
 * person_id here and no way to read anybody else's. What it stores is only a
 * kind and an id; the names are looked up alongside, and anything that comes
 * back nameless has been deleted or put out of this reader's reach since it was
 * hearted. Those are dropped rather than drawn as a broken row -- a favourite
 * is a shortcut, and a shortcut to nowhere is worse than one fewer shortcut.
 */
const KINDS = [
  { key: 'report',       title: 'Reports',       href: (id: string) => `/reporting/${id}` },
  { key: 'entity',       title: 'Organizations', href: (id: string) => `/admin/organizations/${id}` },
  { key: 'person',       title: 'People',        href: (id: string) => `/people/${id}` },
] as const

export default async function Favorites() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: hearts }, { data: reports }, { data: ents }, { data: people }, { data: places }] =
    await Promise.all([
      db.schema('hopper').from('my_favorites').select('object, object_id, created_at')
        .order('created_at', { ascending: false }),
      db.schema('hopper').from('report_state').select('report_id, name, entity_id'),
      db.schema('hopper').from('entity').select('id, name, parent_id'),
      db.schema('hopper').from('directory').select('id, full_name, role_name, entity_name'),
      db.schema('hopper').from('location').select('id, name, entity_id'),
    ])

  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const name = (kind: string, id: string): { label: string; sub: string | null } | null => {
    if (kind === 'report') {
      const r = (reports ?? []).find((x: any) => x.report_id === id)
      return r ? { label: r.name, sub: entName.get(r.entity_id) ?? null } : null
    }
    if (kind === 'entity') {
      const e = (ents ?? []).find((x: any) => x.id === id)
      return e ? { label: e.name, sub: e.parent_id ? (entName.get(e.parent_id) ?? null) : null } : null
    }
    if (kind === 'person') {
      const p = (people ?? []).find((x: any) => x.id === id)
      return p ? { label: p.full_name, sub: p.role_name ?? p.entity_name ?? null } : null
    }
    if (kind === 'location') {
      const l = (places ?? []).find((x: any) => x.id === id)
      return l ? { label: l.name, sub: entName.get(l.entity_id) ?? null } : null
    }
    return null
  }

  const rows = (hearts ?? [])
    .map((h: any) => ({ ...h, named: name(h.object, h.object_id) }))
    .filter((h) => h.named)

  const groups = KINDS
    .map((k) => ({ ...k, items: rows.filter((r) => r.object === k.key) }))
    .filter((g) => g.items.length > 0)

  // Offices hang off an organization, so their link needs its parent's id --
  // handled apart from the flat map above rather than by making that map
  // return two things.
  const offices = rows.filter((r) => r.object === 'location').map((r) => {
    const l = (places ?? []).find((x: any) => x.id === r.object_id)
    return { ...r, href: l ? `/admin/organizations/${l.entity_id}/locations/${l.id}` : null }
  }).filter((o) => o.href)

  const total = groups.reduce((n, g) => n + g.items.length, 0) + offices.length

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Favorites</h1>
        <p className="scopeline"><span>
          {total === 0
            ? 'Nothing hearted yet.'
            : `${total} thing${total === 1 ? '' : 's'} you keep coming back to. Yours alone — nobody else can see this.`}
        </span></p>
      </div></div>

      {total === 0 ? (
        <div className="empty">
          <p>
            The heart on a report, an organization or an office puts it here.
            It is the shortest way back to the six things you actually open.
          </p>
          <p><Link className="btn btn--amber" href="/reporting">Go and heart something</Link></p>
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <Section key={g.key} title={g.title}
                     blurb={`${g.items.length} ${g.items.length === 1 ? 'one' : 'of them'}.`}>
              <div className="favs">
                {g.items.map((it) => (
                  <div className="fav" key={`${it.object}-${it.object_id}`}>
                    <Link className="fav__go" href={g.href(it.object_id) as any}>
                      <span className="fav__n">{it.named!.label}</span>
                      {it.named!.sub && <span className="fav__w">{it.named!.sub}</span>}
                    </Link>
                    <Unheart object={it.object} objectId={it.object_id} />
                  </div>
                ))}
              </div>
            </Section>
          ))}

          {offices.length > 0 && (
            <Section title="Offices" blurb={`${offices.length} ${offices.length === 1 ? 'one' : 'of them'}.`}>
              <div className="favs">
                {offices.map((o) => (
                  <div className="fav" key={o.object_id}>
                    <Link className="fav__go" href={o.href as any}>
                      <span className="fav__n"><PlaceMark />{o.named!.label}</span>
                      {o.named!.sub && <span className="fav__w">{o.named!.sub}</span>}
                    </Link>
                    <Unheart object="location" objectId={o.object_id} />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </>
  )
}
