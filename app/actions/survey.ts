'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { tell } from '@/lib/notify'
import { loadSurvey, conditionTotals } from '@/lib/survey'
import type { Result } from '@/app/actions/admin'

/**
 * The site survey, as writes.
 *
 * Nothing here re-checks permission in JavaScript. Every write goes through the
 * signed-in person's own session and `internal.hopper_fence_edits(account, job,
 * 'survey')` is what permits or refuses it — which also means the seal beats an
 * administrator, because that is the one function every write path asks.
 *
 * AN RLS-REFUSED UPDATE MATCHES ZERO ROWS RATHER THAN RAISING, so every write
 * below looks at what came back. "Saved" when nothing was written is the worst
 * possible answer on a screen whose whole job is to be believed later.
 */

async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId, person: session.personId }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const num = (f: FormData, k: string) => {
  const v = str(f, k); if (!v) return null
  const n = Number(v.replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function refused(msg: string) {
  if (/row-level security|violates row-level/i.test(msg)) {
    return 'The survey is not yours to fill in, or it has been closed.'
  }
  return msg
}

/** The survey row, made on first touch rather than when the job is signed —
 *  a job that never reaches a survey should not carry an empty one. */
async function openSurvey(db: any, account: string, job: string) {
  const had = await db.schema('hopper').from('fence_survey')
    .select('id').eq('account_id', account).eq('job_id', job).maybeSingle()
  if (had.data?.id) return { id: had.data.id as string, error: null as string | null }
  const made = await db.schema('hopper').from('fence_survey')
    .insert({ account_id: account, job_id: job }).select('id').maybeSingle()
  if (made.error) return { id: null, error: refused(made.error.message) }
  if (!made.data) return { id: null, error: 'The survey is not yours to open.' }
  return { id: made.data.id as string, error: null }
}

// ------------------------------------------------------------- what it measured
/**
 * The walked lengths, all of them in one post, the way the drawing saves.
 *
 * A blank field means "nobody corrected this one", which is different from
 * zero: the row is removed rather than stored as null, so the screen shows the
 * drawn figure standing on its own rather than a correction of nothing.
 */
export async function saveWalked(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const opened = await openSurvey(db, account, job)
  if (opened.error) return { ok: false, message: opened.error }

  let sent: { run_id: string; walked?: number | null; grade?: number | null
              measured_by?: string | null; note?: string | null }[]
  try { sent = JSON.parse(str(form, 'runs')) } catch {
    return { ok: false, message: 'The measurements did not arrive in one piece. Nothing was saved.' }
  }
  if (!Array.isArray(sent)) {
    return { ok: false, message: 'The measurements did not arrive in one piece. Nothing was saved.' }
  }

  const keep: string[] = []
  const rows = []
  for (const r of sent) {
    if (!r.run_id || !uuid.test(r.run_id)) continue
    const walked = r.walked == null ? null : Number(r.walked)
    const grade = r.grade == null ? null : Number(r.grade)
    const empty = (walked == null || !Number.isFinite(walked) || walked <= 0)
      && (grade == null || !Number.isFinite(grade))
      && !r.note
    if (empty) continue
    keep.push(r.run_id)
    rows.push({
      account_id: account, job_id: job, run_id: r.run_id,
      walked_ft: walked != null && Number.isFinite(walked) && walked > 0 ? walked : null,
      grade_pct: grade != null && Number.isFinite(grade) && Math.abs(grade) <= 60 ? grade : null,
      measured_by: ['wheel', 'laser', 'plans', 'typed'].includes(String(r.measured_by))
        ? String(r.measured_by) : 'wheel',
      note: r.note || null,
    })
  }

  if (rows.length) {
    const { data, error } = await db.schema('hopper').from('fence_survey_run')
      .upsert(rows, { onConflict: 'run_id' }).select('id')
    if (error) return { ok: false, message: refused(error.message) }
    if ((data ?? []).length === 0) {
      return { ok: false, message: 'Nothing was saved. The survey is either closed or not yours.' }
    }
  }

  // Rows the screen no longer sends — a figure somebody cleared.
  const gone = db.schema('hopper').from('fence_survey_run')
    .delete().eq('account_id', account).eq('job_id', job)
  await (keep.length ? gone.not('run_id', 'in', `(${keep.join(',')})`) : gone)

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: rows.length
      ? `Walked the line: ${rows.length} run${rows.length === 1 ? '' : 's'} measured on site`
      : 'Cleared the walked measurements',
  })
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}`)
  return { ok: true, message: 'Saved.' }
}

// ------------------------------------------------------------ what it had on it
/**
 * One condition, on or off, with its quantity.
 *
 * `where` says which side of the signature this is: the estimate's assumption,
 * or the survey's finding. They are separate tables answering to separate
 * policies, and the difference between them is what the screen shows.
 */
export async function setCondition(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  const condition = str(form, 'condition_id')
  const side = str(form, 'where') === 'quote' ? 'quote' : 'survey'
  if (!uuid.test(job) || !uuid.test(condition)) {
    return { ok: false, message: 'That is not a condition on this job.' }
  }
  const table = side === 'quote' ? 'fence_job_condition' : 'fence_survey_condition'

  if (side === 'survey') {
    const opened = await openSurvey(db, account, job)
    if (opened.error) return { ok: false, message: opened.error }
  }

  const q = db.schema('hopper').from(table)

  if (str(form, 'on') !== 'on') {
    const { error } = await q.delete()
      .eq('account_id', account).eq('job_id', job).eq('condition_id', condition)
    if (error) return { ok: false, message: refused(error.message) }
    revalidatePath(`/fence/${job}/survey`)
    revalidatePath(`/fence/${job}/estimate`)
    return { ok: true, message: 'Taken off.' }
  }

  const qty = num(form, 'qty')
  const { data, error } = await q.upsert({
    account_id: account, job_id: job, condition_id: condition,
    qty: qty != null && qty >= 0 ? qty : null,
    detail: nul(form, 'detail'),
  }, { onConflict: 'job_id,condition_id' }).select('id')

  if (error) return { ok: false, message: refused(error.message) }
  if ((data ?? []).length === 0) {
    return { ok: false, message: side === 'quote'
      ? 'The estimate is sealed, so what it assumed can no longer be changed.'
      : 'Nothing was saved. The survey is either closed or not yours.' }
  }
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}/estimate`)
  return { ok: true, message: 'Saved.' }
}

