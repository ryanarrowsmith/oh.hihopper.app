'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

/**
 * Every write here goes through the signed-in person's own session, so RLS is
 * what permits or refuses it -- and the database, not this file, is what
 * numbers a ticket, cuts its SLA, hands it to somebody and moves the clock
 * when a message lands. Inbound email and the public web form come in through
 * doors this file never sees; a rule written here would only apply to one of
 * the three.
 */

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const num = (f: FormData, k: string) => {
  const v = str(f, k)
  return v === '' ? null : Number(v)
}
const on = (f: FormData, k: string) => str(f, k) === 'on' || str(f, k) === 'true'

async function ctx() {
  const s = await currentSession()
  if (!s) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: s.accountId, person: s.personId }
}

const touch = (id?: string) => {
  revalidatePath('/desk')
  revalidatePath('/desk/mine'); revalidatePath('/desk/unassigned')
  if (id) revalidatePath(`/desk/${id}`)
  revalidatePath('/')
}
const touchAdmin = () => { revalidatePath('/desk/settings'); touch() }

/* ═══════════════════════════════════════════════════════════════ a ticket */

export async function raiseTicket(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const queue_id = str(form, 'queue_id')
  const subject = str(form, 'subject')
  if (!queue_id) return { ok: false, message: 'Choose the queue it belongs in.' }
  if (!subject) return { ok: false, message: 'A ticket needs a subject.' }

  // The organization comes from the QUEUE, not from a second picker that could
  // disagree with it.
  const { data: q } = await db.schema('hopper').from('queue')
    .select('entity_id').eq('id', queue_id).maybeSingle()
  if (!q) return { ok: false, message: 'That queue is no longer there.' }

  const { data, error } = await db.schema('hopper').from('ticket').insert({
    account_id: account, entity_id: q.entity_id, queue_id, subject,
    kind_id: nul(form, 'kind_id'),
    priority: str(form, 'priority') || 'normal',
    contact_id: nul(form, 'contact_id'),
    requester_name: nul(form, 'requester_name'),
    requester_email: nul(form, 'requester_email'),
    assignee_id: nul(form, 'assignee_id'),
    source: 'agent',
    created_by: person,
  }).select('id, ref').single()
  if (error) return { ok: false, message: error.message }

  const body = str(form, 'body')
  if (body) {
    await db.schema('hopper').from('ticket_message').insert({
      account_id: account, ticket_id: data.id, kind: 'note',
      body, author_person_id: person,
    })
  }

  touch(data.id)
  return { ok: true, message: `${data.ref} raised.` }
}

/** A reply the person outside will read, or a note only the desk can see. */
export async function sendMessage(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const ticket_id = str(form, 'ticket_id')
  const kind = str(form, 'kind') === 'note' ? 'note' : 'out'
  const body = str(form, 'body')
  if (!ticket_id) return { ok: false, message: 'Which ticket?' }
  if (!body) return { ok: false, message: kind === 'note' ? 'The note is empty.' : 'The reply is empty.' }

  const { error } = await db.schema('hopper').from('ticket_message').insert({
    account_id: account, ticket_id, kind, body, author_person_id: person,
  })
  if (error) return { ok: false, message: error.message }

  // Answering a customer normally means it is now their turn. A note never
  // moves the ticket: nobody outside can read it, so nobody is waiting on it.
  if (kind === 'out' && on(form, 'then_wait')) {
    await db.schema('hopper').from('ticket').update({ status: 'waiting' }).eq('id', ticket_id)
  }
  if (kind === 'out' && on(form, 'then_resolve')) {
    await db.schema('hopper').from('ticket').update({ status: 'resolved' }).eq('id', ticket_id)
  }

  touch(ticket_id)
  return { ok: true, message: kind === 'note' ? 'Note added.' : 'Reply sent.' }
}

