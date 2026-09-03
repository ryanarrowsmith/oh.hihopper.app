'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

/**
 * Subscribe to somebody else's calendar.
 *
 * The address is checked here rather than only when the sweep first tries it,
 * because a typo that fails silently for an hour is a person concluding Hopper
 * is broken. Only the SHAPE is checked -- whether it answers is the sweep's job.
 */
export async function addFeed(_p: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session?.personId) return { ok: false, message: 'Not signed in.' }

  const name = (form.get('name') ?? '').toString().trim()
  const url = (form.get('url') ?? '').toString().trim()
  const colour = (form.get('colour') ?? '--s3').toString()
  if (!name || !url) return { ok: false, message: 'It needs a name and an address.' }

  let parsed: URL
  try { parsed = new URL(url.replace(/^webcal:\/\//i, 'https://')) }
  catch { return { ok: false, message: 'That is not an address Hopper can read.' } }
  // webcal:// is the same thing wearing a different scheme, and it is what
  // Google and Apple hand you when you click "subscribe".
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, message: 'The address has to start with https.' }
  }

  const db = supabaseServer()
  const { error } = await db.schema('hopper').from('calendar_feed').insert({
    account_id: session.accountId, name, url: parsed.toString(),
    colour, added_by: session.personId,
  })
  if (error) {
    return { ok: false, message: /duplicate key/i.test(error.message)
      ? 'That calendar is already subscribed.'
      : /row-level security/i.test(error.message)
      ? 'Subscribing points Hopper at an address, so it is limited to the people who decide what Hopper reads.'
      : error.message }
  }

  await logAudit(db, { account_id: session.accountId, kind: 'calendar', object: name,
    summary: `Subscribed to the calendar ${name}`, note: parsed.toString() })

  revalidatePath('/calendar'); revalidatePath('/calendar/subscribe')
  return { ok: true, message: `${name} added. Hopper will read it on the next sweep.` }
}

export async function removeFeed(form: FormData) {
  const session = await currentSession()
  if (!session) return
  const id = (form.get('id') ?? '').toString()
  if (!id) return

  const db = supabaseServer()
  const { data: gone } = await db.schema('hopper').from('calendar_feed')
    .select('name').eq('id', id).maybeSingle()
  // The events go with it by cascade: a feed IS its contents, and leaving them
  // behind would be a calendar showing meetings from a source nobody can find.
  await db.schema('hopper').from('calendar_feed').delete().eq('id', id)

  if (gone) {
    await logAudit(db, { account_id: session.accountId, kind: 'calendar', object: gone.name,
      summary: `Unsubscribed from the calendar ${gone.name}` })
  }
  revalidatePath('/calendar'); revalidatePath('/calendar/subscribe')
}

/**
 * An event somebody typed.
 *
 * The day arrives as the string the date field produced -- 2026-09-14 -- and is
 * stored as exactly that. The times arrive as HH:MM and are stored as minutes
 * past midnight. Neither is turned into a moment in time on the way in, because
 * the moment would be this server's moment and the person meant theirs.
 */
export async function addEvent(_p: Result | null, form: FormData): Promise<Result> {
  const session = await currentSession()
  if (!session?.personId) return { ok: false, message: 'Not signed in.' }

  const str = (k: string) => (form.get(k) ?? '').toString().trim()
  const title = str('title')
  const day = str('day')
  const allDay = str('all_day') === 'on'
  const entityId = str('entity_id') || null

  if (!title) return { ok: false, message: 'It needs a name.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, message: 'It needs a day.' }

  // A time field hands back HH:MM or nothing. Nothing means all day, which is
  // also what the toggle means, so the two agree rather than argue.
  const mins = (k: string) => {
    const v = str(k)
    const m = /^(\d{1,2}):(\d{2})$/.exec(v)
    if (!m) return null
    const n = Number(m[1]) * 60 + Number(m[2])
    return n >= 0 && n <= 1440 ? n : null
  }
  const startMin = allDay ? null : mins('start_at')
  const endMin = allDay || startMin == null ? null : mins('end_at')
  if (endMin != null && endMin <= startMin!) {
    return { ok: false, message: 'It has to end after it starts.' }
  }

  const db = supabaseServer()
  const { error } = await db.schema('hopper').from('event').insert({
    account_id: session.accountId, entity_id: entityId, title, day,
    start_min: startMin, end_min: endMin,
    location: str('location') || null, notes: str('notes') || null,
    created_by: session.personId,
  })
  if (error) {
    return { ok: false, message: /row-level security/i.test(error.message)
      ? 'That organization is not one you can add to.'
      : error.message }
  }

  await logAudit(db, { account_id: session.accountId, kind: 'calendar', object: title,
    summary: `Added the event ${title} on ${day}` })

  revalidatePath('/calendar')
  return { ok: true, message: `${title} is on the calendar.` }
}