// --------------------------------------------------- getting on site, and 811
export async function saveAccess(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const opened = await openSurvey(db, account, job)
  if (opened.error) return { ok: false, message: opened.error }

  /* THE LOCATE IS DATES, NOT A TICK. It is the only field on this screen that
     can stop a job legally: dig_from gates scheduling and locate_expires is
     what catches a job that slipped three weeks and would have been dug on a
     dead ticket. So an expiry before the dig date is refused rather than
     stored — a locate that expires before you may dig is not a typo anybody
     wants discovered on site. */
  const from = nul(form, 'dig_from'), ends = nul(form, 'locate_expires')
  if (from && ends && ends < from) {
    return { ok: false, message: 'The locate expires before the clear-to-dig date. One of those dates is wrong.' }
  }

  const { data, error } = await db.schema('hopper').from('fence_survey').update({
    locate_ticket: nul(form, 'locate_ticket'),
    dig_from: from, locate_expires: ends,
    access: nul(form, 'access'),
    ask_for: nul(form, 'ask_for'),
    utilities: nul(form, 'utilities'),
  }).eq('account_id', account).eq('job_id', job).select('id')

  if (error) return { ok: false, message: refused(error.message) }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was saved. The survey is either closed or not yours.' }
  }
  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: 'Recorded site access and the utility locate',
  })
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}`)
  return { ok: true, message: 'Saved.' }
}

// ------------------------------------------------- what the survey found, to sales
/**
 * The findings, to whoever sold it — BEFORE anybody decides about the cost.
 *
 * Ryan, 14 Sep. The salesperson is the one who has to speak to the customer, so
 * they should be reading the numbers while the decision is still open rather
 * than being told what was settled without them. The screen refuses to close
 * the survey until this has happened, which is the only way a rule like this
 * survives a busy Friday.
 */
export async function sendResults(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const job = str(form, 'job_id')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }

  const read = await loadSurvey(account, job)
  if (!read.survey) return { ok: false, message: 'There is nothing filled in to send yet.' }

  const sums = summarize(read)
  const to = await salesFor(db, account, job)
  if (!to.size) {
    return { ok: false, message: 'Nobody on this account holds the sales role, so there is nobody to tell.' }
  }

  const h = await headers()
  const origin = `https://${h.get('host') ?? 'oh.hihopper.app'}`
  const { data: jobRow } = await db.schema('hopper').from('fence_job')
    .select('ref, name, customer, site_address, sold_price')
    .eq('account_id', account).eq('id', job).maybeSingle()

  const facts = [
    { label: 'Signed estimate', value: sums.signed == null ? null : money(sums.signed) },
    { label: 'The line', value: sums.walkedFt === sums.drawnFt
        ? `${sums.walkedFt.toLocaleString('en-US')} ft, as drawn`
        : `${sums.walkedFt.toLocaleString('en-US')} ft against ${sums.drawnFt.toLocaleString('en-US')} drawn` },
    { label: 'Site conditions', value: read.found.length
        ? `${money(sums.found)} — ${sums.names}` : 'none found' },
    { label: 'Firm price', value: sums.firm == null ? null : money(sums.firm) },
    { label: 'Not priced', value: sums.gaps.length ? sums.gaps.join(' · ') : null },
  ].filter((f) => f.value)

  const rows = [...to.entries()].map(([email, full]) => ({
    kind: 'fence.survey', app_id: 'hopper', to_email: email, to_name: full,
    payload: {
      job: `${jobRow?.ref ?? ''}${jobRow?.name ? ` · ${jobRow.name}` : ''}`,
      url: `${origin}/fence/${job}/survey`,
      facts,
      body: `The survey on ${jobRow?.ref ?? 'this job'} is done. Nothing has been decided about `
        + `the cost yet — that is the next step, and it is worth you seeing these first.`,
    },
    status: 'pending', attempts: 0,
  }))
  const { error } = await db.schema('beebee').from('mail_outbox').insert(rows)
  if (error) return { ok: false, message: `The letter did not queue: ${error.message}` }

  for (const id of await salesIds(db, account, job)) {
    await tell(id, 'status', `${jobRow?.ref ?? 'A job'} — survey results`,
      `/fence/${job}/survey`, {
        body: `The line measured ${sums.walkedFt.toLocaleString('en-US')} ft and `
          + `${read.found.length} site condition${read.found.length === 1 ? '' : 's'} were found. `
          + 'No decision has been made about the cost.',
        object: jobRow?.name ?? null, objectId: job,
      })
  }

  const { data } = await db.schema('hopper').from('fence_survey').update({
    results_sent_at: new Date().toISOString(), results_sent_by: person,
  }).eq('account_id', account).eq('job_id', job).select('id')
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'The letters went, but the survey is not yours to stamp.' }
  }

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: `Sent the survey results to sales — ${to.size} letter${to.size === 1 ? '' : 's'}`,
  })
  revalidatePath(`/fence/${job}/survey`)
  return { ok: true, message: `Sent to ${[...to.values()].join(', ')}.` }
}

