'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { supabaseService } from '@/lib/supabase/service'
import { openQuote } from '@/lib/quote'
import { money } from '@/lib/estimate'
import type { Result } from '@/app/actions/admin'

/* ==========================================================================
   THE SIGNATURE, AND EVERYTHING IT SETS OFF.

   Ryan's call, 14 Sep: signing the estimate IS the handoff. So this is the one
   act, and it does what `handToPm` does plus the two things only a signature
   can do -- record who agreed, and date the plan from the day they agreed.

   THE ORDER MATTERS AND IT IS THE SAME ORDER AS handToPm'S:

     the signature      first, because it is the thing being recorded
     the sale           before the seal, because the seal beats everybody and a
                        sealed job with no sold option can never be given one
     the seal           before the plan, so nobody can move the price under a
                        project manager who has already started
     the plan           dated from the SIGN DATE, not from now
     the stage          survey, which is what makes the PM section active
     the letters        last, because a queued mail cannot be unqueued and the
                        rest of it can still fail

   IT RUNS ON THE SERVICE ROLE, because the person doing it has no account.
   That means RLS is not carrying the check here -- the token is. Every write
   below is scoped to the job the token resolved to, and the link is marked
   signed in the same breath so a second press of the button finds it spent.
   ========================================================================== */

const MAIL = 'fence.signed'

export async function signEstimate(
  token: string,
  who: { name: string; title?: string; email?: string },
): Promise<Result> {
  const name = (who.name ?? '').trim().slice(0, 120)
  if (name.length < 2) {
    return { ok: false, message: 'Type your full name to sign.' }
  }

  const q = await openQuote(token)
  if (!q) {
    return { ok: false, message: 'This link is no longer active. Ask for a new one.' }
  }
  if (q.signedAt) {
    return { ok: false, message: 'This estimate is already signed.' }
  }

  /* SIGNING A FIRM REVISION IS A SHORTER ACT. Everything from step 2 down —
     the sale, the seal, the task plan, the stage — already happened when the
     estimate was signed, and running them again would re-seal a sealed
     estimate, re-open tasks somebody has been ticking, and drag a job that has
     reached scheduling back to survey. What a firm signature changes is the
     PRICE and nothing else. */
  const revising = !!q.firm

  const db = supabaseService()
  const now = new Date()
  const signedAt = now.toISOString()
  const signedOn = signedAt.slice(0, 10)

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const agent = (h.get('user-agent') ?? '').slice(0, 300) || null
  const origin = `https://${h.get('host') ?? 'oh.hihopper.app'}`

  /* 1 — the signature. Unique on link_id, so two presses of the button race to
     one row and the loser is told it is already signed rather than writing a
     second one. */
  const { data: sig, error: sigErr } = await db.schema('hopper').from('fence_signature')
    .insert({
      account_id: q.accountId, job_id: q.jobId, option_id: q.optionId, link_id: q.linkId,
      signed_name: name,
      signed_title: (who.title ?? '').trim().slice(0, 120) || null,
      signed_email: (who.email ?? '').trim().slice(0, 200) || null,
      signed_at: signedAt, ip, agent, price: q.option.price,
    })
    .select('id').maybeSingle()
  if (sigErr || !sig) {
    return { ok: false, message: 'This estimate is already signed.' }
  }
  await db.schema('hopper').from('fence_quote_link')
    .update({ signed_at: signedAt }).eq('id', q.linkId)

  if (revising) {
    // The price moves; the option it belongs to, the seal and the plan do not.
    await db.schema('hopper').from('fence_job')
      .update({ sold_price: q.option.price })
      .eq('account_id', q.accountId).eq('id', q.jobId)
    await tellThem(db, q, { name, at: signedAt, origin, tasks: 0 })
    await db.schema('beebee').rpc('audit', {
      p_app: 'hopper',
      p_action: 'hopper.fence.signed',
      p_summary: `${name} signed the firm price on ${q.job.ref} at ${money(q.option.price)}`
        + `, up from ${money(q.firm!.before)} at the estimate`,
      p_account: q.accountId,
      p_subject_type: 'fence reference',
      p_subject_id: q.jobId,
      p_payload: { name: q.job.ref, signed_by: name, price: q.option.price, firm: true },
    })
    revalidatePath(`/fence/${q.jobId}`)
    revalidatePath(`/fence/${q.jobId}/survey`)
    revalidatePath('/fence')
    return { ok: true, message: 'Signed. Thank you — this is the price we will build to.' }
  }

  /* 2 — the sale. The option they signed becomes the sold one and every other
     option on the job stops being sold, which is what the partial unique index
     would otherwise refuse. */
  await db.schema('hopper').from('fence_option')
    .update({ accepted: false }).eq('account_id', q.accountId).eq('job_id', q.jobId)
    .neq('id', q.optionId).eq('accepted', true)
  await db.schema('hopper').from('fence_option')
    .update({ accepted: true }).eq('account_id', q.accountId).eq('id', q.optionId)
  await db.schema('hopper').from('fence_job').update({
    sold_price: q.option.price, sold_spec: q.option.spec_code, sold_on: signedOn,
  }).eq('account_id', q.accountId).eq('id', q.jobId)

  /* 3 — the seal. */
  await db.schema('hopper').from('fence_seal').upsert({
    account_id: q.accountId, job_id: q.jobId, section: 'estimate', sealed_at: signedAt,
  }, { onConflict: 'job_id,section' })

  /* 4 — the plan, DATED FROM THE SIGNATURE. This is the whole reason signing
     runs the handoff rather than somebody pressing a button later: a plan dated
     from the day it was noticed is a plan that is already late. */
  const [{ data: plan }, { data: already }] = await Promise.all([
    db.schema('hopper').from('fence_task_plan')
      .select('section, en, es, needs, due_days, sort')
      .eq('account_id', q.accountId).eq('active', true).order('sort'),
    db.schema('hopper').from('fence_task').select('section, en')
      .eq('account_id', q.accountId).eq('job_id', q.jobId),
  ])
  const have = new Set(((already ?? []) as any[]).map((t) => `${t.section}|${t.en}`))
  const rows = ((plan ?? []) as any[])
    .filter((p) => !have.has(`${p.section}|${p.en}`))
    .map((p) => ({
      account_id: q.accountId, job_id: q.jobId, section: p.section,
      en: p.en, es: p.es, needs: p.needs ?? null,
      due_on: p.due_days == null ? null
        : new Date(now.getTime() + p.due_days * 86_400_000).toISOString().slice(0, 10),
      from_plan: true, sort: p.sort, done: false,
    }))
  if (rows.length) {
    await db.schema('hopper').from('fence_task').insert(rows)
  }

  /* 5 — the stage. This is what opens the project manager's section: the job
     page reads `stage` to decide which tab is standing open when somebody
     arrives, and `reached` to know it got here honestly. */
  await db.schema('hopper').from('fence_job')
    .update({ stage: 'survey', reached: 'survey' })
    .eq('account_id', q.accountId).eq('id', q.jobId)

  /* 6 — the letters. Whoever sent it, and everybody carrying the project
     manager's key. Not "the PM": at signature nobody holds this job yet, and
     the point of the letter is that somebody picks it up. */
  await tellThem(db, q, { name, at: signedAt, origin, tasks: rows.length })

  /* The audit row is written by hand rather than through logAudit, because
     logAudit stamps the signed-in person and there is nobody signed in. The
     name that goes in is the one they typed. */
  const { error: auditErr } = await db.schema('beebee').rpc('audit', {
    p_app: 'hopper',
    p_action: 'hopper.fence.signed',
    p_summary: `${name} signed ${q.job.ref} at ${money(q.option.price)}`
      + `, sealing the estimate and opening ${rows.length} tasks`,
    p_account: q.accountId,
    p_subject_type: 'fence reference',
    p_subject_id: q.jobId,
    p_payload: { name: q.job.ref, signed_by: name, price: q.option.price },
  })
  if (auditErr) console.error('[sign] intent not recorded:', auditErr.message)

  revalidatePath(`/fence/${q.jobId}`)
  revalidatePath('/fence')
  return { ok: true, message: 'Signed. Thank you — we will be in touch to schedule the survey.' }
}