/** One action for every field on the ticket that a person changes in place. */
export async function updateTicket(_p: Result | null, form: FormData): Promise<Result> {
  const { db } = await ctx()
  const id = str(form, 'ticket_id')
  if (!id) return { ok: false, message: 'Which ticket?' }

  const patch: Record<string, unknown> = {}
  // Two lists, because the difference matters. EMPTIABLE fields treat '' as a
  // real answer -- unassigning somebody, taking a ticket back out of a group --
  // and NEEDED fields have no null to mean anything, so an empty one is a form
  // that arrived wrong and is ignored rather than written as null into a column
  // that would refuse it.
  const NEEDED = ['status', 'priority', 'queue_id', 'subject']
  const EMPTIABLE = ['assignee_id', 'kind_id', 'group_id']
  for (const k of NEEDED) { const v = str(form, k); if (v) patch[k] = v }
  for (const k of EMPTIABLE) if (form.has(k)) patch[k] = nul(form, k)

  if (form.has('fields')) {
    try { patch.fields = JSON.parse(str(form, 'fields') || '{}') }
    catch { return { ok: false, message: 'Those answers did not save. Try again.' } }
  }
  if (!Object.keys(patch).length) return { ok: true, message: '' }

  const { error } = await db.schema('hopper').from('ticket').update(patch).eq('id', id)
  if (error) {
    // HP001 is the database refusing to sign off a ticket that is still out
    // with somebody. It arrives as three sentences -- what, who, and what to do
    // about it -- and all three are worth reading, so none of them is dropped.
    if ((error as any).code === 'HP001') {
      return { ok: false, message: [error.message, (error as any).details, (error as any).hint]
        .filter(Boolean).join(' ') }
    }
    return { ok: false, message: error.message }
  }
  touch(id)
  return { ok: true, message: 'Saved.' }
}

/* ═════════════════════════════════════════════════ duplicates and outages */

export async function openGroup(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const entity_id = str(form, 'entity_id')
  const name = str(form, 'name')
  if (!entity_id || !name) return { ok: false, message: 'A group needs an organization and a name.' }

  const { data, error } = await db.schema('hopper').from('ticket_group').insert({
    account_id: account, entity_id, name,
    reason: str(form, 'reason') || 'outage',
    note: nul(form, 'note'), opened_by: person,
  }).select('id').single()
  if (error) return { ok: false, message: error.message }

  const ids = form.getAll('ticket_id').map((v) => v.toString()).filter(Boolean)
  if (ids.length) {
    await db.schema('hopper').from('ticket').update({ group_id: data.id }).in('id', ids)
  }
  touch()
  return { ok: true, message: ids.length ? `${ids.length} tickets grouped.` : 'Group opened.' }
}

