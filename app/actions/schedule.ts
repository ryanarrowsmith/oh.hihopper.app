'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { tell } from '@/lib/notify'
import { endsOn, digWindow } from '@/lib/booking'
import { loadCloseout } from '@/lib/schedule'
import type { Result } from '@/app/actions/admin'

/**
 * Booking a job, and closing it out.
 *
 * Nothing here re-checks permission in JavaScript. Every write goes through the
 * signed-in person's own session and `internal.hopper_fence_edits(account, job,
 * 'schedule' | 'closeout')` is what permits or refuses it — which is also what
 * makes the seal beat an administrator, because it is the one function every
 * write path asks.
 *
 * AN RLS-REFUSED UPDATE MATCHES ZERO ROWS RATHER THAN RAISING, so every write
 * below looks at what came back. "Saved" when nothing was written is the worst
 * possible answer on a screen somebody plans three people's week around.
 *
 * NOTHING HERE REFUSES A DATE. Ryan's call, 14 Sep: the 811 window WARNS. A
 * hard block sounds safer and is not — the date a customer can take is sometimes
 * the date, and a screen that refuses it gets worked around, which is the
 * failure the block was supposed to prevent. So a start outside the window is
 * saved, and the warning is computed from the dates every time anybody looks.
 */

async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId, person: session.personId }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const date = /^\d{4}-\d{2}-\d{2}$/

function refused(msg: string, what: string) {
  return /row-level security|permission denied|violates/i.test(msg)
    ? `That is not yours to change. The ${what} is either sealed or somebody else's.`
    : msg
}

// --------------------------------------------------------------- the schedule
/**
 * The dates and the crew, saved together.
 *
 * Together because they decide each other: the duration comes off the crew's
 * size, and the finish comes off the duration. Saving them in three acts would
 * mean three moments where the job says something that is not true yet.
 */
export async function saveBooking(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const starts = nul(form, 'starts_on')
  if (starts && !date.test(starts)) return { ok: false, message: 'That start date did not arrive as a date.' }
  const raw = str(form, 'days_on_site')
  const days = raw ? Math.round(Number(raw)) : null
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 90)) {
    return { ok: false, message: 'Days on site has to be between one and ninety.' }
  }
  const crew = nul(form, 'crew')

  /* The finish is worked out here rather than typed, and STORED rather than
     derived at read time: a job that ran long has to be able to say so
     afterwards, and a derived figure would quietly rewrite that the moment
     somebody corrected the duration. */
  const { data, error } = await db.schema('hopper').from('fence_job').update({
    starts_on: starts, days_on_site: days,
    ends_on: endsOn(starts, days),
    crew: crew ? crew.slice(0, 60) : null,
  }).eq('account_id', account).eq('id', job).select('id, ref')

  if (error) return { ok: false, message: refused(error.message, 'schedule') }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was saved. The schedule is either sealed or not yours to set.' }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: starts
      ? `Pencilled ${(data as any[])[0].ref} for ${starts}`
        + (days ? `, ${days} day${days === 1 ? '' : 's'}` : '')
        + (crew ? `, ${crew}` : '')
      : `Cleared the dates on ${(data as any[])[0].ref}`,
  })
  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/schedule`)
  return { ok: true, message: 'Saved.' }
}

/**
 * Book it: tell the crew, put it on the calendar, open close-out.
 *
 * Separate from saving the dates because it is a different act. Pencilling a
 * date is a thought; booking it is a promise three people arrange their week
 * around, and the screen should not be able to make that promise by accident.
 */
export async function bookJob(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const { data: row } = await db.schema('hopper').from('fence_job')
    .select('ref, name, starts_on, ends_on, days_on_site, crew, booked_at')
    .eq('account_id', account).eq('id', job).maybeSingle()
  const j: any = row
  if (!j) return { ok: false, message: 'That job is not here.' }
  if (!j.starts_on) return { ok: false, message: 'Give it a start date first.' }
  if (!j.crew) return { ok: false, message: 'Say which crew builds it first.' }

  const { data, error } = await db.schema('hopper').from('fence_job').update({
    booked_at: new Date().toISOString(), booked_by: person,
  }).eq('account_id', account).eq('id', job).select('id')
  if (error) return { ok: false, message: refused(error.message, 'schedule') }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was booked. The schedule is either sealed or not yours to set.' }
  }

  // The stage moves only from `schedule`, so re-booking a job that has already
  // gone further does not drag it backwards.
  await db.schema('hopper').from('fence_job')
    .update({ stage: 'sow' })
    .eq('account_id', account).eq('id', job).eq('stage', 'schedule')

  /* The warning travels rather than being dismissed here. Somebody who books
     outside the locate window has decided to; the person who would be standing
     over a shovel has not heard about it yet. */
  const { data: survey } = await db.schema('hopper').from('fence_survey')
    .select('dig_from, locate_expires').eq('account_id', account).eq('job_id', job).maybeSingle()
  const w = digWindow({
    startsOn: j.starts_on,
    digFrom: (survey as any)?.dig_from ?? null,
    locateExpires: (survey as any)?.locate_expires ?? null,
  })

  const dates = `${j.starts_on}`
    + (j.ends_on && j.ends_on !== j.starts_on ? ` to ${j.ends_on}` : '')
  const dig = w.state === 'expired'
    ? ' The locate ticket expires before this start — 811 has to be called again before a truck digs.'
    : w.state === 'early'
    ? ' This start is before the locate matures, so it is not clear to dig yet.'
    : ''
  for (const id of await roleIds(db, account, 'field')) {
    await tell(id, 'status', `${j.ref} is booked — ${dates}`, `/fence/${job}`, {
      body: `${j.crew}.${dig}`, object: j.name, objectId: job,
    })
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: j.ref, object_id: job,
    summary: `Booked ${j.ref} for ${j.starts_on}, ${j.crew}`
      + (w.state === 'clear' ? '' : ` — outside the locate window (${w.state})`),
    payload: { starts_on: j.starts_on, ends_on: j.ends_on, crew: j.crew, window: w.state },
  })
  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/schedule`)
  return { ok: true, message: 'Booked.' }
}

