'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { saveProfile } from '@/app/actions/profile'
import type { Result } from '@/app/actions/admin'

const one = (f: FormData, k: string) => {
  const v = f.get(k)
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

/**
 * A person's page, saved in one go.
 *
 * One pencil, one form, one save -- the details the business keeps and the
 * answers the person gives, together. They used to be two edit buttons a
 * hand's width apart on the same screen.
 *
 * Which fields are permitted is not decided here. hopper.person has two write
 * policies now -- roster:edit for anybody who administers the roster, and your
 * own row for you -- and a BEFORE UPDATE trigger pins every column a person
 * may not decide about themselves. So this reads what the form sent and hands
 * it over; the database is what says no, and there is no second copy of the
 * rule in JavaScript to drift out of step with it.
 *
 * The exception is a name, which is not Hopper's to keep. Where somebody can
 * sign in, the platform owns their name and the directory reads it from there
 * -- so writing hopper.person.full_name for such a person would save something
 * nothing ever displays. Their own edit goes to beebee.profiles instead, which
 * only they may write. An administrator renaming somebody who signs in is
 * editing the roster's copy, and the screen says so rather than pretending.
 */
export async function savePersonCard(_prev: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }

  const id = one(form, 'person_id')
  if (!id) return { ok: false, message: 'No person to save against.' }

  const db = supabaseServer()
  const { data: person, error: readErr } = await db.schema('hopper').from('person')
    .select('id, full_name, profile_id').eq('id', id).maybeSingle()
  if (readErr) return { ok: false, message: readErr.message }
  if (!person) return { ok: false, message: 'That person is not yours to change.' }

  const mine = !!person.profile_id && person.profile_id === session.userId
  const name = one(form, 'full_name')
  if (form.has('full_name') && !name) return { ok: false, message: 'A person needs a name.' }

  // Only what the form actually carried. The self form does not post a role or
  // a department, and a patch built from every key would send nulls for them.
  const patch: Record<string, unknown> = {}
  if (name) patch.full_name = name
  if (form.has('phone')) patch.phone = one(form, 'phone')
  if (form.has('role_title')) patch.role_title = one(form, 'role_title')
  if (form.has('entity_id')) patch.entity_id = one(form, 'entity_id')
  if (form.has('department_id')) patch.department_id = one(form, 'department_id')
  if (form.has('location_id')) patch.location_id = one(form, 'location_id')
  if (form.has('manager_id')) {
    const mgr = one(form, 'manager_id')
    // Their own manager is a loop, and a loop is how an org chart hangs.
    if (mgr === id) return { ok: false, message: 'Somebody cannot manage themselves.' }
    patch.manager_id = mgr
  }

  if (Object.keys(patch).length) {
    // A FOR ALL policy refuses by changing nothing and raising nothing, so the
    // rows that came back are the only honest count.
    const { data: hit, error } = await db.schema('hopper').from('person')
      .update(patch).eq('id', id).select('id')
    if (error) {
      return {
        ok: false,
        message: /row-level security|permission/i.test(error.message)
          ? 'Only this person or an administrator of their organization may change this.'
          : error.message,
      }
    }
    if (!hit?.length) return { ok: false, message: 'That is not yours to change.' }
  }

  // Their own name, where the platform is the one holding it.
  if (mine && name && person.profile_id) {
    const { error } = await db.schema('beebee').from('profiles')
      .update({ full_name: name }).eq('id', person.profile_id)
    if (error) {
      return { ok: false, message: `Saved, except the name: ${error.message}` }
    }
  }

  // The other half of the same form. saveProfile reads the same FormData and
  // owns hopper.person_profile, including the validation of a birthday that is
  // a day with no month.
  if (form.has('birth_month') || form.has('candy') || form.has('song_title')) {
    const answers = await saveProfile(null, form)
    if (!answers.ok) return answers
  }

  if (Object.keys(patch).length || name) {
    await logAudit(db, {
      account_id: session.accountId, kind: 'person',
      object: name ?? person.full_name, object_id: id,
      summary: mine ? 'Edited their own details' : `Edited ${name ?? person.full_name}`,
    })
  }

  revalidatePath(`/people/${id}`); revalidatePath('/people'); revalidatePath('/admin/people')
  return { ok: true, message: 'Saved.' }
}
