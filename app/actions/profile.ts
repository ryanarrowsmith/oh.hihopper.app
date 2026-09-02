'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import type { Result } from '@/app/actions/admin'

/**
 * Get to know me, saved.
 *
 * Like every other write in Hopper this goes through the signed-in person's
 * own session, so RLS is what permits or refuses it -- person_profile_write
 * says your own row, or a row in an organization you administer, and nothing
 * here re-checks that in JavaScript. A second copy of "who may do this" is a
 * second place to be wrong.
 *
 * The looked-up answers arrive already resolved: the form did the search, the
 * person picked one, and the pieces it needs to draw itself come along with
 * it. Nothing is fetched from a third party at save time, so a save cannot
 * fail because somebody else's service was slow.
 */
const one = (f: FormData, k: string) => {
  const v = f.get(k)
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
const num = (f: FormData, k: string) => {
  const s = one(f, k)
  if (s === null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
/** Only ever https, and only ever from a search -- the check the table makes. */
const link = (f: FormData, k: string) => {
  const s = one(f, k)
  return s && /^https:\/\/[^\s]+$/.test(s) ? s : null
}

export async function saveProfile(_prev: Result | null, form: FormData): Promise<Result> {
  const db = supabaseServer()
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }
  const person_id = one(form, 'person_id')
  if (!person_id) return { ok: false, message: 'No person to save against.' }

  const month = num(form, 'birth_month')
  if (month !== null && (month < 1 || month > 12)) {
    return { ok: false, message: 'A birthday month is 1 to 12.' }
  }

  const row = {
    person_id,
    account_id: session.accountId,
    birth_month: month,
    favorite_color: one(form, 'favorite_color'),

    candy: one(form, 'candy'),
    candy_img_url: link(form, 'candy_img_url'),
    candy_url: link(form, 'candy_url'),

    restaurant_name: one(form, 'restaurant_name'),
    restaurant_address: one(form, 'restaurant_address'),
    restaurant_lat: num(form, 'restaurant_lat'),
    restaurant_lng: num(form, 'restaurant_lng'),
    restaurant_url: link(form, 'restaurant_url'),

    song_title: one(form, 'song_title'),
    song_artist: one(form, 'song_artist'),
    song_art_url: link(form, 'song_art_url'),
    song_url: link(form, 'song_url'),

    movie_title: one(form, 'movie_title'),
    movie_year: num(form, 'movie_year'),
    movie_art_url: link(form, 'movie_art_url'),
    movie_url: link(form, 'movie_url'),

    book_title: one(form, 'book_title'),
    book_author: one(form, 'book_author'),
    book_cover_url: link(form, 'book_cover_url'),
    book_url: link(form, 'book_url'),

    updated_at: new Date().toISOString(),
  }

  const { error } = await db.schema('hopper').from('person_profile')
    .upsert(row, { onConflict: 'person_id' })

  if (error) {
    // A refusal is almost always the policy rather than the data, and saying
    // which is kinder than passing on a constraint name.
    return {
      ok: false,
      message: /row-level security|permission/i.test(error.message)
        ? 'Only this person or an administrator of their organization may change this.'
        : error.message,
    }
  }

  revalidatePath(`/people/${person_id}`)
  revalidatePath('/people')
  return { ok: true, message: 'Saved.' }
}