/**
 * The crew's ticket. One live link at a time, by construction.
 *
 * Cycling is destructive and says so on the screen: the old address dies for
 * everybody holding it. What the crew has already ticked and photographed is
 * kept — the link is a door, not the record.
 */
export async function issueTicket(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }
  const lang = str(form, 'lang') === 'en' ? 'en' : 'es'

  const { error: off } = await db.schema('hopper').from('fence_ticket_link')
    .update({ revoked: true, cycled_why: nul(form, 'why') })
    .eq('account_id', account).eq('job_id', job).eq('revoked', false)
  if (off) return { ok: false, message: refused(off.message, 'ticket') }

  const { data, error } = await db.schema('hopper').from('fence_ticket_link')
    .insert({ account_id: account, job_id: job, lang, issued_by: person })
    .select('token').maybeSingle()
  if (error) return { ok: false, message: refused(error.message, 'ticket') }
  if (!data) return { ok: false, message: 'No link was issued. Issuing crew tickets is not yours to do.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: `Issued a crew ticket link in ${lang === 'es' ? 'Spanish' : 'English'}`,
  })
  revalidatePath(`/fence/${job}/schedule`)
  return { ok: true, message: 'Saved.' }
}

export async function revokeTicket(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const { data, error } = await db.schema('hopper').from('fence_ticket_link')
    .update({ revoked: true, cycled_why: nul(form, 'why') })
    .eq('account_id', account).eq('job_id', job).eq('revoked', false).select('id')
  if (error) return { ok: false, message: refused(error.message, 'ticket') }
  if ((data ?? []).length === 0) return { ok: false, message: 'There was no live link to take down.' }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: 'Took down the crew ticket link',
  })
  revalidatePath(`/fence/${job}/schedule`)
  return { ok: true, message: 'Saved.' }
}

// --------------------------------------------------------------- the close-out
/**
 * What actually got built, run by run, and why it moved — in the same row.
 *
 * The whole list saves as one act, the way the walked figures do: a crew walked
 * one fence and the person recording it is answering one question, not four.
 *
 * A BLANK IS NOT ZERO. It means nobody has recorded that run yet, and the row is
 * removed rather than stored as nought — a job showing 0 ft built on a fence
 * that is standing is worse than a job showing nothing.
 */
export async function saveBuilt(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  type In = { run_id?: string; built?: number | null; why?: string | null }
  let sent: In[]
  try { sent = JSON.parse(str(form, 'runs')) } catch {
    return { ok: false, message: 'The runs did not arrive in one piece.' }
  }
  if (!Array.isArray(sent) || sent.length > 24) {
    return { ok: false, message: 'The runs did not arrive in one piece.' }
  }

  const rows: { account_id: string; job_id: string; run_id: string
                built_ft: number; why: string | null }[] = []
  const empty: string[] = []
  for (const r of sent) {
    if (!r.run_id || !uuid.test(r.run_id)) continue
    const ft = r.built == null || r.built === ('' as unknown) ? null : Number(r.built)
    if (ft == null || !Number.isFinite(ft) || ft < 0) { empty.push(r.run_id); continue }
    rows.push({
      account_id: account, job_id: job, run_id: r.run_id,
      built_ft: Math.round(ft * 10) / 10,
      why: r.why ? String(r.why).slice(0, 400) : null,
    })
  }

  if (rows.length) {
    const { data, error } = await db.schema('hopper').from('fence_closeout_run')
      .upsert(rows, { onConflict: 'run_id' }).select('id')
    if (error) return { ok: false, message: refused(error.message, 'close-out') }
    if ((data ?? []).length === 0) {
      return { ok: false, message: 'Nothing was saved. Close-out is either sealed or not yours.' }
    }
  }
  if (empty.length) {
    await db.schema('hopper').from('fence_closeout_run')
      .delete().eq('account_id', account).eq('job_id', job).in('run_id', empty)
  }

  revalidatePath(`/fence/${job}/closeout`)
  return { ok: true, message: 'Saved.' }
}

