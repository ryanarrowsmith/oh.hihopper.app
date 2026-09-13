import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import type { ChargeRule, ChargeCode, Sold, SheetLine } from '@/lib/handoff'

/**
 * Everything the billing handoff reads, in one round trip.
 *
 * Separated from lib/handoff.ts so that the roll-up arithmetic stays pure and
 * checkable — the same seam as lib/price.ts and lib/takeoff.ts, and for the same
 * reason: the numbers on this screen are the numbers that get keyed.
 *
 * No cost and no margin are read here at all. Not because of who is asking: the
 * billing sheet is a SELL document, it is attached to an account, forwarded and
 * printed, and what a job cost us has no business on it whoever is holding it.
 */
export type Handoff = {
  id: string; sent_at: string; navusoft_account: string | null
  to_email: string | null; how: string; note: string | null; sheet: any
  sent_by_name: string | null
}

export async function loadBilling(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const [opt, rel, rules, codes, gateTypes, saved, revisions, targets, handoffs, notes, photos, sow] =
    await Promise.all([
      h().from('fence_option')
        .select('id, label, price, spec_code, priced_at, note, takeoff')
        .eq('account_id', accountId).eq('job_id', jobId).eq('accepted', true).maybeSingle(),
      h().from('fence_option_release').select('option_id').eq('account_id', accountId),
      h().from('fence_charge_rule').select('cls, takes, charge_code, note, active')
        .eq('account_id', accountId).eq('active', true),
      h().from('fence_charge_code')
        .select('code, description, recurring, cycle_days, provisional, sort')
        .eq('account_id', accountId).eq('active', true).order('sort'),
      h().from('fence_gate_type').select('code, charge_code, name_en').eq('account_id', accountId),
      h().from('fence_charge_line')
        .select('id, code, description, qty, uom, amount, recurring, note, edited, option_id, sort')
        .eq('account_id', accountId).eq('job_id', jobId).order('sort'),
      // A change order with no new price on it yet. The one thing Ryan named
      // by hand as a reason nothing releases.
      h().from('fence_revision').select('id', { count: 'exact', head: true })
        .eq('account_id', accountId).eq('job_id', jobId).is('sold_after', null),
      h().from('fence_billing_target').select('id, name, to_email, instructions')
        .eq('account_id', accountId).eq('active', true).order('name'),
      h().from('fence_handoff')
        .select('id, sent_at, navusoft_account, to_email, how, note, sheet, sent_by')
        .eq('account_id', accountId).eq('job_id', jobId).order('sent_at', { ascending: false }),
      h().from('fence_note').select('body, section, created_at, by_crew, author_id')
        .eq('account_id', accountId).eq('job_id', jobId).order('created_at'),
      h().from('fence_photo').select('id, section, caption, created_at')
        .eq('account_id', accountId).eq('job_id', jobId).order('created_at'),
      h().from('fence_sow')
        .select('parts_en, parts_es, signed_at, signed_by, readability, written_en, written_es')
        .eq('account_id', accountId).eq('job_id', jobId).maybeSingle(),
    ])

  const releasedIds = new Set(((rel.data ?? []) as any[]).map((r) => r.option_id))
  const o: any = opt.data
  const sold: Sold | null = o ? {
    id: o.id, label: o.label, price: Number(o.price ?? 0), spec_code: o.spec_code,
    priced_at: o.priced_at, note: o.note, takeoff: o.takeoff,
    belowFloor: !!o.takeoff?.below_floor,
    released: releasedIds.has(o.id),
  } : null

  // Names for the handoff record and the notes. The directory is the only
  // roster everybody signed in may read.
  const { data: dir } = await db.schema('hopper').from('directory')
    .select('id, full_name').eq('active', true)
  const name = new Map(((dir ?? []) as any[]).map((p) => [p.id, p.full_name as string]))

  const savedLines: SheetLine[] = ((saved.data ?? []) as any[]).map((r) => ({
    id: r.id, code: r.code, description: r.description,
    qty: r.qty == null ? null : Number(r.qty), uom: r.uom,
    amount: r.amount == null ? null : Number(r.amount),
    recurring: r.recurring, cycleDays: null, note: r.note,
    edited: !!r.edited, byHand: !r.option_id,
    gap: null, sort: r.sort,
  }))

  return {
    sold,
    rules: (rules.data ?? []) as ChargeRule[],
    codes: (codes.data ?? []) as ChargeCode[],
    gateTypes: (gateTypes.data ?? []) as { code: string; charge_code: string | null; name_en: string }[],
    savedLines,
    openRevisions: revisions.count ?? 0,
    target: ((targets.data ?? []) as any[])[0] ?? null,
    handoffs: ((handoffs.data ?? []) as any[]).map((r) => ({
      ...r, sent_by_name: r.sent_by ? name.get(r.sent_by) ?? null : null,
    })) as Handoff[],
    notes: ((notes.data ?? []) as any[]).map((n) => ({
      ...n, author: n.by_crew ? 'The crew' : (n.author_id ? name.get(n.author_id) ?? null : null),
    })),
    photos: (photos.data ?? []) as any[],
    sow: (sow.data ?? null) as any,
  }
}

