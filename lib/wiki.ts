import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { checkState, initialsOf, CHECK_DUE_DAYS } from '@/lib/wiki-check'

export { checkState, initialsOf, CHECK_DUE_DAYS, CHECK_OLD_DAYS } from '@/lib/wiki-check'

export type Cat = { id: string; name: string; slug: string; blurb: string | null
                    mark: string | null; n: number }
export type DocRow = {
  id: string; title: string; slug: string; summary: string | null
  category: string | null; catSlug: string | null; entity: string | null
  owner: string | null; initials: string | null
  tags: string[]; status: string
  checkedAt: string | null; updatedAt: string
}

/**
 * Whether this person may write documents.
 *
 * Asked of the database, using the same predicate the policy uses, so the
 * screen can never offer a button the save would refuse. A copy of this
 * question in JavaScript would be a second place to be wrong.
 */
export async function mayAuthor(): Promise<boolean> {
  const session = await currentSession()
  if (!session) return false
  const db = supabaseServer()
  const { data } = await db.schema('hopper')
    .rpc('wiki_may_author', { acct: session.accountId })
  return data === true
}

const shape = (d: any, tags: Map<string, string[]>): DocRow => ({
  id: d.id, title: d.title, slug: d.slug, summary: d.summary,
  category: d.wiki_category?.name ?? null, catSlug: d.wiki_category?.slug ?? null,
  entity: d.entity?.name ?? null,
  owner: d.owner?.full_name ?? null, initials: initialsOf(d.owner?.full_name),
  tags: tags.get(d.id) ?? [], status: d.status,
  checkedAt: d.checked_at, updatedAt: d.updated_at,
})

const SELECT = `id, title, slug, summary, status, checked_at, updated_at, category_id,
  wiki_category(name, slug), entity:entity_id(name), owner:owner_id(full_name)`

async function tagsFor(db: any, ids: string[]) {
  const out = new Map<string, string[]>()
  if (!ids.length) return out
  const { data } = await db.schema('hopper').from('wiki_doc_tag')
    .select('doc_id, tag').in('doc_id', ids).order('tag')
  for (const r of data ?? []) out.set(r.doc_id, [...(out.get(r.doc_id) ?? []), r.tag])
  return out
}

/** Everything the wiki's front page needs, in one place. RLS has already
 *  narrowed all of it to what this person may see. */
export async function loadWikiHome() {
  const db = supabaseServer()
  const [{ data: cats }, { data: counts }, { data: recent }, { data: stale }, { data: tags }] =
    await Promise.all([
      db.schema('hopper').from('wiki_category').select('*').order('sort_order').order('name'),
      db.schema('hopper').from('wiki_doc').select('category_id').eq('status', 'published'),
      db.schema('hopper').from('wiki_doc').select(SELECT)
        .eq('status', 'published').order('updated_at', { ascending: false }).limit(5),
      // Never checked counts as stale: a document nobody has ever confirmed is
      // the same risk as one confirmed in 2019.
      db.schema('hopper').from('wiki_doc').select(SELECT)
        .eq('status', 'published')
        .or(`checked_at.is.null,checked_at.lt.${
          new Date(Date.now() - CHECK_DUE_DAYS * 86400000).toISOString()}`)
        .order('checked_at', { ascending: true, nullsFirst: true }).limit(5),
      db.schema('hopper').from('wiki_doc_tag').select('tag'),
    ])

  const n = new Map<string, number>()
  for (const r of counts ?? []) if (r.category_id) n.set(r.category_id, (n.get(r.category_id) ?? 0) + 1)

  const ids = [...(recent ?? []), ...(stale ?? [])].map((d: any) => d.id)
  const t = await tagsFor(db, ids)

  // The tags people actually search for, commonest first -- an alphabetical
  // cloud puts "PPE" above "safety" and tells you nothing.
  const freq = new Map<string, number>()
  for (const r of tags ?? []) freq.set(r.tag, (freq.get(r.tag) ?? 0) + 1)

  return {
    categories: (cats ?? []).map((c: any): Cat => ({
      id: c.id, name: c.name, slug: c.slug, blurb: c.blurb, mark: c.mark,
      n: n.get(c.id) ?? 0 })),
    recent: (recent ?? []).map((d: any) => shape(d, t)),
    stale: (stale ?? []).map((d: any) => shape(d, t)),
    tags: [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18).map(([tag, count]) => ({ tag, count })),
    total: (counts ?? []).length,
  }
}

export async function loadDoc(slug: string) {
  const db = supabaseServer()
  const { data: d } = await db.schema('hopper').from('wiki_doc')
    .select(`${SELECT}, body, text, entity_id, owner_id,
             checker:checked_by(full_name)`)
    .eq('slug', slug).maybeSingle()
  if (!d) return null

  const [t, { data: related }] = await Promise.all([
    tagsFor(db, [d.id]),
    db.schema('hopper').rpc('wiki_related', { doc: d.id, lim: 4 }),
  ])
  return {
    doc: { ...shape(d, t), body: (d as any).body, entityId: (d as any).entity_id,
           ownerId: (d as any).owner_id },
    related: (related ?? []) as { id: string; title: string; slug: string
                                  summary: string | null; why: string }[],
  }
}

export async function loadForEdit(slug: string) {
  const db = supabaseServer()
  const { data: d } = await db.schema('hopper').from('wiki_doc')
    .select('id, title, slug, summary, body, status, category_id, entity_id, owner_id')
    .eq('slug', slug).maybeSingle()
  if (!d) return null
  const t = await tagsFor(db, [d.id])
  return { ...d, tags: t.get(d.id) ?? [] }
}

export async function loadPickers() {
  const db = supabaseServer()
  const [{ data: cats }, { data: ents }, { data: people }] = await Promise.all([
    db.schema('hopper').from('wiki_category').select('id, name').order('sort_order').order('name'),
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('directory').select('id, full_name').eq('active', true),
  ])
  return { cats: cats ?? [], ents: ents ?? [], people: people ?? [] }
}
