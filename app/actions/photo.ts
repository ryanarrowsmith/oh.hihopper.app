'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import type { Result } from '@/app/actions/admin'

/**
 * A face, stored square and stored once.
 *
 * The browser sends a 1024x1024 JPEG it has already cropped, so there is
 * exactly one file per person and every size in the product is a scale of it:
 * 30px in a table row, 38 in a list, 72 on a card, 132 on their own page, and
 * whatever comes next. Cropping on the way in rather than on the way out means
 * the person chooses what the circle contains -- a face is not reliably in the
 * middle of a photograph, and centre-cropping other people's heads is a poor
 * default to ship.
 *
 * The path is <account>/<person>.jpg and it is overwritten, which is what the
 * storage policies were written around: people_photo_write proves the folder
 * is your account, that the person in the filename belongs to that account,
 * and that you are either that person or somebody who may edit the roster. The
 * same clause guards the replacement and the removal. Nothing here re-checks
 * it -- the database is the one that says no.
 *
 * photo_url is stored as this app's own route rather than a storage URL,
 * because the bucket is private and a signed URL expires. Every consumer
 * already takes a plain string, so nothing else in the product had to change.
 * The ?v= is the moment it was written: a new photograph is a new URL, which
 * is the only cache-busting that actually works across a CDN.
 */
const MAX = 3 * 1024 * 1024

export async function savePhoto(_prev: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }

  const person_id = (form.get('person_id') ?? '').toString().trim()
  if (!person_id) return { ok: false, message: 'No person to save against.' }

  const file = form.get('photo')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'No picture came through.' }
  }
  if (file.size > MAX) return { ok: false, message: 'That picture is too big.' }

  const db = supabaseServer()
  const path = `${session.accountId}/${person_id}.jpg`

  const { error: up } = await db.storage.from('people')
    .upload(path, file, { contentType: 'image/jpeg', upsert: true })
  if (up) {
    return {
      ok: false,
      message: /row-level security|permission|Unauthorized/i.test(up.message)
        ? 'Only this person, or somebody who may edit the roster, can change this picture.'
        : up.message,
    }
  }

  const { error } = await db.schema('hopper').from('person')
    .update({ photo_url: `/api/photo/${person_id}?v=${Date.now()}` })
    .eq('id', person_id)
  if (error) {
    return {
      ok: false,
      message: /row-level security|permission/i.test(error.message)
        ? 'The picture uploaded, but Hopper was not allowed to put it on the record.'
        : error.message,
    }
  }

  revalidatePath(`/people/${person_id}`)
  revalidatePath('/people')
  return { ok: true, message: 'Saved.' }
}

/** Back to initials. The file goes too -- a face nobody is showing should not sit in a bucket. */
export async function clearPhoto(_prev: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }
  const person_id = (form.get('person_id') ?? '').toString().trim()
  if (!person_id) return { ok: false, message: 'No person to save against.' }

  const db = supabaseServer()
  const { error } = await db.schema('hopper').from('person')
    .update({ photo_url: null }).eq('id', person_id)
  if (error) {
    return {
      ok: false,
      message: /row-level security|permission/i.test(error.message)
        ? 'Only this person, or somebody who may edit the roster, can change this picture.'
        : error.message,
    }
  }
  await db.storage.from('people').remove([`${session.accountId}/${person_id}.jpg`])

  revalidatePath(`/people/${person_id}`)
  revalidatePath('/people')
  return { ok: true, message: 'Removed.' }
}
