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

const STATUS = new Set(['on_track', 'at_risk', 'blocked', 'complete'])
const SAID: Record<string, string> = {
  on_track: 'on track', at_risk: 'at risk', blocked: 'blocked', complete: 'complete',
}

/**
 * The log is written by the same call that made the change.
 *
 * Not a trigger, deliberately: a trigger knows a column changed, and the log is
 * for what a person MEANT. "Moved to 12 Sep" is a fact the database can state;
 * "because the readings landed a week late" is not, and the second half is the
 * only half anybody reads six weeks later.
 */
async function note(db: any, account: string, person: string | null,
                    project: string, kind: string, body: string) {
  if (!person) return
  await db.schema('hopper').from('project_note')
    .insert({ account_id: account, project_id: project, kind, body, author_id: person })
}

export async function createProject(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const name = str(form, 'name')
  const entity_id = str(form, 'entity_id')
  if (!name) return { ok: false, message: 'A project needs a name.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }

  const { data, error } = await db.schema('hopper').from('project').insert({
    account_id: account, entity_id, name,
    summary: nul(form, 'summary'),
    owner_id: nul(form, 'owner_id') ?? person,
    started_on: nul(form, 'started_on'), target_on: nul(form, 'target_on'),
    created_by: person, updated_by: person,
  }).select('id').single()
  if (error) return { ok: false, message: error.message }

  await logAudit(db, { account_id: account, kind: 'project', object: name,
    object_id: data.id, summary: `Started the project ${name}` })
  revalidatePath('/projects')
  redirect(`/projects/${data.id}`)
}

export async function setProjectStatus(id: string, status: string): Promise<Result> {
  const { db, account, person } = await ctx()
  if (!STATUS.has(status)) return { ok: false, message: 'Hopper has no such state.' }

  const { data: was } = await db.schema('hopper').from('project')
    .select('name, status').eq('id', id).maybeSingle()
  if (!was) return { ok: false, message: 'That project is not there.' }
  if (was.status === status) return { ok: true, message: 'No change.' }

  const { data, error } = await db.schema('hopper').from('project')
    .update({ status, updated_by: person, updated_at: new Date().toISOString() })
    .eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  // A policy on ALL means a refusal removes nothing and says nothing. The rows
  // touched are the only honest answer.
  if (!data || data.length === 0) {
    return { ok: false, message: 'Changing a project is limited to the people who run it.' }
  }

  await note(db, account, person, id, 'status',
    `Moved from ${SAID[was.status] ?? was.status} to ${SAID[status] ?? status}.`)
  await logAudit(db, { account_id: account, kind: 'project', object: was.name,
    object_id: id, summary: `${was.name} is ${SAID[status] ?? status}` })
  revalidatePath(`/projects/${id}`); revalidatePath('/projects')
  return { ok: true, message: SAID[status] ?? status }
}

export async function addMilestone(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const project_id = str(form, 'project_id')
  const name = str(form, 'name')
  if (!project_id || !name) return { ok: false, message: 'A milestone needs a name.' }

  const { error } = await db.schema('hopper').from('milestone').insert({
    account_id: account, project_id, name,
    detail: nul(form, 'detail'), due_on: nul(form, 'due_on'),
    sort_order: Number(str(form, 'sort_order')) || 0,
  })
  if (error) return { ok: false, message: error.message }

  await note(db, account, person, project_id, 'note', `Added the milestone ${name}.`)
  revalidatePath(`/projects/${project_id}`); revalidatePath('/projects')
  return { ok: true, message: `${name} added.` }
}

/**
 * Move a milestone, with the reason.
 *
 * The reason is not optional and the date history is insert-only, which
 * together are the whole feature: six weeks later "why did the pilot slip" has
 * an answer instead of an argument. The move row is what notifies everyone
 * working under it -- that is a trigger, so it cannot be forgotten here.
 */
export async function moveMilestone(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = str(form, 'id')
  const now_on = str(form, 'due_on')
  const why = str(form, 'why')
  if (!id || !now_on) return { ok: false, message: 'Which date?' }
  if (!why) return { ok: false, message: 'Say why it moved before moving it.' }

  const { data: m } = await db.schema('hopper').from('milestone')
    .select('name, due_on, project_id').eq('id', id).maybeSingle()
  if (!m) return { ok: false, message: 'That milestone is not there.' }
  if (m.due_on === now_on) return { ok: false, message: 'That is the date it already has.' }

  const { data: hit, error } = await db.schema('hopper').from('milestone')
    .update({ due_on: now_on }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Moving a date is limited to the people who run this project.' }
  }

  await db.schema('hopper').from('milestone_move').insert({
    account_id: account, milestone_id: id,
    was_on: m.due_on, now_on, why, moved_by: person,
  })
  await note(db, account, person, m.project_id, 'moved',
    `Moved ${m.name}${m.due_on ? ` from ${m.due_on}` : ''} to ${now_on} — ${why}`)
  await logAudit(db, { account_id: account, kind: 'project', object: m.name,
    object_id: m.project_id, summary: `Moved ${m.name} to ${now_on}`, note: why })

  revalidatePath(`/projects/${m.project_id}`); revalidatePath('/projects'); revalidatePath('/calendar')
  return { ok: true, message: 'Moved.' }
}

export async function closeMilestone(id: string, done: boolean): Promise<Result> {
  const { db, account, person } = await ctx()
  const { data: m } = await db.schema('hopper').from('milestone')
    .select('name, project_id').eq('id', id).maybeSingle()
  if (!m) return { ok: false, message: 'That milestone is not there.' }

  const { data: hit, error } = await db.schema('hopper').from('milestone')
    .update({ done_at: done ? new Date().toISOString() : null }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Closing a milestone is limited to the people who run this project.' }
  }

  await note(db, account, person, m.project_id, done ? 'closed' : 'note',
    done ? `Closed ${m.name}.` : `Reopened ${m.name}.`)
  revalidatePath(`/projects/${m.project_id}`); revalidatePath('/projects')
  return { ok: true, message: done ? 'Closed.' : 'Reopened.' }
}

export async function addTask(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const project_id = str(form, 'project_id')
  const name = str(form, 'name')
  if (!project_id || !name) return { ok: false, message: 'A task needs a name.' }

  const tags = str(form, 'tags').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6)
  const { error } = await db.schema('hopper').from('task').insert({
    account_id: account, project_id,
    milestone_id: nul(form, 'milestone_id'),
    name, detail: nul(form, 'detail'),
    assignee_id: nul(form, 'assignee_id'),
    due_on: nul(form, 'due_on'),
    blocked_by: nul(form, 'blocked_by'),
    tags, created_by: person,
  })
  if (error) return { ok: false, message: error.message }

  revalidatePath(`/projects/${project_id}`); revalidatePath('/projects')
  revalidatePath('/calendar'); revalidatePath('/')
  return { ok: true, message: `${name} added.` }
}

