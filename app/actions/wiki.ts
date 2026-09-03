'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'

export type Result = { ok: boolean; message: string }

async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId, me: session.personId ?? null }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null

/**
 * A URL somebody can read, and one that stays put.
 *
 * The slug is made from the title once, when the document is created. Renaming
 * a document later leaves the address alone on purpose: every link to it from
 * another document, an email or somebody's bookmarks would otherwise break the
 * moment a typo got fixed in the title.
 */
function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'document'
}

async function freeSlug(db: any, want: string) {
  for (let i = 0; i < 40; i++) {
    const slug = i === 0 ? want : `${want}-${i + 1}`
    const { data } = await db.schema('hopper').from('wiki_doc')
      .select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
  }
  return `${want}-${Date.now().toString(36)}`
}

/**
 * The editor's document, flattened.
 *
 * Postgres searches text, not a tree of nodes, so the words come out into their
 * own column. Walking the JSON rather than stripping tags out of rendered HTML
 * means the search index never contains a class name or an attribute.
 */
function textOf(node: any): string {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return node.text ?? ''
  const inner = Array.isArray(node.content) ? node.content.map(textOf).join(' ') : ''
  // A block is a sentence boundary; without this, "the gate" and "Keys" run
  // into "the gateKeys" and neither word is findable.
  return ['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'codeBlock']
    .includes(node.type) ? `${inner}\n` : inner
}

/** Documents this one names, so "links to this one" is a fact. */
function linksIn(node: any, out: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== 'object') return out
  for (const m of node.marks ?? []) {
    const href: string = m?.attrs?.href ?? ''
    const hit = /^\/wiki\/([a-z0-9-]+)/.exec(href)
    if (hit) out.add(hit[1])
  }
  for (const c of node.content ?? []) linksIn(c, out)
  return out
}

/** The first real sentence, when nobody wrote a summary. */
function summaryOf(text: string) {
  const line = text.split('\n').map((s) => s.trim()).find(Boolean) ?? ''
  return line.length > 220 ? `${line.slice(0, 217).trimEnd()}…` : line || null
}

async function writeTags(db: any, account: string, docId: string, tags: string[]) {
  const want = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20)
  const { data: had } = await db.schema('hopper').from('wiki_doc_tag')
    .select('tag').eq('doc_id', docId)
  const have = (had ?? []).map((r: any) => r.tag)
  const gone = have.filter((t: string) => !want.includes(t))
  const added = want.filter((t) => !have.includes(t))
  if (gone.length) {
    await db.schema('hopper').from('wiki_doc_tag').delete().eq('doc_id', docId).in('tag', gone)
  }
  if (added.length) {
    // account_id is not decoration: it is the column the policies read and the
    // only thing standing between two customers' handbooks.
    await db.schema('hopper').from('wiki_doc_tag')
      .insert(added.map((tag) => ({ account_id: account, doc_id: docId, tag })))
  }
}

async function writeLinks(db: any, account: string, docId: string, slugs: Set<string>) {
  await db.schema('hopper').from('wiki_doc_link').delete().eq('from_id', docId)
  if (!slugs.size) return
  const { data: found } = await db.schema('hopper').from('wiki_doc')
    .select('id').in('slug', [...slugs])
  const rows = (found ?? []).filter((r: any) => r.id !== docId)
    .map((r: any) => ({ account_id: account, from_id: docId, to_id: r.id }))
  if (rows.length) await db.schema('hopper').from('wiki_doc_link').insert(rows)
}

function bodyOf(form: FormData) {
  try { return JSON.parse(str(form, 'body') || '{}') } catch { return null }
}

