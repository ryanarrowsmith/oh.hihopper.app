import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * News — what the business has told everybody, kept.
 *
 * An announcement is a document. The archive is every one ever posted: coming
 * off the banner is not being removed, and one that no longer applies is
 * retired rather than erased, because somebody will ask about it.
 */

export type PostItem = {
  id: string; kind: 'file' | 'link'; label: string
  url: string | null
  file: { name: string; bytes: number; mime: string | null } | null
}

export type Post = {
  id: string; title: string; postedOn: string
  body: any; text: string
  entity: string | null; entityId: string
  department: string | null; departmentId: string | null
  category: string | null; categoryId: string | null; mark: string
  tags: string[]
  banner: boolean; bannerDays: number; comesOff: string | null; daysLeft: number | null
  status: 'draft' | 'posted' | 'retired'
  author: string | null
  items: PostItem[]
  mayEdit: boolean
}

export type Banner = {
  id: string; title: string; lede: string; mark: string
  category: string | null; entity: string | null; department: string | null
  daysLeft: number; comesOff: string
}

const SELECT_POST =
  'id, title, posted_on, body, text, entity_id, department_id, category_id, tags,'
  + ' banner, banner_days, status, created_by, created_at'

/** An id no row has, so `neq` means "every row you are allowed to touch". */
const NOBODY = '00000000-0000-0000-0000-000000000000'

const itemOf = (r: any): PostItem => ({
  id: r.id, kind: r.kind, label: r.label, url: r.url ?? null,
  file: r.file_path
    ? { name: r.file_name, bytes: Number(r.file_bytes ?? 0), mime: r.file_mime ?? null }
    : null,
})

/**
 * What is on the banner, for this person, right now.
 *
 * The view does the arithmetic and the hiding; nothing here re-derives either,
 * so the home page cannot disagree with the News page about what is running.
 */
export async function loadBanner(): Promise<Banner[]> {
  const db = supabaseServer()
  const [{ data: rows }, { data: cats }, { data: ents }, { data: deps }] = await Promise.all([
    db.schema('hopper').from('news_banner').select('*'),
    db.schema('hopper').from('news_category').select('id, name, mark'),
    db.schema('hopper').from('entity').select('id, name'),
    db.schema('hopper').from('department').select('id, name'),
  ])
  const cat = new Map((cats ?? []).map((c: any) => [c.id, c]))
  const ent = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const dep = new Map((deps ?? []).map((d: any) => [d.id, d.name]))

  return (rows ?? []).map((r: any): Banner => ({
    id: r.id, title: r.title, lede: r.lede ?? '',
    mark: cat.get(r.category_id)?.mark ?? 'notice',
    category: cat.get(r.category_id)?.name ?? null,
    entity: ent.get(r.entity_id) ?? null,
    department: r.department_id ? (dep.get(r.department_id) ?? null) : null,
    daysLeft: Number(r.days_left), comesOff: r.comes_off,
  }))
}

const shape = (
  p: any, ent: Map<string, string>, dep: Map<string, string>,
  cat: Map<string, any>, who: Map<string, string>,
  items: any[], mine: Set<string>, today: string,
): Post => {
  const comesOff = p.banner
    ? new Date(new Date(`${p.posted_on}T00:00:00`).getTime() + p.banner_days * 86_400_000)
        .toISOString().slice(0, 10)
    : null
  return {
    id: p.id, title: p.title, postedOn: p.posted_on, body: p.body, text: p.text ?? '',
    entity: ent.get(p.entity_id) ?? null, entityId: p.entity_id,
    department: p.department_id ? (dep.get(p.department_id) ?? null) : null,
    departmentId: p.department_id ?? null,
    category: cat.get(p.category_id)?.name ?? null, categoryId: p.category_id ?? null,
    mark: cat.get(p.category_id)?.mark ?? 'notice',
    tags: p.tags ?? [],
    banner: p.banner, bannerDays: p.banner_days, comesOff,
    daysLeft: comesOff
      ? Math.round((new Date(`${comesOff}T00:00:00`).getTime()
                    - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
      : null,
    status: p.status,
    author: who.get(p.created_by) ?? null,
    items: items.filter((i: any) => i.post_id === p.id)
      .sort((a: any, b: any) => a.sort_order - b.sort_order).map(itemOf),
    mayEdit: mine.has(p.id),
  }
}

const todayIn = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())

/** Everything you can read, newest first. RLS is what scopes it. */
export async function loadNews(): Promise<Post[]> {
  const db = supabaseServer()
  const [{ data: posts }, { data: items }, { data: cats }, { data: ents },
         { data: deps }, { data: people }, { data: runs }] =
    await Promise.all([
      db.schema('hopper').from('post').select(SELECT_POST).order('posted_on', { ascending: false }),
      db.schema('hopper').from('post_item').select('*'),
      db.schema('hopper').from('news_category').select('id, name, mark'),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('department').select('id, name'),
      db.schema('hopper').from('directory').select('id, full_name'),
      // Which of them this person may change, answered by the policy itself: a
      // no-op update returns only the rows it was allowed to touch.
      db.schema('hopper').from('post')
        .update({ updated_at: new Date().toISOString() }).neq('id', NOBODY).select('id'),
    ])

  const ent = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const dep = new Map((deps ?? []).map((d: any) => [d.id, d.name]))
  const cat = new Map((cats ?? []).map((c: any) => [c.id, c]))
  const who = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))
  const mine = new Set((runs ?? []).map((r: any) => r.id))
  const today = todayIn()

  return (posts ?? []).map((p: any) =>
    shape(p, ent, dep, cat, who, items ?? [], mine, today))
}

/** One announcement, with what is attached to it. */
export async function loadPost(id: string): Promise<Post | null> {
  const db = supabaseServer()
  const [{ data: p }, { data: items }, { data: cats }, { data: ents },
         { data: deps }, { data: people }, { data: mineRows }] =
    await Promise.all([
      db.schema('hopper').from('post').select(SELECT_POST).eq('id', id).maybeSingle(),
      db.schema('hopper').from('post_item').select('*').eq('post_id', id),
      db.schema('hopper').from('news_category').select('id, name, mark'),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('department').select('id, name'),
      db.schema('hopper').from('directory').select('id, full_name'),
      db.schema('hopper').from('post')
        .update({ updated_at: new Date().toISOString() }).eq('id', id).select('id'),
    ])
  if (!p) return null

  return shape(p,
    new Map((ents ?? []).map((e: any) => [e.id, e.name])),
    new Map((deps ?? []).map((d: any) => [d.id, d.name])),
    new Map((cats ?? []).map((c: any) => [c.id, c])),
    new Map((people ?? []).map((x: any) => [x.id, x.full_name])),
    items ?? [], new Set((mineRows ?? []).map((r: any) => r.id)), todayIn())
}

/** The lists a composer needs to fill its pickers. RLS scopes every one. */
export async function loadWriteBits() {
  const db = supabaseServer()
  const [{ data: ents }, { data: deps }, { data: cats }] = await Promise.all([
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('department').select('id, name, entity_id').order('name'),
    db.schema('hopper').from('news_category').select('id, name, mark')
      .eq('active', true).order('sort_order').order('name'),
  ])
  return { orgs: ents ?? [], departments: deps ?? [], categories: cats ?? [] }
}
