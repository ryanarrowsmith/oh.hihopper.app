import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { takeoff, type RunRow, type GateRow, type Spec } from '@/lib/measure'
import { legsOf, type Leg, type LegRow } from '@/lib/legs'
import type { LngLat } from '@/lib/geo'

/* The arithmetic moved to lib/measure.ts, which has no `server-only` and so can
   be checked against fixtures. Re-exported here so nothing that already imports
   from this file has to learn a new name. */
export { takeoff, runPlanFeet } from '@/lib/measure'
export type { RunRow, GateRow, Spec, Takeoff } from '@/lib/measure'
export type { Leg, LegRow } from '@/lib/legs'

/**
 * The measure, before any money touches it.
 *
 * Everything in this file is a quantity: feet, posts, corners, openings. Not one
 * figure here is a price, which is why it can be read by anybody who can reach
 * the job — a field crew needs the post count and must never see the margin, and
 * keeping the two in separate files is cheaper than remembering to.
 *
 * The arithmetic is deliberately the arithmetic a fence estimator does on paper,
 * in the same order, so a number on the screen can be argued with:
 *
 *   plan feet          what the line measures flat, off the aerial
 *   + grade            a slope is longer than its shadow
 *   − gate openings    a 16-foot gate is 16 feet of fence nobody builds
 *   = fence to price
 *
 * Posts come off the spacing in the spec, corners off the geometry, and both are
 * per RUN rather than on the total: two 100-foot runs need four terminal posts
 * and one 200-foot run needs two.
 */

/** Everything the estimate screen measures with, and nothing it prices with. */
export async function loadMeasure(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const [job, runs, legs, gates, specs, types, settings] = await Promise.all([
    h().from('fence_job')
      .select('id, ref, name, customer, site_address, lat, lon, pin_note, cls, spec_code, stage, complete')
      .eq('account_id', accountId).eq('id', jobId).maybeSingle(),
    h().from('fence_run')
      .select('id, label, points, plan_ft, grade_pct, closed_loop, measured_by, sort')
      .eq('account_id', accountId).eq('job_id', jobId).order('sort'),
    h().from('fence_leg')
      .select('id, run_id, sort, label, spec_code')
      .eq('account_id', accountId).eq('job_id', jobId).order('sort'),
    h().from('fence_gate')
      .select('id, type_code, rate_code, qty, leg_id, at_pct')
      .eq('account_id', accountId).eq('job_id', jobId),
    h().from('fence_spec')
      .select('code, cls, name_en, name_es, height_ft, spacing_ft, note')
      .eq('account_id', accountId).eq('active', true).order('code'),
    h().from('fence_gate_type')
      .select('code, cls, name_en, name_es, width_ft, rate_code')
      .eq('account_id', accountId).eq('active', true).order('width_ft'),
    h().from('fence_settings')
      .select('margin_floor, waste_pct').eq('account_id', accountId).maybeSingle(),
  ])

  const catalog = (types.data ?? []) as any[]
  const gateRows: GateRow[] = ((gates.data ?? []) as any[]).map((g) => {
    const t = catalog.find((c) => c.code === g.type_code)
    return {
      id: g.id, type_code: g.type_code, rate_code: g.rate_code ?? t?.rate_code ?? null,
      qty: Number(g.qty) || 0,
      leg_id: g.leg_id ?? null,
      at_pct: g.at_pct == null ? null : Number(g.at_pct),
      name: t?.name_en ?? null,
      // The Spanish name travels with the gate, because a crew ticket and a
      // scope of work both need it and neither should be translating on the fly.
      name_es: t?.name_es ?? null,
      width_ft: t?.width_ft == null ? null : Number(t.width_ft),
      // A gate the book cannot price is a gap to show, not one to swallow.
      priced: !!(g.rate_code ?? t?.rate_code),
    }
  })

  const jobRow: any = job.data
  const specRows = (specs.data ?? []) as Spec[]
  const spec = specRows.find((s) => s.code === jobRow?.spec_code) ?? null
  const runRows = ((runs.data ?? []) as any[]).map((r) => ({
    ...r, points: (r.points ?? null) as LngLat[] | null,
  })) as RunRow[]

  /* THE LEGS ARE DERIVED, NOT STORED. fence_leg holds an id, an order and an
     override; every length, post and gate on a leg is worked out here from the
     run's own points, so there is never a second copy of a length to disagree
     with the first. A run with no leg rows still yields legs — unlabelled, on
     the job's spec — because a side of a fence exists whether or not anybody
     has said anything about it. */
  const legRows = ((legs.data ?? []) as any[]) as LegRow[]
  const legList: Leg[] = runRows.flatMap((r) => legsOf({
    run: r, legs: legRows, gates: gateRows, jobSpec: spec, specs: specRows,
  }))

  return {
    job: jobRow,
    runs: runRows,
    legs: legList,
    legRows,
    gates: gateRows,
    specs: specRows,
    catalog: catalog as (Spec & { width_ft: number | null; rate_code: string | null })[],
    spec,
    wastePct: Number((settings.data as any)?.waste_pct ?? 4),
    marginFloor: Number((settings.data as any)?.margin_floor ?? 35),
    sums: takeoff(runRows, gateRows, spec),
  }
}

/**
 * The trade rules for this account — what a foot of fence is made of.
 *
 * Here rather than in lib/price.ts so that the pricer stays a pure function over
 * values, with no database client in it and nothing to stub when it is checked.
 */
export type Recipe = {
  cls: string; spec_code: string | null; rate_code: string
  per: string; qty: number; waste: boolean; note: string | null; sort: number
}

export async function loadRecipe(accountId: string): Promise<Recipe[]> {
  const { data } = await supabaseServer().schema('hopper').from('fence_recipe')
    .select('cls, spec_code, rate_code, per, qty, waste, note, sort')
    .eq('account_id', accountId).eq('active', true)
    .order('sort')
  return ((data ?? []) as any[]).map((r) => ({ ...r, qty: Number(r.qty) })) as Recipe[]
}
