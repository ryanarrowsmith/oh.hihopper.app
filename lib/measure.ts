/**
 * The measure, before any money touches it — and PURE, so it can be checked.
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
 *   - gate openings    a 16-foot gate is 16 feet of fence nobody builds
 *   = fence to price
 *
 * Posts come off the spacing in the spec, corners off the geometry, and both are
 * per RUN rather than on the total: two 100-foot runs need four terminal posts
 * and one 200-foot run needs two.
 *
 * NO `server-only` AND NO DATABASE CLIENT, for the same reason lib/price.ts has
 * neither: lib/legs.check.ts runs this against fixtures and compares it, figure
 * by figure, with the per-leg arithmetic that replaced it. Loading lives next
 * door in lib/takeoff.ts.
 */
import { lineFeet, slopeFeet, corners, type LngLat } from '@/lib/geo'

export type RunRow = {
  id: string; label: string; points: LngLat[] | null
  plan_ft: number; grade_pct: number | null; closed_loop: boolean
  measured_by: string | null; sort: number
}

export type GateRow = {
  id: string; type_code: string | null; rate_code: string | null; qty: number
  name: string | null; name_es: string | null; width_ft: number | null; priced: boolean
  /* WHICH LEG IT IS ON, and roughly how far along. Null on a gate that predates
     legs, or one nobody has placed yet: it still counts, it just does not draw.
     `at_pct` is a fraction rather than a distance on purpose — an aerial cannot
     honestly support "84 ft from the corner", and a number that precise invites
     somebody to build to it. */
  leg_id: string | null
  at_pct: number | null
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
          corners: number; drawn: boolean; closed: boolean }[]
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
    // `closed` travels with the run: the scope of work says whether a line
    // closes on itself, and a run that does has no ends to terminate.
    runs: each,
  }
}
