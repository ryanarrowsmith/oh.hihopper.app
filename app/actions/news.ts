'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null

async function ctx() {
  const s = await currentSession()
  if (!s) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: s.accountId, person: s.personId }
}

const touch = (id?: string) => {
  revalidatePath('/news'); revalidatePath('/')
  if (id) revalidatePath(`/news/${id}`)
}

/**
 * The body, flattened once.
 *
 * Search reads a column, never a tree: walking jsonb on every query is the same
 * work done again for every reader, and a tsvector cannot be built from a shape
 * nobody has flattened. Done here rather than in a trigger because the editor
 * already hands over the document and this is the only place it arrives.
 */
function flatten(doc: any): string {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (typeof n.text === 'string') out.push(n.text)
    for (const c of n.content ?? []) walk(c)
  }
  walk(doc)
  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, 20000)
}

const tagsOf = (f: FormData) =>
  str(f, 'tags').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8)

const bodyOf = (f: FormData) => {
  const raw = str(f, 'body')
  if (!raw) return { type: 'doc', content: [] }
  try { return JSON.parse(raw) } catch { return { type: 'doc', content: [] } }
}

const DAYS = (f: FormData) => {
  const n = Number(str(f, 'banner_days'))
  return Number.isFinite(n) ? Math.min(90, Math.max(1, Math.round(n))) : 7
}

/* ────────────────────────────────────────────────── writing an announcement */

export async function writePost(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = nul(form, 'id')
  const title = str(form, 'title')
  const entity_id = str(form, 'entity_id')
  if (!title) return { ok: false, message: 'It needs a title.' }
  if (!entity_id) return { ok: false, message: 'Choose who it is for.' }

  const doc = bodyOf(form)
  const row = {
    account_id: account, entity_id,
    department_id: nul(form, 'department_id'),
    category_id: nul(form, 'category_id'),
    title, posted_on: nul(form, 'posted_on') ?? new Date().toISOString().slice(0, 10),
    body: doc, text: flatten(doc),
    tags: tagsOf(form),
    banner: str(form, 'banner') === 'on',
    banner_days: DAYS(form),
    status: str(form, 'post') === 'on' ? 'posted' : 'draft',
    updated_by: person, updated_at: new Date().toISOString(),
  }

  if (id) {
    const { data: hit, error } = await db.schema('hopper').from('post')
      .update(row).eq('id', id).select('id')
    if (error) return { ok: false, message: error.message }
    // A policy on ALL refuses by changing no rows and saying nothing, so the
    // count is the only honest answer.
    if (!hit || hit.length === 0) {
      return { ok: false, message: 'Writing news is limited to the people who administer this organization.' }
    }
    await logAudit(db, { account_id: account, kind: 'news', object: title,
      object_id: id, summary: `Edited the announcement ${title}` })
    touch(id)
    redirect(`/news/${id}`)
  }

  const { data, error } = await db.schema('hopper').from('post')
    .insert({ ...row, created_by: person }).select('id').single()
  if (error) {
    return { ok: false, message: /policy|row-level/i.test(error.message)
      ? 'Writing news is limited to the people who administer this organization.'
      : error.message }
  }
  await logAudit(db, { account_id: account, kind: 'news', object: title,
    object_id: data.id, summary: `Wrote the announcement ${title}` })
  touch(data.id)
  redirect(`/news/${data.id}`)
}

/** Posted, back to a draft, or retired. Nothing is deleted. */
export async function setPostStatus(id: string, status: string): Promise<Result> {
  const { db, account } = await ctx()
  if (!['draft', 'posted', 'retired'].includes(status)) {
    return { ok: false, message: 'Hopper has no such state.' }
  }
  const { data: was } = await db.schema('hopper').from('post')
    .select('title').eq('id', id).maybeSingle()
  const { data: hit, error } = await db.schema('hopper').from('post')
    .update({ status }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'That is not yours to change.' }
  }
  await logAudit(db, { account_id: account, kind: 'news', object: was?.title ?? 'an announcement',
    object_id: id, summary: `${was?.title ?? 'An announcement'} is ${status}` })
  touch(id)
  return { ok: true, message: status === 'posted' ? 'Posted.' : status === 'retired' ? 'Retired.' : 'Back to a draft.' }
}

