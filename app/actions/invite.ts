'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

/**
 * Give somebody a login.
 *
 * Until now Hopper had no way to do this at all: the roster carried a column
 * saying whether a person could sign in, and nothing anywhere could change it.
 * Worse, it printed "Invited" for anybody with an email address, which read as
 * an invitation somebody had sent when nobody had.
 *
 * Three things have to happen and only the first needs power this app does not
 * have -- creating the login. So that one step goes to the invite-member edge
 * function, which holds the service role, and the other two (membership, then
 * access to Hopper) are asked as the signed-in person by the same function, so
 * the platform's own rule about who may add somebody is the only rule there
 * is. Hopper does the fourth thing itself: filing the new id onto the person,
 * which is an ordinary roster write and needs no special power.
 *
 * The mail is Supabase Auth's invitation, addressed by the auth hook to the
 * same sender everything else in Oh hi comes from.
 */
export async function invitePerson(_prev: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }

  const id = (form.get('id') ?? '').toString().trim()
  if (!id) return { ok: false, message: 'Nobody to invite.' }

  const db = supabaseServer()
  const { data: person, error: readErr } = await db.schema('hopper').from('person')
    .select('id, full_name, email, profile_id').eq('id', id).maybeSingle()
  if (readErr) return { ok: false, message: readErr.message }
  if (!person) return { ok: false, message: 'That person is not yours to invite.' }
  if (person.profile_id) {
    return { ok: false, message: `${person.full_name} already has a login.` }
  }
  if (!person.email) {
    return {
      ok: false,
      message: `${person.full_name} has no email address on file — add one and the invitation has somewhere to go.`,
    }
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL
  const { data, error } = await db.functions.invoke('invite-member', {
    body: {
      account_id: session.accountId,
      email: person.email,
      name: person.full_name,
      redirect_to: site ? `${site.replace(/\/$/, '')}/sign-in` : undefined,
    },
  })

  // An edge function that answers 4xx reaches supabase-js as a thrown error
  // with the body still attached, so the reason it gave is worth digging out
  // rather than replacing with "something went wrong".
  if (error) {
    let why = error.message
    try {
      const said = await (error as any)?.context?.json?.()
      if (said?.error) why = said.error
    } catch { /* the body was not JSON; the message stands */ }
    return { ok: false, message: why }
  }
  const said = data as { ok?: boolean; user_id?: string; invited?: boolean; error?: string }
  if (!said?.ok || !said.user_id) {
    return { ok: false, message: said?.error ?? 'The invitation did not go out.' }
  }

  // The login exists either way now, so the link is filed either way. A person
  // row still pointing at nothing, next to an account member who can sign in,
  // is the state that makes somebody invite them a second time.
  const { data: hit, error: linkErr } = await db.schema('hopper').from('person')
    .update({ profile_id: said.user_id }).eq('id', id).select('id')
  if (linkErr) return { ok: false, message: linkErr.message }
  if (!hit?.length) {
    return {
      ok: false,
      message: `${person.full_name} can sign in now, but Hopper was not allowed to file the login onto their roster row.`,
    }
  }

  await logAudit(db, {
    account_id: session.accountId, kind: 'person', object: person.full_name, object_id: id,
    summary: said.invited
      ? `Invited ${person.full_name} to sign in`
      : `Gave ${person.full_name}, who already had an Oh hi login, access to Hopper`,
  })

  revalidatePath('/admin/people'); revalidatePath('/people'); revalidatePath(`/people/${id}`)
  return {
    ok: true,
    message: said.invited
      ? `Sent. ${person.full_name} has an email at ${person.email} with a link to set a password.`
      : `${person.full_name} already had an Oh hi login — they can open Hopper now.`,
  }
}
