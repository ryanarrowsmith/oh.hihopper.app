import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { loadMeasure, takeoff, type RunRow } from '@/lib/takeoff'
import type { LngLat } from '@/lib/geo'

/**
 * The site survey — what the ground turned out to be.
 *
 * WHY IT IS A SEPARATE READ FROM THE ESTIMATE'S. The estimate is a number
 * somebody signed, and the signature seals it: fence_run's write policy is the
 * estimate section, so the project manager cannot edit a run and should not.
 * The walked figure lives beside the drawn one in fence_survey_run, and the
 * difference between them is the entire point of the screen. Same for
 * conditions: what the quote assumed is one table, what the site had is
 * another.
 *
 * NO PRICE IS DECIDED HERE. A condition carries a rate_code into the rate book
 * and multiplies by a quantity somebody typed. If the book has no line for it,
 * the condition measures and does not price, and says so by name — a missing
 * figure treated as nought is how a job goes out under cost, invisibly.
 */

export type Condition = {
  id: string; code: string
  name_en: string; name_es: string | null
  blurb_en: string | null; blurb_es: string | null
  rate_code: string | null; charge_code: string | null
  wants_qty: boolean; at_estimate: boolean; sort: number
  /** Joined from the rate book. Null means this one cannot be priced. */
  uom: string | null; sell: number | null; verified_on: string | null
}

export type Found = {
  condition_id: string
  qty: number | null
  detail: string | null
}

export type Walked = {
  run_id: string
  walked_ft: number | null
  grade_pct: number | null
  measured_by: string | null
  note: string | null
}

export type Survey = {
  id: string
  locate_ticket: string | null
  dig_from: string | null
  locate_expires: string | null
  access: string | null
  ask_for: string | null
  utilities: string | null
  note: string | null
  outcome: 'absorb' | 'review' | null
  closed_at: string | null
}

/** One condition's line: a quantity somebody typed times the book's own figure. */
export function lineFor(c: Condition, qty: number | null): number | null {
  if (c.sell == null) return null
  const n = c.wants_qty ? (qty ?? 0) : 1
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(c.sell * n * 100) / 100
}

/** What the conditions add up to, and what could not be priced. */
export function conditionTotals(conditions: Condition[], found: Found[]) {
  const by = new Map(conditions.map((c) => [c.id, c]))
  let sell = 0
  const gaps: string[] = []
  for (const f of found) {
    const c = by.get(f.condition_id)
    if (!c) continue
    if (c.sell == null) {
      gaps.push(`${c.name_en} — no rate book line${c.rate_code ? ` for ${c.rate_code}` : ''}`)
      continue
    }
    sell += lineFor(c, f.qty) ?? 0
  }
  return { sell: Math.round(sell * 100) / 100, gaps }
}

/**
 * The runs as the survey leaves them: the drawn geometry, with a walked length
 * and a measured grade laid over the top where somebody put one in.
 *
 * `runPlanFeet` already prefers a measured figure to a traced one, so writing
 * the walked length into plan_ft with a `measured_by` that is not 'aerial' is
 * all the overlay has to do — the takeoff then behaves exactly as it does for a
 * run measured with a wheel, which is what this is.
 */
export function overlay(runs: RunRow[], walked: Walked[]): RunRow[] {
  const by = new Map(walked.map((w) => [w.run_id, w]))
  return runs.map((r) => {
    const w = by.get(r.id)
    if (!w) return r
    return {
      ...r,
      plan_ft: w.walked_ft != null && w.walked_ft > 0 ? Number(w.walked_ft) : r.plan_ft,
      grade_pct: w.grade_pct != null ? Number(w.grade_pct) : r.grade_pct,
      measured_by: w.walked_ft != null && w.walked_ft > 0
        ? (w.measured_by ?? 'wheel') : r.measured_by,
    }
  })
}

/** Everything the survey screen reads. Quantities and dates; no cost side. */
export async function loadSurvey(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const measure = await loadMeasure(accountId, jobId)

  const [survey, walked, cat, book, quoted, found] = await Promise.all([
    h().from('fence_survey')
      .select('id, locate_ticket, dig_from, locate_expires, access, ask_for, utilities, note, outcome, closed_at')
      .eq('account_id', accountId).eq('job_id', jobId).maybeSingle(),
    h().from('fence_survey_run')
      .select('run_id, walked_ft, grade_pct, measured_by, note')
      .eq('account_id', accountId).eq('job_id', jobId),
    h().from('fence_condition')
      .select('id, code, name_en, name_es, blurb_en, blurb_es, rate_code, charge_code, wants_qty, at_estimate, sort')
      .eq('account_id', accountId).eq('active', true).order('sort'),
    h().from('fence_rate')
      .select('code, uom, sell, verified_on')
      .eq('account_id', accountId).eq('active', true),
    h().from('fence_job_condition')
      .select('condition_id, qty, detail')
      .eq('account_id', accountId).eq('job_id', jobId),
    h().from('fence_survey_condition')
      .select('condition_id, qty, detail')
      .eq('account_id', accountId).eq('job_id', jobId),
  ])

  const rates = new Map(((book.data ?? []) as any[]).map((r) => [r.code, r]))
  const conditions: Condition[] = ((cat.data ?? []) as any[]).map((c) => {
    const r = c.rate_code ? rates.get(c.rate_code) : null
    return {
      ...c,
      uom: r?.uom ?? null,
      sell: r?.sell == null ? null : Number(r.sell),
      verified_on: r?.verified_on ?? null,
    }
  })

  const walkedRows = ((walked.data ?? []) as any[]) as Walked[]
  const runs = ((measure.runs ?? []) as RunRow[])

  return {
    measure,
    survey: (survey.data as Survey | null) ?? null,
    walked: walkedRows,
    conditions,
    quoted: ((quoted.data ?? []) as any[]) as Found[],
    found: ((found.data ?? []) as any[]) as Found[],
    /** The takeoff as the survey leaves it, beside the one the estimate used. */
    after: takeoff(overlay(runs, walkedRows), measure.gates, measure.spec),
  }
}

/** The conditions the estimate is allowed to raise, and what it raised. */
export async function loadQuoteConditions(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')
  const [cat, book, quoted] = await Promise.all([
    h().from('fence_condition')
      .select('id, code, name_en, name_es, blurb_en, blurb_es, rate_code, charge_code, wants_qty, at_estimate, sort')
      .eq('account_id', accountId).eq('active', true).eq('at_estimate', true).order('sort'),
    h().from('fence_rate')
      .select('code, uom, sell, verified_on')
      .eq('account_id', accountId).eq('active', true),
    h().from('fence_job_condition')
      .select('condition_id, qty, detail')
      .eq('account_id', accountId).eq('job_id', jobId),
  ])
  const rates = new Map(((book.data ?? []) as any[]).map((r) => [r.code, r]))
  const conditions: Condition[] = ((cat.data ?? []) as any[]).map((c) => {
    const r = c.rate_code ? rates.get(c.rate_code) : null
    return { ...c, uom: r?.uom ?? null,
             sell: r?.sell == null ? null : Number(r.sell),
             verified_on: r?.verified_on ?? null }
  })
  return { conditions, quoted: ((quoted.data ?? []) as any[]) as Found[] }
}

/** Runs that the terrain says will want stepping. Estimate-side, and quiet
 *  about anything flat. */
export function steepRuns(runs: { label: string; fall_ft: number | null; steepest: number | null }[]) {
  return runs.filter((r) => (r.steepest ?? 0) >= 5 || (r.fall_ft ?? 0) >= 6)
}

export type { RunRow, LngLat }
