'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const tags = (f: FormData) =>
  str(f, 'tags').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6)

async function ctx() {
  const s = await currentSession()
  if (!s) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: s.accountId, person: s.personId }
}

/**
 * How often it comes back, as one short string.
 *
 * A number and a unit in two fields is two ways to get it half-right; the
 * choices people actually want are a short list, so the list is the control and
 * this is the only place that knows how to read it. '' means it does not
 * repeat, and the database refuses anything it does not recognise anyway.
 */
const UNIT: Record<string, string> = { d: 'day', w: 'week', m: 'month', y: 'year' }
function repeatOf(key: string) {
  const m = /^(\d{1,3})([dwmy])$/.exec(key.trim())
  if (!m) return { repeat_every: null, repeat_unit: null }
  return { repeat_every: Number(m[1]), repeat_unit: UNIT[m[2]] }
}

const STATUS = new Set(['on_track', 'at_risk', 'blocked', 'complete'])
const SAID: Record<string, string> = {
  on_track: 'on track', at_risk: 'at risk', blocked: 'blocked', complete: 'complete',
}

/**
 * Nothing here writes the log for a date, an assignment, a tick or a
 * dependency.
 *
 * The database does, on the row itself, the moment it changes. Two writers for
 * one fact is how a log ends up saying a thing twice and disagreeing with
 * itself once -- and a trigger cannot be forgotten by the next action somebody
 * adds. What a person MEANT still belongs to them: that is addNote.
 */
const touch = (list: string) => {
  revalidatePath(`/todo/${list}`); revalidatePath('/todo')
  revalidatePath('/calendar'); revalidatePath('/')
}

/* ─────────────────────────────────────────────────────────────────── lists */

export async function createList(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const name = str(form, 'name')
  const entity_id = str(form, 'entity_id')
  if (!name) return { ok: false, message: 'A list needs a name.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }

  const { data, error } = await db.schema('hopper').from('list').insert({
    account_id: account, entity_id, name,
    summary: nul(form, 'summary'),
    owner_id: nul(form, 'owner_id') ?? person,
    started_on: nul(form, 'started_on'), due_on: nul(form, 'due_on'),
    tags: tags(form),
    created_by: person, updated_by: person,
  }).select('id').single()
  if (error) return { ok: false, message: error.message }

  await logAudit(db, { account_id: account, kind: 'list', object: name,
    object_id: data.id, summary: `Started the list ${name}` })
  revalidatePath('/todo')
  redirect(`/todo/${data.id}`)
}

export async function setListStatus(id: string, status: string): Promise<Result> {
  const { db, account, person } = await ctx()
  if (!STATUS.has(status)) return { ok: false, message: 'Hopper has no such state.' }

  const { data: was } = await db.schema('hopper').from('list')
    .select('name, status').eq('id', id).maybeSingle()
  if (!was) return { ok: false, message: 'That list is not there.' }
  if (was.status === status) return { ok: true, message: 'No change.' }

  const { data, error } = await db.schema('hopper').from('list')
    .update({ status, updated_by: person, updated_at: new Date().toISOString() })
    .eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  // A policy on ALL means a refusal removes nothing and says nothing. The rows
  // touched are the only honest answer.
  if (!data || data.length === 0) {
    return { ok: false, message: 'Changing a list is limited to the people who run it.' }
  }

  await logAudit(db, { account_id: account, kind: 'list', object: was.name,
    object_id: id, summary: `${was.name} is ${SAID[status] ?? status}` })
  touch(id)
  return { ok: true, message: SAID[status] ?? status }
}

export async function setListDate(_p: Result | null, form: FormData): Promise<Result> {
  const { db } = await ctx()
  const id = str(form, 'id')
  if (!id) return { ok: false, message: 'Which list?' }

  const { data: hit, error } = await db.schema('hopper').from('list')
    .update({ due_on: nul(form, 'due_on') }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Dating a list is limited to the people who run it.' }
  }
  touch(id)
  return { ok: true, message: 'Dated.' }
}

/* ─────────────────────────────────────────────────── tasks, and their subs */

export async function addTask(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const list_id = str(form, 'list_id')
  const name = str(form, 'name')
  if (!list_id || !name) return { ok: false, message: 'A task needs a name.' }

  const { error } = await db.schema('hopper').from('task').insert({
    account_id: account, list_id,
    parent_id: nul(form, 'parent_id'),
    name, detail: nul(form, 'detail'),
    assignee_id: nul(form, 'assignee_id'),
    due_on: nul(form, 'due_on'),
    blocked_by: nul(form, 'blocked_by'),
    tags: tags(form), created_by: person,
    ...repeatOf(str(form, 'repeat')),
  })
  // The database refuses a subtask under a subtask, in words a person can read.
  if (error) return { ok: false, message: error.message }

  touch(list_id)
  return { ok: true, message: `${name} added.` }
}

/**
 * Tick it, or untick it.
 *
 * The assignee can do this without being able to run the list -- adding and
 * dating is running it, marking one done is doing your job. That is a policy,
 * not a check here, which is why the rows touched are counted.
 *
 * Closing a task closes what is under it. A task whose subtasks are still open
 * is a task that is not done, and asking somebody to tick five boxes to say one
 * thing is asking them to do the computer's job.
 */
export async function closeTask(id: string, done: boolean): Promise<Result> {
  const { db } = await ctx()
  const { data: t } = await db.schema('hopper').from('task')
    .select('name, list_id, parent_id, blocked_by').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }
  if (done && t.blocked_by) {
    return { ok: false, message: 'It waits on something else. Clear that first.' }
  }

  const at = done ? new Date().toISOString() : null
  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ done_at: at }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) return { ok: false, message: 'That is not yours to tick.' }

  if (done && !t.parent_id) {
    await db.schema('hopper').from('task')
      .update({ done_at: at }).eq('parent_id', id).is('done_at', null)
  }

  touch(t.list_id)
  return { ok: true, message: done ? 'Done.' : 'Reopened.' }
}

