import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

/** One hearted thing, already named. */
export type Fav = {
  kind: 'report' | 'entity' | 'person' | 'location'
  id: string
  label: string
  sub: string | null
  href: string
}

/**
 * Everything you hearted, newest first, with a name on it.
 *
 * A heart is a kind and an id and nothing else -- what it is CALLED lives in
 * four different tables. Resolving that was written out on the favorites page,
 * and the moment the top bar wanted the same list the choice was to write it a
 * second time or to move it here. A second copy of "what is this thing called"
 * is a second answer waiting to disagree with the first.
 *
 * hopper.my_favorites is scoped to the person by policy, so there is no
 * person_id in here and no way to ask for somebody else's.
 */
export async function loadFavorites(limit?: number): Promise<Fav[]> {
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

  // Filtered AFTER naming, not before: a heart whose thing has since been
  // deleted -- or which this person can no longer open, because RLS simply did
  // not return it above -- resolves to nothing and drops out. Slicing first
  // would let those eat the places in the list.
  const all = (hearts ?? []).map((h: any) => named(h.object, h.object_id)).filter(Boolean) as Fav[]
  return limit ? all.slice(0, limit) : all
}
