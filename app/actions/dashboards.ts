'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import type { Result } from '@/app/actions/admin'

/**
 * A dashboard is somebody's own page of reports.
 *
 * Not the account's, not a department's: one person's, with an owner, which is
 * why every write below proves ownership through hopper.person rather than
 * through a permission. A dashboard nobody owns is a dashboard nobody tidies.
 *
 * Sharing is the exception and it is deliberately two things, not one. `shared`
 * says the owner is willing to show it; a dashboard_share row says who to. Both
 * are required, so turning sharing off hides it from everybody at once without
 * losing the list of who had it -- and turning it back on does not re-share it
 * with somebody who was removed in between.
 *
 * Nothing here re-checks who may do what. The policies do, and a second copy of
 * that in JavaScript is a second place to be wrong.
 */
async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  if (!session.personId) throw new Error('You have no person record in Hopper yet.')
  return { db: supabaseServer(), account: session.accountId, me: session.personId }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()

function refused(message: string) {
  if (/duplicate key/i.test(message)) return 'You already have a dashboard by that name.'
  if (/row-level security|permission denied/i.test(message)) {
    return 'That is not yours to change.'
  }
  return message
}

export async function createDashboard(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, me } = await ctx()
  const title = str(form, 'title')
  if (!title) return { ok: false, message: 'It needs a name.' }

  const { data, error } = await db.schema('hopper').from('dashboard')
    .insert({ account_id: account, owner_id: me, title }).select('id').single()
  if (error) return { ok: false, message: refused(error.message) }

  await logAudit(db, { account_id: account, kind: 'report', object: title,
    object_id: data.id, summary: `Added the dashboard ${title}` })
  revalidatePath('/dashboards')
  return { ok: true, message: `${title} added.` }
}

export async function renameDashboard(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  const title = str(form, 'title')
  if (!id || !title) return { ok: false, message: 'It needs a name.' }

  const { error } = await db.schema('hopper').from('dashboard')
    .update({ title, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, message: refused(error.message) }

  await logAudit(db, { account_id: account, kind: 'report', object: title,
    object_id: id, summary: `Renamed a dashboard to ${title}` })
  revalidatePath('/dashboards'); revalidatePath(`/dashboards/${id}`)
  return { ok: true, message: 'Saved.' }
}

export async function deleteDashboard(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  const title = str(form, 'title')

  // The cards and the shares go with it by cascade. Saying so rather than
  // discovering it: this is the only destructive action on these screens.
  const { error } = await db.schema('hopper').from('dashboard').delete().eq('id', id)
  if (error) return { ok: false, message: refused(error.message) }

  await logAudit(db, { account_id: account, kind: 'report', object: title,
    object_id: id, summary: `Removed the dashboard ${title}` })
  revalidatePath('/dashboards')
  return { ok: true, message: 'Removed.' }
}

/** Put a report on, or take it off. One call, because it is one decision. */
export async function toggleCard(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const dashboard_id = str(form, 'dashboard_id')
  const report_id = str(form, 'report_id')
  const on = str(form, 'on') === '1'
  if (!dashboard_id || !report_id) return { ok: false, message: 'Nothing to put on it.' }

  if (!on) {
    const { error } = await db.schema('hopper').from('dashboard_card')
      .delete().eq('dashboard_id', dashboard_id).eq('report_id', report_id)
    if (error) return { ok: false, message: refused(error.message) }
  } else {
    // The end of the list, worked out from what is there rather than from a
    // counter -- a counter and a delete disagree the first time somebody
    // removes a card from the middle.
    const { data: last } = await db.schema('hopper').from('dashboard_card')
      .select('position').eq('dashboard_id', dashboard_id)
      .order('position', { ascending: false }).limit(1).maybeSingle()

    const { error } = await db.schema('hopper').from('dashboard_card').insert({
      account_id: account, dashboard_id, report_id,
      position: (last?.position ?? -1) + 1, size: 'lg',
    })
    if (error) return { ok: false, message: refused(error.message) }
  }

  revalidatePath(`/dashboards/${dashboard_id}`)
  return { ok: true, message: on ? 'Added.' : 'Removed.' }
}

/** The whole order at once: a drag lands as one write, not one per card. */
export async function reorderCards(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const dashboard_id = str(form, 'dashboard_id')
  const order = str(form, 'order').split(',').filter(Boolean)
  if (!dashboard_id || order.length === 0) return { ok: false, message: 'Nothing to reorder.' }

  // The existing sizes are read and carried, because an upsert writes the
  // whole row: reordering with a hard-coded size would silently reset every
  // card's size the first time somebody sets one. Nothing sets one yet, which
  // is exactly when this is cheap to get right.
  const { data: had } = await db.schema('hopper').from('dashboard_card')
    .select('report_id, size').eq('dashboard_id', dashboard_id)
  const sizeOf = new Map((had ?? []).map((c: any) => [c.report_id, c.size as string]))

  const rows = order
    .filter((report_id) => sizeOf.has(report_id))   // only cards already on it
    .map((report_id, i) => ({
      account_id: account, dashboard_id, report_id,
      position: i, size: sizeOf.get(report_id)!,
    }))
  if (rows.length === 0) return { ok: true, message: 'Nothing moved.' }
  const { error } = await db.schema('hopper').from('dashboard_card')
    .upsert(rows, { onConflict: 'dashboard_id,report_id' })
  if (error) return { ok: false, message: refused(error.message) }

  revalidatePath(`/dashboards/${dashboard_id}`)
  return { ok: true, message: 'Saved.' }
}

/**
 * Who it is shown to.
 *
 * The whole list arrives at once and replaces what was there, because the form
 * that sends it shows the whole list -- a diff computed here from a form that
 * already knows the answer is arithmetic nobody asked for. `shared` follows the
 * list: sharing with nobody and calling it shared is a state with no meaning.
 */
export async function setShares(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const dashboard_id = str(form, 'dashboard_id')
  const people = new Set(form.getAll('person_id').map((v) => v.toString()).filter(Boolean))

  const del = await db.schema('hopper').from('dashboard_share')
    .delete().eq('dashboard_id', dashboard_id)
  if (del.error) return { ok: false, message: refused(del.error.message) }

  if (people.size > 0) {
    const ins = await db.schema('hopper').from('dashboard_share').insert(
      [...people].map((person_id) => ({ account_id: account, dashboard_id, person_id })))
    if (ins.error) return { ok: false, message: refused(ins.error.message) }
  }

  const up = await db.schema('hopper').from('dashboard')
    .update({ shared: people.size > 0, updated_at: new Date().toISOString() })
    .eq('id', dashboard_id)
  if (up.error) return { ok: false, message: refused(up.error.message) }

  await logAudit(db, { account_id: account, kind: 'access', object_id: dashboard_id,
    summary: people.size === 0
      ? 'Stopped sharing a dashboard'
      : `Shared a dashboard with ${people.size} ${people.size === 1 ? 'person' : 'people'}`,
    payload: { people: [...people] } })

  revalidatePath('/dashboards'); revalidatePath(`/dashboards/${dashboard_id}`)
  return { ok: true, message: people.size === 0 ? 'Only you now.' : 'Saved.' }
}