/** Who hears about it, and what they are told. */
async function tellThem(
  db: ReturnType<typeof supabaseService>,
  q: NonNullable<Awaited<ReturnType<typeof openQuote>>>,
  it: { name: string; at: string; origin: string; tasks: number },
) {
  const { data: pms } = await db.schema('hopper').from('fence_person')
    .select('person_id').eq('account_id', q.accountId).eq('job_role', 'pm')
  const ids = ((pms ?? []) as any[]).map((p) => p.person_id)

  const { data: people } = ids.length
    ? await db.schema('hopper').from('person').select('id, full_name, email')
        .eq('account_id', q.accountId).in('id', ids).eq('active', true)
    : { data: [] }

  const to = new Map<string, string>()
  for (const p of ((people ?? []) as any[])) {
    if (p.email) to.set(String(p.email).toLowerCase(), p.full_name)
  }
  if (q.seller?.email) to.set(q.seller.email.toLowerCase(), q.seller.name)
  if (to.size === 0) return

  const where = q.place
    ? [q.place.line1, [q.place.city, q.place.region].filter(Boolean).join(', '), q.place.postcode]
        .filter(Boolean).join(', ')
    : q.job.site_address

  const facts = [
    { label: 'Signed by', value: it.name },
    { label: 'Signed on', value: new Date(it.at).toLocaleDateString('en-US',
        { day: 'numeric', month: 'short', year: 'numeric' }) },
    { label: 'Customer', value: q.job.customer },
    { label: 'Where the work is', value: where },
    { label: 'What they signed', value: `${q.option.label} — ${money(q.option.price)}` },
    { label: 'Next', value: it.tasks
        ? `${it.tasks} task${it.tasks === 1 ? '' : 's'} are open, starting with the survey`
        : 'The survey' },
  ]

  const rows = [...to.entries()].map(([email, full]) => ({
    kind: MAIL, app_id: 'hopper', to_email: email, to_name: full,
    payload: {
      job: `${q.job.ref}${q.job.name ? ` · ${q.job.name}` : ''}`,
      url: `${it.origin}/fence/${q.jobId}`,
      facts,
      body: `${it.name} signed the estimate for ${q.job.ref}. The estimate is sealed, `
        + `the sale is recorded, and the project manager's tasks are open and dated `
        + `from today. The survey is the first one.`,
    },
    status: 'pending', attempts: 0,
  }))
  await db.schema('beebee').from('mail_outbox').insert(rows)
}