// -------------------------------------------------------------- the one decision
/**
 * Closing it, and the only decision on the screen.
 *
 * Ryan, 14 Sep: nothing reaches the customer automatically. The difference is
 * sometimes worth eating and sometimes worth a conversation, and only the
 * person who just walked the site knows which. So this records WHICH — as a
 * `fence_revision`, which has existed since 0109 for exactly this — and on
 * `review` issues a link to a FIRM document the customer signs, with the
 * salesperson copied.
 *
 * IT CANNOT RUN BEFORE SALES HAVE THE RESULTS. That is the rule, in the one
 * place that can enforce it.
 */
export async function closeSurvey(_p: Result | null, form: FormData): Promise<Result> {
  const { db, account, person } = await ctx()
  const job = str(form, 'job_id')
  const outcome = str(form, 'outcome')
  if (!uuid.test(job)) return { ok: false, message: 'That job id is not a job id.' }
  if (outcome !== 'absorb' && outcome !== 'review') {
    return { ok: false, message: 'Say whether we absorb the difference or the customer reviews it.' }
  }

  const read = await loadSurvey(account, job)
  if (!read.survey) return { ok: false, message: 'There is nothing filled in to close yet.' }
  if (read.survey.closed_at) return { ok: false, message: 'This survey is already closed.' }
  if (!read.survey.results_sent_at) {
    return { ok: false, message: 'Send the results to sales first. They should see the numbers before the cost is settled.' }
  }

  const sums = summarize(read)
  if (sums.signed == null) {
    return { ok: false, message: 'Nothing has been signed on this job, so there is no price to confirm.' }
  }
  const note = nul(form, 'note')

  /* The revision is the record, and it is append-only by policy. `held_price`
     is the whole difference between the two answers: absorbing means the
     customer's figure does not move and ours does. */
  const { data: rev, error: revErr } = await db.schema('hopper').from('fence_revision').insert({
    account_id: account, job_id: job,
    reason: outcome === 'absorb'
      ? 'Survey closed — the difference absorbed'
      : 'Survey closed — the firm price went back to the customer',
    sold_before: sums.signed,
    sold_after: outcome === 'absorb' ? sums.signed : sums.firm,
    held_price: outcome === 'absorb',
    note, opened_by: person,
  }).select('id').maybeSingle()
  if (revErr) return { ok: false, message: refused(revErr.message) }
  if (!rev) return { ok: false, message: 'The revision was not yours to open.' }

  let token: string | null = null
  let mailed: string | null = null
  if (outcome === 'review') {
    const out = await sendFirm(db, account, job, (rev as any).id as string, sums, note)
    if (!out.ok) return out
    token = out.token
    mailed = out.mailed
  }

  const { data, error } = await db.schema('hopper').from('fence_survey').update({
    outcome, note,
    closed_at: new Date().toISOString(), closed_by: person,
  }).eq('account_id', account).eq('job_id', job).is('closed_at', null).select('id')

  if (error) return { ok: false, message: refused(error.message) }
  if ((data ?? []).length === 0) {
    return { ok: false, message: 'Nothing was closed. The survey is either already closed or not yours.' }
  }

  await db.schema('hopper').from('fence_job')
    .update({ stage: 'schedule' })
    .eq('account_id', account).eq('id', job).eq('stage', 'survey')

  await logAudit(db, {
    account_id: account, kind: 'fence', object_id: job,
    summary: outcome === 'absorb'
      ? `Closed the survey — absorbed ${money(sums.found)} of site conditions and held the signed price`
      : `Closed the survey — sent a firm price of ${money(sums.firm ?? 0)} for signature`,
  })
  revalidatePath(`/fence/${job}/survey`)
  revalidatePath(`/fence/${job}`)
  revalidatePath('/fence')
  return {
    ok: true,
    message: outcome === 'absorb'
      ? 'Closed. The job books at the signed price.'
      : mailed
        ? `Closed. The firm price went to ${mailed} for signature, copied to sales.`
        : 'Closed, but there was nobody to send the firm price to — add a contact on the estimate.',
  }
}