/** Who walked it, what they said, and what accounting is being told. */
export async function saveCloseout(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const on = nul(form, 'walked_on')
  if (on && !date.test(on)) return { ok: false, message: 'That walk date did not arrive as a date.' }
  const held = str(form, 'price_held')

  const { data, error } = await db.schema('hopper').from('fence_closeout')
    .upsert({
      account_id: account, job_id: job,
      walked_with: nul(form, 'walked_with'),
      walked_on: on,
      they_said: nul(form, 'they_said'),
      note: nul(form, 'note'),
      // Null until somebody says. Built short of what was sold means either the
      // price comes down or somebody agreed to hold it, and billing must not be
      // the one deciding which.
      price_held: held === 'held' ? true : held === 'credit' ? false : null,
    }, { onConflict: 'job_id' })
    .select('id')
  if (error) return { ok: false, message: refused(error.message, 'close-out') }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was saved. Close-out is either sealed or not yours.' }
  }

  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/closeout`)
  return { ok: true, message: 'Saved.' }
}

/**
 * Close it out and release it to billing.
 *
 * CLOSING WITH A STEP OPEN IS ALLOWED AND RECORDED. Refusing would mean a
 * project manager ticks a box they did not do, which is worse than a job that
 * honestly says one thing is outstanding.
 *
 * A job built short of what was sold is the one thing this does refuse without
 * an answer, because the answer is not billing's to guess: either the price
 * comes down or somebody agreed to hold it.
 */
export async function closeOut(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const read = await loadCloseout(account, job)
  if (!read.job) return { ok: false, message: 'That job is not here.' }
  if (read.closeout?.closed_at) return { ok: false, message: 'This job is already closed out.' }
  if (!read.anyBuilt) {
    return { ok: false, message: 'Nothing is recorded as built yet, so there is nothing to hand over.' }
  }
  if (read.short < 0 && read.closeout?.price_held == null) {
    return { ok: false, message:
      `Built ${Math.abs(read.short)} ft short of what was sold. Say whether the price is held `
      + 'or the customer is credited — billing will not decide it for you.' }
  }

  const open = read.tasks.filter((t: any) => !t.done).length

  const { data, error } = await db.schema('hopper').from('fence_closeout')
    .upsert({
      account_id: account, job_id: job,
      closed_at: new Date().toISOString(), closed_by: person,
    }, { onConflict: 'job_id' })
    .select('id')
  if (error) return { ok: false, message: refused(error.message, 'close-out') }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was closed. Close-out is either sealed or not yours.' }
  }

  await db.schema('hopper').from('fence_job')
    .update({ stage: 'billing' })
    .eq('account_id', account).eq('id', job).eq('stage', 'closeout')

  const ref = (read.job as any).ref
  const says = (read.short < 0
    ? `Built ${Math.abs(read.short)} ft short of what was sold — `
      + `${read.closeout?.price_held ? 'the price is held' : 'the customer is credited'}. `
    : '')
    + (open ? `${open} step${open === 1 ? '' : 's'} still open on the walk. ` : '')
    + (read.closeout?.note ?? '')
  for (const id of await roleIds(db, account, 'billing')) {
    await tell(id, 'status', `${ref} is closed out and ready to bill`, `/fence/${job}/billing`, {
      body: says.trim() || null, object: (read.job as any).name, objectId: job,
    })
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object: (read.job as any).ref, object_id: job,
    summary: `Closed out ${(read.job as any).ref} at ${Math.round(read.builtFt)} ft built`
      + (open ? `, ${open} step${open === 1 ? '' : 's'} left open` : ''),
    payload: { built_ft: read.builtFt, sold_ft: read.soldFt, short: read.short, open },
  })
  revalidatePath(`/fence/${job}`); revalidatePath(`/fence/${job}/closeout`)
  return { ok: true, message: 'Closed out.' }
}

/** Everybody holding one of the four fence job roles. The roster is read here
 *  rather than passed in, so a caller cannot narrow it by accident and quietly
 *  stop telling half the company. */
async function roleIds(db: any, account: string, role: string): Promise<string[]> {
  const { data } = await db.schema('hopper').from('fence_person')
    .select('person_id').eq('account_id', account).eq('job_role', role)
  return ((data ?? []) as any[]).map((p) => p.person_id as string)
}
