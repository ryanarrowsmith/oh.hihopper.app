import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { lineFeet, slopeFeet, corners, type LngLat } from '@/lib/geo'

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

export type RunRow = {
  id: string; label: string; points: LngLat[] | null
  plan_ft: number; grade_pct: number | null; closed_loop: boolean
  measured_by: string | null; sort: number
}

export type GateRow = {
  id: string; type_code: string | null; rate_code: string | null; qty: number
  name: string | null; width_ft: number | null; priced: boolean
}

export type Spec = {
  code: string; cls: string; name_en: string; name_es: string | null
  height_ft: number | null; spacing_ft: number | null; note: string | null
}

export type Takeoff = {
  planFt: number
  slopeFt: number
  openingFt: number
  fenceFt: number
  linePosts: number
  terminalPosts: number
  cornerPosts: number
  runs: { id: string; label: string; planFt: number; slopeFt: number
          corners: number; drawn: boolean }[]
}

/** One run's plan length: what was drawn, or what somebody measured. */
export function runPlanFeet(r: RunRow): number {
  const drawn = r.points && r.points.length >= 2
    ? lineFeet(r.points as LngLat[], r.closed_loop) : 0
  // A surveyed figure beats an aerial. When a run has both, the stored plan_ft is
  // the one that was measured on the ground and it wins.
  if (r.measured_by && r.measured_by !== 'aerial' && r.plan_ft > 0) return Number(r.plan_ft)
  return drawn || Number(r.plan_ft) || 0
}

export function takeoff(runs: RunRow[], gates: GateRow[], spec: Spec | null): Takeoff {
  const spacing = Number(spec?.spacing_ft) > 0 ? Number(spec!.spacing_ft) : 10

  const each = runs.map((r) => {
    const planFt = runPlanFeet(r)
    return {
      id: r.id, label: r.label,
      planFt,
      slopeFt: slopeFeet(planFt, r.grade_pct == null ? null : Number(r.grade_pct)),
      corners: r.points && r.points.length >= 3
        ? corners(r.points as LngLat[], r.closed_loop) : 0,
      drawn: !!(r.points && r.points.length >= 2),
      closed: r.closed_loop,
    }
  })

  const planFt = each.reduce((s, r) => s + r.planFt, 0)
  const slopeFt = each.reduce((s, r) => s + r.slopeFt, 0)
  const openingFt = gates.reduce((s, g) => s + (Number(g.width_ft) || 0) * (g.qty || 0), 0)
  const fenceFt = Math.max(0, slopeFt - openingFt)

  // A closed loop has no ends, so no terminal posts. An open run has two — and a
  // gate opening makes two more, because the fence stops at a gate post and
  // starts again on the far side.
  const terminalPosts = each.reduce((s, r) => s + (r.closed ? 0 : 2), 0)
    + gates.reduce((s, g) => s + 2 * (g.qty || 0), 0)
  const cornerPosts = each.reduce((s, r) => s + r.corners, 0)
  // Line posts fill the spans between the posts already counted, so the corners
  // and terminals are taken out of the length first.
  const linePosts = Math.max(0, Math.ceil(fenceFt / spacing) - each.length)

  return {
    planFt, slopeFt, openingFt, fenceFt,
    linePosts, terminalPosts, cornerPosts,
    runs: each.map(({ closed, ...r }) => r),
  }
}

/** Everything the estimate screen measures with, and nothing it prices with. */
export async function loadMeasure(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const [job, runs, gates, specs, types, settings] = await Promise.all([
    h().from('fence_job')
      .select('id, ref, name, customer, site_address, lat, lon, pin_note, cls, spec_code, stage, complete')
      .eq('account_id', accountId).eq('id', jobId).maybeSingle(),
    h().from('fence_run')
      .select('id, label, points, plan_ft, grade_pct, closed_loop, measured_by, sort')
      .eq('account_id', accountId).eq('job_id', jobId).order('sort'),
    h().from('fence_gate')
      .select('id, type_code, rate_code, qty')
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
      name: t?.name_en ?? null,
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

  return {
    job: jobRow,
    runs: runRows,
    gates: gateRows,
    specs: specRows,
    catalog: catalog as (Spec & { width_ft: number | null; rate_code: string | null })[],
    spec,
    wastePct: Number((settings.data as any)?.waste_pct ?? 4),
    marginFloor: Number((settings.data as any)?.margin_floor ?? 35),
    sums: takeoff(runRows, gateRows, spec),
  }
}