/**
 * The firm price, out for signature, with sales copied.
 *
 * The link points at the REVISION rather than an option: the estimate is sealed
 * and a firm figure could never become a new option, which is the whole reason
 * fence_quote_link now takes one or the other. /e/[token] renders the same
 * document with the estimate band replaced by a firm one and what the survey
 * found listed under the signed subtotal.
 */
async function sendFirm(
  db: any, account: string, job: string, revision: string,
  sums: ReturnType<typeof summarize>, note: string | null,
): Promise<{ ok: true; token: string | null; mailed: string | null } | Result & { ok: false }> {
  const [{ data: row }, { data: settings }] = await Promise.all([
    db.schema('hopper').from('fence_job')
      .select('ref, name, customer, site_address, contact_id')
      .eq('account_id', account).eq('id', job).maybeSingle(),
    db.schema('hopper').from('fence_settings')
      .select('company_name, estimate_days').eq('account_id', account).maybeSingle(),
  ])

  // Anything still live is replaced, so one link at a time by construction.
  await db.schema('hopper').from('fence_quote_link')
    .update({ revoked: true })
    .eq('account_id', account).eq('job_id', job)
    .is('signed_at', null).eq('revoked', false)

  const days = Number((settings as any)?.estimate_days ?? 14) || 14
  const expires = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  const { data: link, error } = await db.schema('hopper').from('fence_quote_link').insert({
    account_id: account, job_id: job, revision_id: revision,
    expires_on: expires,
  }).select('id, token').maybeSingle()
  if (error) return { ok: false, message: refused(error.message) }
  if (!link) return { ok: false, message: 'The link was not yours to issue.' }

  if (!(row as any)?.contact_id) return { ok: true, token: (link as any).token, mailed: null }
  const { data: to } = await db.schema('hopper').from('fence_contact')
    .select('full_name, email').eq('account_id', account)
    .eq('id', (row as any).contact_id).maybeSingle()
  const email = String((to as any)?.email ?? '').trim().toLowerCase()
  if (!email) return { ok: true, token: (link as any).token, mailed: null }

  const h = await headers()
  const origin = `https://${h.get('host') ?? 'oh.hihopper.app'}`
  const company = (settings as any)?.company_name || 'us'
  const sales = await salesFor(db, account, job)

  const letters = [
    {
      kind: 'fence.firm', app_id: 'hopper',
      to_email: email, to_name: (to as any)?.full_name ?? null,
      payload: {
        from_name: company,
        job: `${(row as any).ref}${(row as any).name ? ` · ${(row as any).name}` : ''}`,
        url: `${origin}/e/${(link as any).token}`,
        what: 'the firm price for your fence, now that we have measured it on the ground',
        facts: [
          { label: 'Reference', value: (row as any).ref },
          { label: 'Where the work is', value: (row as any).site_address },
          { label: 'You signed', value: money(sums.signed ?? 0) },
          { label: 'Firm price', value: money(sums.firm ?? 0) },
          { label: 'Good through', value: new Date(expires + 'T00:00:00')
              .toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) },
        ],
        body: note,
      },
      status: 'pending', attempts: 0,
    },
    // Sales are copied on the same letter rather than sent a different one:
    // whoever has to take the phone call should have read exactly what the
    // customer read.
    ...[...sales.entries()].map(([e, full]) => ({
      kind: 'fence.firm', app_id: 'hopper', to_email: e, to_name: full,
      payload: {
        from_name: company,
        job: `${(row as any).ref}${(row as any).name ? ` · ${(row as any).name}` : ''}`,
        url: `${origin}/fence/${job}/survey`,
        what: `a copy of the firm price sent to ${(to as any)?.full_name ?? email}`,
        facts: [
          { label: 'Reference', value: (row as any).ref },
          { label: 'They signed', value: money(sums.signed ?? 0) },
          { label: 'Firm price', value: money(sums.firm ?? 0) },
          { label: 'What moved it', value: sums.names || 'the line as measured' },
        ],
        body: note,
      },
      status: 'pending', attempts: 0,
    })),
  ]
  await db.schema('beebee').from('mail_outbox').insert(letters)
  return { ok: true, token: (link as any).token, mailed: email }
}