/**
 * Tick it, or untick it.
 *
 * The assignee can do this without being able to run the project -- adding and
 * moving tasks is running it, marking one done is doing your job. That is a
 * policy, not a check here, which is why the rows touched are counted.
 */
export async function closeTask(id: string, done: boolean): Promise<Result> {
  const { db } = await ctx()
  const { data: t } = await db.schema('hopper').from('task')
    .select('name, project_id, blocked_by, done_at').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }
  if (done && t.blocked_by) {
    return { ok: false, message: 'It is blocked. Clear what is holding it first.' }
  }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ done_at: done ? new Date().toISOString() : null }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'That is not yours to tick.' }
  }

  revalidatePath(`/projects/${t.project_id}`); revalidatePath('/projects')
  revalidatePath('/calendar'); revalidatePath('/')
  return { ok: true, message: done ? 'Done.' : 'Reopened.' }
}

/** What is holding a task up, or nothing. The trigger tells whoever it is on. */
export async function blockTask(id: string, blockedBy: string | null): Promise<Result> {
  const { db } = await ctx()
  if (blockedBy === id) return { ok: false, message: 'A task cannot wait on itself.' }
  const { data: t } = await db.schema('hopper').from('task')
    .select('project_id').eq('id', id).maybeSingle()
  if (!t) return { ok: false, message: 'That task is not there.' }

  const { data: hit, error } = await db.schema('hopper').from('task')
    .update({ blocked_by: blockedBy }).eq('id', id).select('id')
  if (error) return { ok: false, message: error.message }
  if (!hit || hit.length === 0) {
    return { ok: false, message: 'Changing what a task waits on is limited to the people who run this project.' }
  }
  revalidatePath(`/projects/${t.project_id}`); revalidatePath('/')
  return { ok: true, message: blockedBy ? 'Held.' : 'Released.' }
}

export async function addNote(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const project_id = str(form, 'project_id')
  const body = str(form, 'body')
  if (!project_id || !body) return { ok: false, message: 'Say something before saving it.' }

  const { error } = await db.schema('hopper').from('project_note')
    .insert({ account_id: account, project_id, body, kind: 'note', author_id: person })
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/projects/${project_id}`)
  return { ok: true, message: 'Noted.' }
}