export async function saveDoc(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account, me } = await ctx()
  const id = str(form, 'id')
  const title = str(form, 'title')
  if (!title) return { ok: false, message: 'A document needs a title.' }

  const body = bodyOf(form)
  if (!body) return { ok: false, message: 'The editor sent something Hopper could not read. Nothing was saved.' }

  const text = textOf(body).replace(/\n{2,}/g, '\n').trim()
  const tags = (str(form, 'tags') || '').split(',').map((t) => t.trim()).filter(Boolean)
  const publish = form.get('publish') === 'on' || str(form, 'intent') === 'publish'

  const row = {
    title,
    summary: nul(form, 'summary') ?? summaryOf(text),
    body, text,
    category_id: nul(form, 'category_id'),
    entity_id: nul(form, 'entity_id'),
    owner_id: nul(form, 'owner_id') ?? me,
    status: publish ? 'published' : 'draft',
    updated_at: new Date().toISOString(),
    updated_by: me,
  }

  let docId = id
  let slug = str(form, 'slug')

  if (id) {
    // A FOR ALL policy refuses by changing nothing and raising nothing, so the
    // row count is the only honest answer to "did that save?".
    const { data: hit, error } = await db.schema('hopper').from('wiki_doc')
      .update(row).eq('id', id).select('id, slug')
    if (error) return { ok: false, message: refused(error.message) }
    if (!hit?.length) {
      return { ok: false, message: 'That is not yours to edit. Writing documents is a permission of its own — ask an administrator for it.' }
    }
    slug = hit[0].slug
  } else {
    slug = await freeSlug(db, slugify(title))
    const { data: made, error } = await db.schema('hopper').from('wiki_doc')
      .insert({ ...row, account_id: account, slug, created_by: me,
                checked_at: publish ? new Date().toISOString() : null,
                checked_by: publish ? me : null })
      .select('id').single()
    if (error) return { ok: false, message: refused(error.message) }
    docId = made.id
  }

  await writeTags(db, account, docId, tags)
  await writeLinks(db, account, docId, linksIn(body))

  await logAudit(db, { account_id: account, kind: 'wiki', object: title, object_id: docId,
    summary: `${id ? 'Edited' : 'Wrote'} the document ${title}`,
    note: publish ? null : 'Saved as a draft.' })

  revalidatePath('/wiki')
  revalidatePath(`/wiki/${slug}`)
  if (!publish) return { ok: true, message: 'Saved as a draft. Nobody else can see it yet.' }

  /* Back to the record, not to a word about it: the document is the proof. */
  redirect(`/wiki/${slug}`)
}

/**
 * "I have read this and it is still true."
 *
 * The only thing that makes a handbook trustworthy is somebody putting their
 * name to a date, so this records who as well as when.
 */
export async function markChecked(id: string): Promise<Result> {
  const { db, account, me } = await ctx()
  const { data: hit, error } = await db.schema('hopper').from('wiki_doc')
    .update({ checked_at: new Date().toISOString(), checked_by: me })
    .eq('id', id).select('id, title, slug')
  if (error) return { ok: false, message: refused(error.message) }
  if (!hit?.length) return { ok: false, message: 'That is not yours to confirm.' }

  await logAudit(db, { account_id: account, kind: 'wiki', object: hit[0].title,
    object_id: id, summary: `Confirmed ${hit[0].title} is still right` })
  revalidatePath(`/wiki/${hit[0].slug}`)
  revalidatePath('/wiki')
  return { ok: true, message: 'Marked as checked.' }
}

export async function addCategory(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const name = str(form, 'name')
  if (!name) return { ok: false, message: 'A category needs a name.' }
  const { error } = await db.schema('hopper').from('wiki_category').insert({
    account_id: account, name, slug: slugify(name),
    blurb: nul(form, 'blurb'), mark: nul(form, 'mark'),
  })
  if (error) return { ok: false, message: refused(error.message) }
  revalidatePath('/wiki')
  return { ok: true, message: `${name} added.` }
}

function refused(message: string) {
  if (/row-level security|permission denied/i.test(message)) {
    return 'Hopper would not allow that. Writing documents is a permission of its own — ask an administrator for it.'
  }
  if (/duplicate key/i.test(message)) return 'There is already one of those.'
  return message
}