/** On the banner, or off it, and for how long. */
export async function setBanner(id: string, on: boolean, days?: number): Promise<Result> {
  const { db } = await ctx()
  const patch: Record<string, unknown> = { banner: on }
  if (days != null) patch.banner_days = Math.min(90, Math.max(1, Math.round(days)))
  const { data: hit, error } = await db.schema('hopper').from('post')
    .update(patch).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) return { ok: false, message: 'That is not yours to change.' }
  touch(id)
  return { ok: true, message: on ? 'On the banner.' : 'Off the banner.' }
}

/**
 * Somebody pressed the x.
 *
 * It hides that banner for that person until it retires on its own. It does not
 * retire it for anybody else and it does not touch the announcement -- which
 * also means you cannot be sure everybody saw it, and that is the honest cost
 * of letting people clear their own screen.
 */
export async function hideBanner(id: string): Promise<Result> {
  const { db, account, person } = await ctx()
  if (!person) return { ok: false, message: 'Not signed in.' }
  const { error } = await db.schema('hopper').from('post_hidden')
    .upsert({ account_id: account, post_id: id, person_id: person },
            { onConflict: 'post_id,person_id' })
  if (error) return { ok: false, message: error.message }
  revalidatePath('/'); revalidatePath('/news')
  return { ok: true, message: 'Hidden.' }
}

/* ─────────────────────────────────────────────────── what is attached to it */

export async function addLink(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const post_id = str(form, 'post_id')
  const label = str(form, 'label')
  let url = str(form, 'url')
  if (!post_id || !label || !url) return { ok: false, message: 'A link needs a name and an address.' }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try { new URL(url) } catch { return { ok: false, message: 'That is not an address Hopper can open.' } }

  const { data: hit, error } = await db.schema('hopper').from('post_item')
    .insert({ account_id: account, post_id, kind: 'link', label, url, added_by: person })
    .select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) return { ok: false, message: 'That is not yours to add to.' }
  touch(post_id)
  return { ok: true, message: 'Added.' }
}

/**
 * A file on an announcement.
 *
 * The bucket is private and the browser never talks to it: this puts the bytes
 * there with the signed-in person's own session, so the storage policy decides,
 * and the row that records it is what every screen reads.
 */
export async function addFile(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const post_id = str(form, 'post_id')
  const file = form.get('file')
  if (!post_id) return { ok: false, message: 'Which announcement?' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a file first.' }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, message: 'That one is over 20 MB. Put it somewhere and add a link to it instead.' }
  }

  // The name a person sees and the name on disk are different things: the first
  // can hold anything, and the second has to be safe to put in a URL.
  const dot = file.name.lastIndexOf('.')
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const path = `${account}/${post_id}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`

  const up = await db.storage.from('news-files')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (up.error) {
    return { ok: false, message: /policy|row-level/i.test(up.error.message)
      ? 'Attaching a file is limited to the people who administer this organization.'
      : up.error.message }
  }

  const { error } = await db.schema('hopper').from('post_item').insert({
    account_id: account, post_id, kind: 'file', added_by: person,
    label: file.name.slice(0, 200),
    file_path: path, file_name: file.name.slice(0, 200),
    file_bytes: file.size, file_mime: file.type || null,
  })
  if (error) return { ok: false, message: error.message }
  touch(post_id)
  return { ok: true, message: 'Attached.' }
}

/* ───────────────────────────────────────────────────────────── categories */

export async function saveCategory(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = nul(form, 'id')
  const name = str(form, 'name')
  const mark = str(form, 'mark') || 'notice'
  if (!name) return { ok: false, message: 'It needs a name.' }

  const q = id
    ? db.schema('hopper').from('news_category').update({ name, mark }).eq('id', id).select('id')
    : db.schema('hopper').from('news_category')
        .insert({ account_id: account, name, mark }).select('id')
  const { data: hit, error } = await q
  if (error) {
    return { ok: false, message: /duplicate|unique/i.test(error.message)
      ? 'There is already a category called that.' : error.message }
  }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Naming categories is limited to administrators.' }
  }
  revalidatePath('/news/categories'); revalidatePath('/news')
  return { ok: true, message: id ? 'Renamed.' : `${name} added.` }
}

/** Nothing deletes. A category out of use is inactive and keeps its history. */
export async function retireCategory(id: string, active: boolean): Promise<Result> {
  const { db } = await ctx()
  const { data: hit, error } = await db.schema('hopper').from('news_category')
    .update({ active }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) return { ok: false, message: 'That is not yours to change.' }
  revalidatePath('/news/categories'); revalidatePath('/news')
  return { ok: true, message: active ? 'Back in use.' : 'Out of use.' }
}