export async function closeGroup(_p: Result | null, form: FormData): Promise<Result> {
  const { db } = await ctx()
  const id = str(form, 'group_id')
  if (!id) return { ok: false, message: 'Which group?' }
  const { error } = await db.schema('hopper').from('ticket_group')
    .update({ open: false, closed_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  touch()
  return { ok: true, message: 'Group closed.' }
}

/* ═══════════════════════════════════════════════════════════ the settings */

export async function saveDesk(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const entity_id = str(form, 'entity_id')
  if (!entity_id) return { ok: false, message: 'Which organization?' }

  const prefix = str(form, 'prefix').toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix)) {
    return { ok: false, message: 'A reference starts with a letter and is two to eight letters or digits.' }
  }
  const day_start = num(form, 'day_start') ?? 420
  const day_end = num(form, 'day_end') ?? 1020
  if (day_end <= day_start) return { ok: false, message: 'The day has to end after it starts.' }

  const work_days = form.getAll('work_days').map((v) => Number(v.toString())).filter(Boolean)
  const { error } = await db.schema('hopper').from('desk').upsert({
    account_id: account, entity_id, prefix, day_start, day_end,
    work_days: work_days.length ? work_days : [1, 2, 3, 4, 5],
    time_zone: str(form, 'time_zone') || 'America/Chicago',
    updated_at: new Date().toISOString(), updated_by: person,
  }, { onConflict: 'account_id,entity_id' })
  if (error) return { ok: false, message: error.message }

  await logAudit(db, { account_id: account, kind: 'desk',
    summary: 'Changed the desk hours and reference', object: 'desk', object_id: entity_id })
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

export async function saveSla(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = nul(form, 'id')
  const name = str(form, 'name')
  const entity_id = str(form, 'entity_id')
  const first_reply_mins = num(form, 'first_reply_mins')
  const resolve_mins = num(form, 'resolve_mins')
  if (!name) return { ok: false, message: 'An SLA needs a name.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }
  if (first_reply_mins === null && resolve_mins === null) {
    return { ok: false, message: 'Give it a first-reply target, a resolve target, or both.' }
  }

  const row = {
    account_id: account, entity_id, name, first_reply_mins, resolve_mins,
    business_hours: on(form, 'business_hours'),
    active: !form.has('active') || on(form, 'active'),
  }
  const { error } = id
    ? await db.schema('hopper').from('sla').update(row).eq('id', id)
    : await db.schema('hopper').from('sla').insert({ ...row, created_by: person })
  if (error) return { ok: false, message: error.message }

  await logAudit(db, { account_id: account, kind: 'desk',
    summary: `${id ? 'Changed' : 'Added'} the SLA "${name}"`, object: 'sla', object_id: id })
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

export async function saveQueue(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = nul(form, 'id')
  const name = str(form, 'name')
  const entity_id = str(form, 'entity_id')
  const department_id = str(form, 'department_id')
  if (!name) return { ok: false, message: 'A queue needs a name.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }
  if (!department_id) return { ok: false, message: 'Choose the department that answers it.' }

  const assign_mode = str(form, 'assign_mode') || 'manual'
  const assign_to = nul(form, 'assign_to')
  if (assign_mode === 'fixed' && !assign_to) {
    return { ok: false, message: 'Always the same person — say which person.' }
  }

  const row = {
    account_id: account, entity_id, department_id, name,
    facing: str(form, 'facing') || 'out',
    inbox_address: nul(form, 'inbox_address')?.toLowerCase() ?? null,
    form_enabled: on(form, 'form_enabled'),
    sla_id: nul(form, 'sla_id'),
    assign_mode, assign_to: assign_mode === 'fixed' ? assign_to : null,
    active: !form.has('active') || on(form, 'active'),
  }
  const { error } = id
    ? await db.schema('hopper').from('queue').update(row).eq('id', id)
    : await db.schema('hopper').from('queue').insert({ ...row, created_by: person })
  if (error) {
    return { ok: false, message: /queue_inbox_shape/.test(error.message)
      ? 'That does not look like an email address.'
      : /inbox_address/.test(error.message)
      ? 'Another queue already takes mail at that address.'
      : error.message }
  }

  await logAudit(db, { account_id: account, kind: 'desk',
    summary: `${id ? 'Changed' : 'Added'} the queue "${name}"`, object: 'queue', object_id: id })
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

/** Adding somebody to a queue IS giving them its tickets, so it is one act. */
export async function setQueueAgent(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const queue_id = str(form, 'queue_id')
  const person_id = str(form, 'person_id')
  if (!queue_id || !person_id) return { ok: false, message: 'Which person, on which queue?' }

  const active = on(form, 'active')
  const { error } = await db.schema('hopper').from('queue_agent').upsert({
    account_id: account, queue_id, person_id,
    lead: on(form, 'lead'), active, added_by: person,
  }, { onConflict: 'queue_id,person_id' })
  if (error) return { ok: false, message: error.message }

  await logAudit(db, { account_id: account, kind: 'desk',
    summary: active ? 'Put somebody on a queue' : 'Took somebody off a queue',
    object: 'queue', object_id: queue_id })
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

export async function saveKind(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = nul(form, 'id')
  const name = str(form, 'name')
  const entity_id = str(form, 'entity_id')
  if (!name) return { ok: false, message: 'A ticket type needs a name.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }

  const row = {
    account_id: account, entity_id, name, sla_id: nul(form, 'sla_id'),
    active: !form.has('active') || on(form, 'active'),
  }
  const { error } = id
    ? await db.schema('hopper').from('ticket_kind').update(row).eq('id', id)
    : await db.schema('hopper').from('ticket_kind').insert({ ...row, created_by: person })
  if (error) return { ok: false, message: error.message }
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

export async function saveField(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = nul(form, 'id')
  const kind_id = str(form, 'kind_id')
  const label = str(form, 'label')
  if (!kind_id) return { ok: false, message: 'Which ticket type?' }
  if (!label) return { ok: false, message: 'A field needs a label.' }

  // The key is how the answer is stored, so it is derived from the label once
  // and then left alone -- renaming the label of a field people have already
  // answered must not orphan every answer.
  const key = str(form, 'key') ||
    label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 39)
  if (!/^[a-z][a-z0-9_]{0,38}$/.test(key)) {
    return { ok: false, message: 'Give the field a label that starts with a letter.' }
  }

  const options = str(form, 'options').split('\n').map((s) => s.trim()).filter(Boolean)
  const row = {
    account_id: account, kind_id, key, label,
    kind: str(form, 'kind') || 'text',
    required: on(form, 'required'),
    options, hint: nul(form, 'hint'), on_form: on(form, 'on_form'),
    active: !form.has('active') || on(form, 'active'),
  }
  const { error } = id
    ? await db.schema('hopper').from('ticket_field').update(row).eq('id', id)
    : await db.schema('hopper').from('ticket_field').insert(row)
  if (error) {
    return { ok: false, message: /ticket_field_kind_id_key_key|kind_id, key/.test(error.message)
      ? 'This type already asks for something by that name.' : error.message }
  }
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

export async function saveSnippet(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const id = nul(form, 'id')
  const title = str(form, 'title')
  const body = str(form, 'body')
  const entity_id = str(form, 'entity_id')
  if (!title) return { ok: false, message: 'A quick response needs a name.' }
  if (!body) return { ok: false, message: 'A quick response needs something to say.' }
  if (!entity_id) return { ok: false, message: 'Choose the organization it belongs to.' }

  const row = {
    account_id: account, entity_id, title, body,
    queue_id: nul(form, 'queue_id'), kind_id: nul(form, 'kind_id'),
    active: !form.has('active') || on(form, 'active'),
  }
  const { error } = id
    ? await db.schema('hopper').from('reply_snippet').update(row).eq('id', id)
    : await db.schema('hopper').from('reply_snippet').insert({ ...row, created_by: person })
  if (error) return { ok: false, message: error.message }
  touchAdmin()
  return { ok: true, message: 'Saved.' }
}

/** A contact is made on the way past, from whoever wrote in. */
export async function saveContact(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = nul(form, 'id')
  const email = str(form, 'email').toLowerCase()
  const entity_id = str(form, 'entity_id')
  if (!email) return { ok: false, message: 'A contact needs an email address.' }
  if (!entity_id) return { ok: false, message: 'Which organization?' }

  const row = {
    account_id: account, entity_id, email,
    name: nul(form, 'name'), company: nul(form, 'company'),
    phone: nul(form, 'phone'), note: nul(form, 'note'),
  }
  const { error } = id
    ? await db.schema('hopper').from('contact').update(row).eq('id', id)
    : await db.schema('hopper').from('contact').insert(row)
  if (error) {
    return { ok: false, message: /contact_email_idx/.test(error.message)
      ? 'That address is already on file here.' : error.message }
  }
  touch()
  return { ok: true, message: 'Saved.' }
}

/* ═══════════════════════════════════════════════════════ the handbook */

export type Found = { id: string; title: string; slug: string; summary: string | null }

/**
 * Looking something up without leaving the ticket.
 *
 * The wiki already keeps a tsvector of every published document, so this asks
 * Postgres the question rather than shipping the handbook to the browser and
 * filtering it there. Answering a customer correctly usually means finding one
 * paragraph of process; walking away from the reply box to find it is how the
 * reply ends up half-written and abandoned.
 */
export async function findWiki(q: string): Promise<Found[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const db = supabaseServer()
  const { data } = await db.schema('hopper').from('wiki_doc')
    .select('id, title, slug, summary')
    .eq('status', 'published')
    .textSearch('search', term, { type: 'websearch' })
    .limit(6)
  return (data ?? []) as Found[]
}

/* ═══════════════════════════════════════════ asking somebody else for help */

/**
 * A to-do, raised out of a ticket.
 *
 * It is a REAL to-do -- a row in hopper.task -- rather than a ticket-shaped
 * thing of its own, which is the whole reason it works: the person asked gets
 * it in their To Do, in their notifications and in their email without needing
 * Desk, or a grant, or to be told where to look. hopper.notify_task has rung
 * that bell and posted that letter for every to-do since To Do shipped.
 *
 * The organization comes from the TICKET, and so does the list. Two statements
 * rather than one, because a policy cannot see a row created earlier in its own
 * statement -- the list would be invisible to the insert that needs it.
 */
export async function askForHelp(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const ticket_id = str(form, 'ticket_id')
  const name = str(form, 'name')
  const assignee_id = str(form, 'assignee_id')
  if (!ticket_id) return { ok: false, message: 'Which ticket?' }
  if (!name) return { ok: false, message: 'Say what needs doing.' }
  if (!assignee_id) return { ok: false, message: 'Say who you are asking.' }

  const { data: t } = await db.schema('hopper').from('ticket')
    .select('entity_id').eq('id', ticket_id).maybeSingle()
  if (!t) return { ok: false, message: 'That ticket is no longer there.' }

  // The desk made this list the first time it took a ticket, so a ticket
  // existing is the guarantee that a list does. Nobody asking for help needs
  // the right to create one, which most of them would not have.
  const { data: desk } = await db.schema('hopper').from('desk')
    .select('task_list_id').eq('entity_id', t.entity_id).maybeSingle()
  if (!desk?.task_list_id) {
    return { ok: false, message: 'This desk has nowhere to put it yet. Open a ticket first.' }
  }

  const { error } = await db.schema('hopper').from('task').insert({
    account_id: account, list_id: desk.task_list_id, ticket_id,
    name, detail: nul(form, 'detail'),
    assignee_id, due_on: nul(form, 'due_on'),
    created_by: person,
  })
  if (error) return { ok: false, message: error.message }

  touch(ticket_id)
  return { ok: true, message: 'Asked. It is on their To Do now.' }
}

/**
 * Calling it off.
 *
 * Not a delete and not an unassignment: it is marked done with a line saying
 * who called it off, and it stays where the helper can see it. Unassigning
 * would take it off their screen without a word, and three weeks later the
 * fact that dispatch was asked at all is usually exactly what somebody wants.
 */
export async function callOffTask(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const task_id = str(form, 'task_id')
  if (!task_id) return { ok: false, message: 'Which one?' }

  const { data: t } = await db.schema('hopper').from('task')
    .select('id, list_id, name, assignee_id, ticket_id, done_at')
    .eq('id', task_id).maybeSingle()
  if (!t) return { ok: false, message: 'That is no longer there.' }
  if (t.done_at) return { ok: true, message: 'Already finished.' }

  // The note first, so the reason is in the record even if the tick fails.
  await db.schema('hopper').from('list_note').insert({
    account_id: account, list_id: t.list_id, task_id: t.id, kind: 'note',
    body: str(form, 'why') || 'Called off from the ticket — no longer needed.',
    author_id: person,
  })

  const { error } = await db.schema('hopper').from('task')
    .update({ done_at: new Date().toISOString() }).eq('id', task_id)
  if (error) return { ok: false, message: error.message }

  touch(t.ticket_id ?? undefined)
  return { ok: true, message: 'Called off.' }
}

/** Asking the helper for an update, without leaving the ticket. */
export async function nudgeTask(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const task_id = str(form, 'task_id')
  const body = str(form, 'body')
  if (!task_id) return { ok: false, message: 'Which one?' }
  if (!body) return { ok: false, message: 'Nothing to say.' }

  const { data: t } = await db.schema('hopper').from('task')
    .select('list_id, ticket_id').eq('id', task_id).maybeSingle()
  if (!t) return { ok: false, message: 'That is no longer there.' }

  const { error } = await db.schema('hopper').from('list_note').insert({
    account_id: account, list_id: t.list_id, task_id, kind: 'note',
    body, author_id: person,
  })
  if (error) return { ok: false, message: error.message }

  touch(t.ticket_id ?? undefined)
  return { ok: true, message: 'Sent.' }
}