/** Everything both letters need, worked out once. */
function summarize(read: Awaited<ReturnType<typeof loadSurvey>>) {
  const { sell: found, gaps } = conditionTotals(read.conditions, read.found)
  const { sell: assumed } = conditionTotals(read.conditions, read.quoted)
  const job: any = read.measure.job
  const signed = job?.sold_price == null ? null : Number(job.sold_price)

  const drawnFt = Math.round(read.measure.sums.fenceFt)
  const walkedFt = Math.round(read.after.fenceFt)
  const perFoot = signed && drawnFt > 0 ? signed / drawnFt : null
  const lengthDelta = perFoot == null ? 0 : Math.round((walkedFt - drawnFt) * perFoot)
  const moved = Math.round(found - assumed) + lengthDelta
  const firm = signed == null ? null : Math.round(signed + moved)

  const names = read.conditions
    .filter((c) => read.found.some((f) => f.condition_id === c.id))
    .map((c) => c.name_en).join(', ')

  return { found, assumed, gaps, signed, drawnFt, walkedFt, lengthDelta, moved, firm, names }
}

/** Whoever sold it: everybody holding the sales role, plus whoever opened the
 *  job, because on a small crew those are not always the same person. */
async function salesIds(db: any, account: string, job: string): Promise<Set<string>> {
  const [{ data: jobRow }, { data: sellers }] = await Promise.all([
    db.schema('hopper').from('fence_job').select('created_by')
      .eq('account_id', account).eq('id', job).maybeSingle(),
    db.schema('hopper').from('fence_person').select('person_id')
      .eq('account_id', account).eq('job_role', 'sales'),
  ])
  const ids = new Set(((sellers ?? []) as any[]).map((p) => p.person_id as string))
  if ((jobRow as any)?.created_by) ids.add((jobRow as any).created_by)
  return ids
}

async function salesFor(db: any, account: string, job: string): Promise<Map<string, string>> {
  const ids = [...await salesIds(db, account, job)]
  if (!ids.length) return new Map()
  const { data: people } = await db.schema('hopper').from('person')
    .select('id, full_name, email').eq('account_id', account).in('id', ids).eq('active', true)
  const to = new Map<string, string>()
  for (const p of ((people ?? []) as any[])) {
    if (p.email) to.set(String(p.email).toLowerCase(), p.full_name)
  }
  return to
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