/** The date. The database logs the move and tells whoever it is on. */
export async function dateTask(_p: Result | null, form: FormData): Promise<Result> {
  const { db } = await ctx()
  const id = str(form, 'id')
  if (!id) return { ok: false, message: 'Which task?' }
  const { data: t } = await db.schema('hopper').from('task')
    .select('list_id').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ due_on: nul(form, 'due_on') }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Moving a date is limited to the people who run this list.' }
  }
  touch(t.list_id)
  return { ok: true, message: 'Dated.' }
}

/** Who it is on. The database tells them, by bell and by mail. */
export async function assignTask(id: string, personId: string | null): Promise<Result> {
  const { db } = await ctx()
  const { data: t } = await db.schema('hopper').from('task')
    .select('list_id').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ assignee_id: personId }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Putting a task on somebody is limited to the people who run this list.' }
  }
  touch(t.list_id)
  return { ok: true, message: personId ? 'Told them.' : 'Off them.' }
}

export async function tagTask(id: string, list: string[]): Promise<Result> {
  const { db } = await ctx()
  const { data: t } = await db.schema('hopper').from('task')
    .select('list_id').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ tags: list.map((s) => s.trim()).filter(Boolean).slice(0, 6) })
    .eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Tagging is limited to the people who run this list.' }
  }
  touch(t.list_id)
  return { ok: true, message: 'Tagged.' }
}

/**
 * How often it comes back, or not at all.
 *
 * Ticking a repeating task rolls it forward rather than leaving a corpse and
 * making a copy -- that is the database's job, in a trigger, so it happens
 * whether the tick came from this action or from anywhere else.
 */
export async function repeatTask(id: string, key: string): Promise<Result> {
  const { db } = await ctx()
  const { data: t } = await db.schema('hopper').from('task')
    .select('list_id, due_on, parent_id').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }
  if (t.parent_id) {
    return { ok: false, message: 'A subtask comes back with the task above it, not on its own.' }
  }
  const r = repeatOf(key)
  if (r.repeat_every && !t.due_on) {
    return { ok: false, message: 'Give it a date first — a repeat needs something to count from.' }
  }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update(r).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Setting a repeat is limited to the people who run this list.' }
  }
  touch(t.list_id)
  return { ok: true, message: r.repeat_every ? 'It will come back.' : 'It will not come back.' }
}

/** What is holding a task up, or nothing. */
export async function blockTask(id: string, blockedBy: string | null): Promise<Result> {
  const { db } = await ctx()
  if (blockedBy === id) return { ok: false, message: 'A task cannot wait on itself.' }
  const { data: t } = await db.schema('hopper').from('task')
    .select('list_id').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ blocked_by: blockedBy }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Changing what a task waits on is limited to the people who run this list.' }
  }
  touch(t.list_id)
  return { ok: true, message: blockedBy ? 'Held.' : 'Released.' }
}

/* ───────────────────────────────────────────────────────────────────── log */

export async function addNote(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const list_id = str(form, 'list_id')
  const body = str(form, 'body')
  if (!list_id || !body) return { ok: false, message: 'Say something before saving it.' }

  const { error } = await db.schema('hopper').from('list_note')
    .insert({ account_id: account, list_id, body, kind: 'note', author_id: person })
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/todo/${list_id}`)
  return { ok: true, message: 'Noted.' }
}
