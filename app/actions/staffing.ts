'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import type { Result } from '@/app/actions/admin'

/**
 * Every write goes through the signed-in person's own session, so the policies
 * on the staff_ tables are what permit or refuse it. Nothing here re-checks
 * who may score whom: internal.hopper_staff_edit already knows, and a second
 * copy in JavaScript is a second answer that can drift from the one the
 * database believes.
 *
 * What IS here is the translation of a refusal into a sentence. "new row
 * violates row-level security policy" is true and useless; a manager who has
 * just tried to score somebody who is not theirs should be told that.
 */

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const step = (f: FormData, k: string) => {
  const n = Number(str(f, k))
  return n === 1 || n === 2 || n === 3 ? n : null
}
const refused = (m: string) => /row-level security|permission|Unauthorized/i.test(m)

async function ctx() {
  const session = await currentSession()
  if (!session) return null
  return { db: supabaseServer(), account: session.accountId, me: session.personId }
}

/* ── the score ────────────────────────────────────────────────────────── */

export async function saveReview(_prev: Result | null, form: FormData): Promise<Result> {
  const c = await ctx()
  if (!c) return { ok: false, message: 'Not signed in.' }

  const person_id = str(form, 'person_id')
  const period = str(form, 'period')
  if (!person_id || !period) return { ok: false, message: 'No quarter to score.' }

  const row = {
    account_id: c.account,
    person_id,
    period,
    caring: step(form, 'caring'),
    communication: step(form, 'communication'),
    reliability: step(form, 'reliability'),
    job_knowledge: step(form, 'job_knowledge'),
    summary: nul(form, 'summary'),
    settled: str(form, 'settled') === 'on',
    reviewer_id: c.me,
  }

  if (row.settled && [row.caring, row.communication, row.reliability, row.job_knowledge]
        .some((v) => v === null)) {
    return { ok: false, message: 'All four measures have to be answered before a quarter is settled.' }
  }

  const { error } = await c.db.schema('hopper').from('staff_review')
    .upsert(row, { onConflict: 'account_id,person_id,period' })
  if (error) {
    return {
      ok: false,
      message: refused(error.message)
        ? 'You can only score somebody who reports to you, or somebody in a line you hold staff records for.'
        : error.message,
    }
  }

  revalidatePath(`/staffing/${person_id}`)
  revalidatePath('/staffing')
  revalidatePath('/staffing/rankings')
  return { ok: true, message: row.settled ? 'Quarter settled.' : 'Saved as a draft.' }
}

/* ── notes ────────────────────────────────────────────────────────────── */

export async function addNote(_prev: Result | null, form: FormData): Promise<Result> {
  const c = await ctx()
  if (!c) return { ok: false, message: 'Not signed in.' }

  const person_id = str(form, 'person_id')
  const body = str(form, 'body')
  if (!person_id) return { ok: false, message: 'No person to note.' }
  if (!body) return { ok: false, message: 'A note needs something in it.' }

  const kind = str(form, 'kind')
  const { error } = await c.db.schema('hopper').from('staff_note').insert({
    account_id: c.account,
    person_id,
    kind: ['general', 'compliment', 'coaching'].includes(kind) ? kind : 'general',
    body,
    happened_on: nul(form, 'happened_on') ?? undefined,
    author_id: c.me,
  })
  if (error) {
    return {
      ok: false,
      message: refused(error.message)
        ? 'You can only write a note about somebody in your line of report.'
        : error.message,
    }
  }

  revalidatePath(`/staffing/${person_id}`)
  revalidatePath('/staffing')
  return { ok: true, message: 'Noted.' }
}

/* ── one-to-ones ──────────────────────────────────────────────────────── */

/**
 * A one-to-one is a Staffing record. It is written here, it is read here, and
 * the only thing that leaves is the DAY, which the calendar picks up for the
 * manager who held it. Nothing about what was said crosses that line.
 */
