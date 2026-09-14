import { lineFeet, slopeFeet, corners, type LngLat } from '@/lib/geo'
import type { GateRow, RunRow, Spec, Takeoff } from '@/lib/measure'

/**
 * A LEG IS ONE SIDE OF A FENCE, between two corners.
 *
 * Ryan, 14 Sep: a run is one leg of the fence in the trade, not the whole
 * drawing — and a side sometimes needs to be taller than the rest. So the unit
 * the estimate is built on is the leg: it carries its own length, its own gates
 * and, when it differs, its own spec.
 *
 * WHERE A LEG LIVES. The geometry has one home and that is still fence_run's
 * polyline. fence_leg rows MIRROR its segments — same count, same order —
 * written by the same save, so a leg keeps its id when a point moves and an
 * override cannot slide onto the wrong side. Lengths are computed here from the
 * points rather than stored, because two copies of a length is two answers.
 *
 * THE SPEC IS AN OVERRIDE, NOT A DECLARATION. Null means "whatever the job is",
 * which is one choice made once instead of four made every time. Only the leg
 * that differs says anything, and only that leg gets a line of its own in front
 * of a customer.
 *
 * Pure arithmetic, no `server-only` and no database client, for the same reason
 * lib/price.ts is: lib/legs.check.ts runs it against fixtures and proves the one
 * invariant that makes this safe — A JOB WITH NO OVERRIDES MUST COME TO EXACTLY
 * WHAT IT CAME TO BEFORE.
 */

export type LegRow = {
  id: string
  run_id: string
  sort: number
  label: string | null
  spec_code: string | null
}

export type Leg = {
  id: string
  runId: string
  sort: number
  /** What the screen calls it. Auto from the compass unless somebody typed one. */
  label: string
  /** The two ends, so the screen can draw and hit-test it. */
  from: LngLat
  to: LngLat
  /** The spec actually in force: the override, or the job's. */
  spec: Spec | null
  /** True only when this leg overrode the job. The mark hangs off this. */
  overrides: boolean
  planFt: number
  slopeFt: number
  openingFt: number
  /** What gets built: this leg's slope length, less its gate openings. */
  fenceFt: number
  linePosts: number
  terminalPosts: number
  cornerPosts: number
  gates: GateRow[]
}

/* Eight points of the compass. A side gets its name from WHERE IT SITS, not
   which way it runs: a leg running east-west is the north side or the south
   side depending on which half of the property it is on, and a bearing alone
   cannot tell you that. So the name comes from the leg's midpoint against the
   line's own centre — which is exactly how somebody standing on the site names
   it. */
const POINTS = ['North', 'North-east', 'East', 'South-east',
                'South', 'South-west', 'West', 'North-west']

