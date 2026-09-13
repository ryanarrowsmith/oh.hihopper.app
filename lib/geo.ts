/**
 * The little bit of geodesy the estimator needs, and nothing more.
 *
 * Two jobs: turn a tap on an image into a point on the ground, and turn a line
 * of points into a length somebody will be held to.
 *
 * WHY A BOUNDING BOX RATHER THAN CENTRE AND ZOOM. A static map can be asked for
 * either way. Centre-and-zoom means the pixel scale comes from a zoom
 * CONVENTION -- 256-pixel tiles or 512 -- and the two differ by a factor of two.
 * Getting that wrong does not look wrong: the picture is identical and every
 * length is double or half. On a quote that is not a rendering bug, it is a
 * number somebody signs. Asking for an explicit bounding box removes the
 * question: the image spans exactly the box that was requested, so the mapping
 * from pixel to ground is arithmetic on figures this file chose itself.
 *
 * The box is built in MERCATOR units and its aspect matched to the image's, so
 * there is nothing for the map server to fit or letterbox -- a box whose shape
 * disagrees with the image's shape is a box the server quietly widens.
 *
 * Web Mercator is conformal, which is what makes this honest at a parcel's
 * scale: equal pixels are equal ground in every direction. It is NOT
 * equal-area, so lengths are never measured off the pixels -- every distance
 * below is haversine on the coordinates themselves.
 */

export const FT_PER_M = 3.280839895

/**
 * One radius, and it is the mean one.
 *
 * Normalized Web Mercator needs no radius at all — x and y run 0…1 whatever
 * sphere you draw them on — so the only place a figure is needed is turning
 * units into feet, and that has to agree with how lengths are actually measured.
 * Lengths here are haversine, whose usual constant is the WGS-84 MEAN radius.
 * Using the semi-major axis instead made every length 0.34% long: three feet in
 * a thousand, in the direction that flatters the invoice.
 *
 * What is left is about 0.2% the other way, which is well inside the error of
 * tracing a line off an aerial photograph. That is why the estimate carries a
 * preliminary stamp and the survey sets the price.
 */
const R_DIST = 6371008.8
const TAU_D = 2 * Math.PI * R_DIST

export type LngLat = [number, number]  // GeoJSON order. Longitude first.

/** Normalized Web Mercator: x and y each run 0…1 across the whole world. */
export function toMerc([lng, lat]: LngLat): [number, number] {
  const f = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180
  return [
    (lng + 180) / 360,
    (1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2,
  ]
}

export function fromMerc([x, y]: [number, number]): LngLat {
  return [
    x * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI,
  ]
}

/**
 * The picture, and what it covers. One object holds everything needed to go
 * both ways between a tap and a coordinate, so no screen has to re-derive it.
 */
export type View = {
  /** The bounding box, in normalized mercator. */
  x0: number; y0: number; x1: number; y1: number
  /** The image, in CSS pixels. */
  w: number; h: number
}

/**
 * A view of `feet` across, centred on a point, shaped to fit the image.
 *
 * Feet across is the honest control: it is what somebody measuring a yard
 * thinks in, and it makes the scale bar a statement rather than a guess.
 */
export function viewAround(centre: LngLat, feet: number, w: number, h: number): View {
  const [cx, cy] = toMerc(centre)
  // Ground metres per unit of normalized mercator x, at THIS latitude. Mercator
  // stretches with latitude, so a fixed box is a different number of feet in
  // Tulsa than in Anchorage.
  const perUnit = TAU_D * Math.cos(centre[1] * Math.PI / 180)
  const dx = (feet / FT_PER_M) / perUnit
  const dy = dx * (h / w)              // conformal: same units, so same shape
  return { x0: cx - dx / 2, y0: cy - dy / 2, x1: cx + dx / 2, y1: cy + dy / 2, w, h }
}

/** Where on the image a coordinate falls. */
export function toPixel(v: View, p: LngLat): [number, number] {
  const [x, y] = toMerc(p)
  return [((x - v.x0) / (v.x1 - v.x0)) * v.w, ((y - v.y0) / (v.y1 - v.y0)) * v.h]
}

/** What a tap on the image means. */
export function toLngLat(v: View, px: number, py: number): LngLat {
  return fromMerc([
    v.x0 + (px / v.w) * (v.x1 - v.x0),
    v.y0 + (py / v.h) * (v.y1 - v.y0),
  ])
}

/** How many feet one pixel of this view covers, near its middle. */
export function feetPerPixel(v: View): number {
  const mid = fromMerc([(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2])
  const perUnit = TAU_D * Math.cos(mid[1] * Math.PI / 180)
  return ((v.x1 - v.x0) * perUnit * FT_PER_M) / v.w
}

/** Ground distance, on the sphere rather than on the picture. */
export function feetBetween(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R_DIST * Math.asin(Math.min(1, Math.sqrt(s))) * FT_PER_M
}

/** The line's length in plan — flat, before any grade is added. */
export function lineFeet(points: LngLat[], closed = false): number {
  if (!points || points.length < 2) return 0
  let ft = 0
  for (let i = 1; i < points.length; i++) ft += feetBetween(points[i - 1], points[i])
  if (closed && points.length > 2) ft += feetBetween(points[points.length - 1], points[0])
  return ft
}

/**
 * Slope length. A 1,000-foot run across a 10% grade is 1,005 feet of fabric,
 * which is five feet nobody ordered — and on a 25% bank it is thirty.
 */
export function slopeFeet(planFt: number, gradePct: number | null): number {
  const g = (gradePct ?? 0) / 100
  return planFt * Math.sqrt(1 + g * g)
}

/**
 * Corners, counted from the line itself.
 *
 * A corner post is a terminal post in the middle of a run: the fabric is
 * tensioned off it in both directions, so it wants the heavy pipe, three bands
 * and its own bag of concrete. A vertex that only nudges the line by a couple of
 * degrees is a line post on a slight bend, not a corner, hence the threshold.
 */
export function corners(points: LngLat[], closed = false, degrees = 12): number {
  if (!points || points.length < 3) return 0
  const bearing = (a: LngLat, b: LngLat) => {
    const rad = Math.PI / 180
    const y = Math.sin((b[0] - a[0]) * rad) * Math.cos(b[1] * rad)
    const x = Math.cos(a[1] * rad) * Math.sin(b[1] * rad)
      - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos((b[0] - a[0]) * rad)
    return Math.atan2(y, x) * 180 / Math.PI
  }
  const ring = closed ? [...points, points[0], points[1]] : points
  let n = 0
  for (let i = 1; i < ring.length - 1; i++) {
    let turn = Math.abs(bearing(ring[i], ring[i + 1]) - bearing(ring[i - 1], ring[i]))
    if (turn > 180) turn = 360 - turn
    if (turn >= degrees) n++
  }
  return n
}
