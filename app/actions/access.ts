'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

/**
 * Whether somebody may sign in.
 *
 * This existed nowhere, and its absence had a consequence nobody had noticed:
 * beebee.my_apps() decides who may open Hopper by reading app_access.status
 * alone, and knows nothing about hopper.person.active. So making somebody
 * inactive took them off every list and left them able to sign in and read the
 * business for as long as they liked.
 *
 * Access is the platform's word about a person, so this asks rather than
 * writing beebee.app_access itself -- grant_app and revoke_app both refuse
 * anybody who is not staff or an admin of the account, and neither rule is
 * repeated here. Suspended, never deleted: the row keeps its date and its
 * role, so giving access back is one call and not a reconstruction.
 */
export async function setSignIn(_prev: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }

  const id = (form.get('id') ?? '').toString().trim()
  const allow = form.get('allow') === 'true'
  if (!id) return { ok: false, message: 'Nobody to change.' }

  const db = supabaseServer()
  const { data: person, error: readErr } = await db.schema('hopper').from('person')
    .select('id, full_name, profile_id').eq('id', id).maybeSingle()
  if (readErr) return { ok: false, message: readErr.message }
  if (!person) return { ok: false, message: 'That person is not yours to change.' }
  if (!person.profile_id) {
    return {
      ok: false,
      message: `${person.full_name} has no login yet — invite them and there will be something to switch off.`,
    }
  }
  if (person.profile_id === session.userId) {
    return { ok: false, message: 'You cannot take your own access away.' }
  }

  const { error } = allow
    ? await db.schema('beebee').rpc('grant_app', {
        target_account: session.accountId, target_app: 'hopper',
        target_user: person.profile_id, member_role: 'member',
      })
    : await db.schema('beebee').rpc('revoke_app', {
        target_account: session.accountId, target_app: 'hopper',
        target_user: person.profile_id,
      })
  if (error) return { ok: false, message: error.message }

  await logAudit(db, {
    account_id: session.accountId, kind: 'person',
    object: person.full_name, object_id: id,
    summary: allow
      ? `Let ${person.full_name} sign in to Hopper again`
      : `Stopped ${person.full_name} signing in to Hopper`,
  })

  revalidatePath('/admin/people'); revalidatePath('/people'); revalidatePath(`/people/${id}`)
  return {
    ok: true,
    message: allow
      ? `${person.full_name} can sign in again.`
      : `${person.full_name} can no longer sign in. Their account is kept — switch it back on and they are in.`,
  }
}
