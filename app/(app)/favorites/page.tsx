import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import FavoriteList, { type Fav } from '@/components/FavoriteList'

export const dynamic = 'force-dynamic'

/**
 * The things you hearted.
 *
 * hopper.my_favorites is already scoped to the person by policy, so there is
 * no person_id here and no way to read anybody else's. What it stores is only
 * a kind and an id; the names are looked up alongside, and anything that comes
 * back nameless has been deleted or put out of this reader's reach since it
 * was hearted. Those are dropped rather than drawn as a broken row -- a
 * favourite is a shortcut, and a shortcut to nowhere is worse than one fewer
 * shortcut.
 *
 * Newest first, and the grouping happens on the client with chips. The order
 * you hearted things in is a better guess at what you want than which kind of
 * thing it was.
 */
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

  const named = (kind: string, id: string): Fav | null => {
    if (kind === 'report') {
      const r = (reports ?? []).find((x: any) => x.report_id === id)
      return r ? { kind: 'report', id, label: r.name,
                    sub: entName.get(r.entity_id) ?? null, href: `/reporting/${id}` } : null
    }
    if (kind === 'entity') {
      const e = (ents ?? []).find((x: any) => x.id === id)
      return e ? { kind: 'entity', id, label: e.name,
                    sub: e.parent_id ? (entName.get(e.parent_id) ?? null) : null,
                    href: `/admin/organizations/${id}` } : null
    }
    if (kind === 'person') {
      const p = (people ?? []).find((x: any) => x.id === id)
      return p ? { kind: 'person', id, label: p.full_name,
                    sub: p.role_name ?? p.entity_name ?? null, href: `/people/${id}` } : null
    }
    if (kind === 'location') {
      const l = (places ?? []).find((x: any) => x.id === id)
      return l ? { kind: 'location', id, label: l.name,
                    sub: entName.get(l.entity_id) ?? null,
                    href: `/admin/organizations/${l.entity_id}/locations/${l.id}` } : null
    }
    return null
  }

  const items = (hearts ?? [])
    .map((h: any) => named(h.object, h.object_id))
    .filter(Boolean) as Fav[]

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Favorites</h1>
        <p className="scopeline"><span>
          {items.length === 0
            ? 'Nothing hearted yet.'
            : `${items.length} thing${items.length === 1 ? '' : 's'} you keep coming back to. Yours alone — nobody else can see this.`}
        </span></p>
      </div></div>

      <FavoriteList items={items} />
    </>
  )
}