/** The bearing from one point to another, in degrees from north. */
export function bearing(from: LngLat, to: LngLat): number {
  const rad = Math.PI / 180
  const y = Math.sin((to[0] - from[0]) * rad) * Math.cos(to[1] * rad)
  const x = Math.cos(from[1] * rad) * Math.sin(to[1] * rad)
    - Math.sin(from[1] * rad) * Math.cos(to[1] * rad) * Math.cos((to[0] - from[0]) * rad)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** Which side of the line this leg is, as a word. */
export function sideName(mid: LngLat, centre: LngLat): string {
  return POINTS[Math.round(bearing(centre, mid) / 45) % 8]
}

/** The middle of a set of points. Good enough to name a side by. */
export function middle(points: LngLat[]): LngLat {
  const n = points.length || 1
  return [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
  ]
}

/** The segments of one run's polyline, in order. */
export function segmentsOf(points: LngLat[], closed: boolean): [LngLat, LngLat][] {
  if (!points || points.length < 2) return []
  const out: [LngLat, LngLat][] = []
  for (let i = 1; i < points.length; i++) out.push([points[i - 1], points[i]])
  if (closed && points.length > 2) out.push([points[points.length - 1], points[0]])
  return out
}

/**
 * One run's legs, with everything each of them is worth.
 *
 * THE POSTS ARE THE CAREFUL PART, because they belong to different things:
 *
 *   line posts     fill a leg's own length, so they are the leg's — and this is
 *                  where a taller leg pays off, since spacing comes from ITS
 *                  spec rather than the job's
 *   corner posts   sit at a vertex BETWEEN two legs, so each is assigned to the
 *                  leg that ENDS at it. Arbitrary, and the only thing that
 *                  matters is that it is consistent: counted twice, a corner is
 *                  a post nobody sets and everybody pays for
 *   terminal posts belong to the RUN — two at the ends of an open line, none at
 *                  all where it closes on itself — plus two for every gate,
 *                  because the fence stops at a gate post and starts again on
 *                  the far side
 */
export function legsOf(o: {
  run: RunRow
  legs: LegRow[]
  gates: GateRow[]
  jobSpec: Spec | null
  specs: Spec[]
}): Leg[] {
  const pts = (o.run.points ?? []) as LngLat[]
  const segs = segmentsOf(pts, o.run.closed_loop)
  if (!segs.length) return []

  const rows = new Map(o.legs.filter((l) => l.run_id === o.run.id).map((l) => [l.sort, l]))
  const byLeg = new Map<string, GateRow[]>()
  for (const g of o.gates) {
    if (!g.leg_id) continue
    byLeg.set(g.leg_id, [...(byLeg.get(g.leg_id) ?? []), g])
  }

  /* A vertex is a corner only if the line actually turns there. The whole-run
     count uses the same threshold on the same points, so the two agree. */
  const turns = cornerAt(pts, o.run.closed_loop)
  const centre = middle(pts)

  return segs.map(([from, to], i) => {
    const row = rows.get(i)
    const spec = row?.spec_code
      ? o.specs.find((s) => s.code === row.spec_code) ?? o.jobSpec
      : o.jobSpec
    const spacing = Number(spec?.spacing_ft) > 0 ? Number(spec!.spacing_ft) : 10

    const planFt = lineFeet([from, to])
    const slope = slopeFeet(planFt, o.run.grade_pct == null ? null : Number(o.run.grade_pct))
    const gates = row ? (byLeg.get(row.id) ?? []) : []
    const openingFt = gates.reduce((s, g) => s + (Number(g.width_ft) || 0) * (g.qty || 0), 0)
    const fenceFt = Math.max(0, slope - openingFt)

    const ends = o.run.closed_loop ? 0 : (i === 0 ? 1 : 0) + (i === segs.length - 1 ? 1 : 0)
    const gateCount = gates.reduce((s, g) => s + (g.qty || 0), 0)

    return {
      id: row?.id ?? `${o.run.id}:${i}`,
      runId: o.run.id,
      sort: i,
      label: row?.label
        || `${sideName(middle([from, to]), centre)} side`,
      from, to,
      spec,
      overrides: !!row?.spec_code && row.spec_code !== o.jobSpec?.code,
      planFt,
      slopeFt: slope,
      openingFt,
      fenceFt,
      // The leg's own interior posts. The whole-run figure takes one off per
      // run; here it is one off per leg, and the ends are counted as terminals
      // or corners instead — see the check file, which proves the two agree.
      linePosts: Math.max(0, Math.ceil(fenceFt / spacing) - 1),
      terminalPosts: ends + 2 * gateCount,
      cornerPosts: turns[i] ? 1 : 0,
      gates,
    }
  })
}

/** Which vertices the line actually turns at, as a flag per leg END. */
function cornerAt(points: LngLat[], closed: boolean): boolean[] {
  const segs = segmentsOf(points, closed)
  const out = segs.map(() => false)
  if (segs.length < 2) return out
  for (let i = 0; i < segs.length; i++) {
    const next = segs[(i + 1) % segs.length]
    if (i === segs.length - 1 && !closed) break
    const one = corners([segs[i][0], segs[i][1], next[1]], false)
    out[i] = one > 0
  }
  return out
}

/** Everything the legs come to, in the shape the rest of the app already reads. */
export function totalOf(legs: Leg[]): Takeoff {
  const sum = (f: (l: Leg) => number) => legs.reduce((s, l) => s + f(l), 0)
  return {
    planFt: sum((l) => l.planFt),
    slopeFt: sum((l) => l.slopeFt),
    openingFt: sum((l) => l.openingFt),
    fenceFt: sum((l) => l.fenceFt),
    linePosts: sum((l) => l.linePosts),
    terminalPosts: sum((l) => l.terminalPosts),
    cornerPosts: sum((l) => l.cornerPosts),
    runs: legs.map((l) => ({
      id: l.id, label: l.label, planFt: l.planFt, slopeFt: l.slopeFt,
      corners: l.cornerPosts, drawn: true, closed: false,
    })),
  }
}