export async function saveMeeting(_prev: Result | null, form: FormData): Promise<Result> {
  const c = await ctx()
  if (!c) return { ok: false, message: 'Not signed in.' }

  const person_id = str(form, 'person_id')
  const day = str(form, 'day')
  if (!person_id || !day) return { ok: false, message: 'A one-to-one needs a date.' }

  const id = nul(form, 'id')
  const row = {
    account_id: c.account,
    person_id,
    manager_id: c.me,
    day,
    agenda: nul(form, 'agenda'),
    notes: nul(form, 'notes'),
    held: str(form, 'held') === 'on',
  }

  const q = c.db.schema('hopper').from('staff_meeting')
  const { error } = id ? await q.update(row).eq('id', id) : await q.insert(row)
  if (error) {
    return {
      ok: false,
      message: refused(error.message)
        ? 'You can only log a one-to-one with somebody in your line of report.'
        : error.message,
    }
  }

  revalidatePath(`/staffing/${person_id}`)
  revalidatePath('/staffing')
  revalidatePath('/calendar')
  return { ok: true, message: row.held ? 'Logged.' : 'Put on the calendar.' }
}

/* ── documents ────────────────────────────────────────────────────────── */

const MAX = 25 * 1024 * 1024

/**
 * The file goes up first and the row goes in second, because the storage
 * policy proves the folder from the PATH -- a rule that waits for the row
 * would refuse every first save. If the row then fails, the object is removed
 * again: a file in a bucket with no row is a file staff_docs_read will never
 * return, which is fail-closed but also litter.
 */
export async function addDocument(_prev: Result | null, form: FormData): Promise<Result> {
  const c = await ctx()
  if (!c) return { ok: false, message: 'Not signed in.' }

  const person_id = str(form, 'person_id')
  const title = str(form, 'title')
  if (!person_id) return { ok: false, message: 'No person to file this against.' }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'No file came through.' }
  if (file.size > MAX) return { ok: false, message: 'That file is larger than 25MB.' }

  const dot = file.name.lastIndexOf('.')
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin'
  const path = `${c.account}/${person_id}/${crypto.randomUUID()}.${ext || 'bin'}`

  const { error: up } = await c.db.storage.from('staff-docs')
    .upload(path, file, { contentType: file.type || 'application/octet-stream' })
  if (up) {
    return {
      ok: false,
      message: refused(up.message)
        ? 'You can only file a document against somebody in your line of report.'
        : up.message,
    }
  }

  const kind = str(form, 'kind')
  const { error } = await c.db.schema('hopper').from('staff_document').insert({
    account_id: c.account,
    person_id,
    kind: ['review', 'warning', 'agreement', 'certificate', 'other'].includes(kind) ? kind : 'other',
    title: title || file.name,
    path,
    mime: file.type || null,
    bytes: file.size,
    sensitive: str(form, 'sensitive') === 'on',
    happened_on: nul(form, 'happened_on') ?? undefined,
    added_by: c.me,
  })
  if (error) {
    await c.db.storage.from('staff-docs').remove([path])
    return {
      ok: false,
      message: refused(error.message)
        ? 'The file uploaded, but Hopper was not allowed to put it on the record — so it has been taken back off.'
        : error.message,
    }
  }

  revalidatePath(`/staffing/${person_id}`)
  revalidatePath('/staffing/documents')
  return { ok: true, message: 'Filed.' }
}

/** Sensitive is the one thing about a document anybody edits after the fact:
 *  it is the difference between the subject seeing their own copy and not. */
export async function setDocumentSensitive(
  _prev: Result | null, form: FormData,
): Promise<Result> {
  const c = await ctx()
  if (!c) return { ok: false, message: 'Not signed in.' }

  const id = str(form, 'id')
  const person_id = str(form, 'person_id')
  if (!id) return { ok: false, message: 'No document.' }

  const { error } = await c.db.schema('hopper').from('staff_document')
    .update({ sensitive: str(form, 'sensitive') === 'on' }).eq('id', id)
  if (error) {
    return {
      ok: false,
      message: refused(error.message) ? 'That document is not yours to change.' : error.message,
    }
  }

  revalidatePath(`/staffing/${person_id}`)
  revalidatePath('/staffing/documents')
  return { ok: true, message: 'Changed.' }
}
