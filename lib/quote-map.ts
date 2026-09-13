import { toPixel, feetPerPixel, lineFeet, type LngLat, type View } from '@/lib/geo'

export type MapRun = { label: string; points: LngLat[]; closed: boolean }

export type MapArt = {
  /** The line, the corners and nothing else, as a data URI to lay over the aerial. */
  ink: string
  /** Where each run's label goes, and what it says. Drawn as TYPE, not as SVG. */
  labels: { x: number; y: number; text: string }[]
  scale: { feet: number; px: number }
}

/**
 * The quote map's artwork, in two halves on purpose.
 *
 * GEOMETRY IS SVG. TYPE IS NOT. The first version put the run labels and the
 * scale bar inside the SVG with `font-family="monospace"`, and it rendered as a
 * row of empty white boxes: the image renderer rasterizes an embedded SVG with
 * no fonts of its own, so every `<text>` silently disappeared. Nothing about the
 * code looked wrong, and the picture that would have gone to a customer had
 * blank labels where the lengths should be.
 *
 * So the SVG carries the line, its corners and nothing else, and the labels come
 * back as positions for the caller to draw with real type. Found by rendering it
 * rather than by reading it.
 */
export function quoteMapArt(runs: MapRun[], v: View): MapArt {
  const strokes: string[] = []
  const labels: MapArt['labels'] = []
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

  for (const r of runs) {
    const px = r.points.map((p) => toPixel(v, p))
    const d = px.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
      + (r.closed && px.length > 2 ? ' Z' : '')

    // A dark strand under a light one, so the line reads on grass, on gravel and
    // on a white concrete pad without a color that has to mean something.
    strokes.push(
      `<path d="${d}" fill="none" stroke="rgba(35,31,32,.6)" stroke-width="11"`
      + ` stroke-linejoin="round" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#F2A93B" stroke-width="5"`
      + ` stroke-linejoin="round" stroke-linecap="round"/>`
      + px.map(([x, y]) =>
          `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"`
          + ` fill="#FBF9F5" stroke="#231F20" stroke-width="3"/>`).join(''))

    // The label sits on the run's longest leg, where two runs meeting at a corner
    // will not stack two labels on the same spot -- and inside the picture, since
    // half a label is worse than a label somewhere slightly less ideal.
    let best = 0, bi = 1
    for (let i = 1; i < px.length; i++) {
      const l = Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1])
      if (l > best) { best = l; bi = i }
    }
    labels.push({
      x: clamp((px[bi][0] + px[bi - 1][0]) / 2, 110, v.w - 110),
      y: clamp((px[bi][1] + px[bi - 1][1]) / 2 - 34, 8, v.h - 40),
      text: `${r.label} · ${Math.round(lineFeet(r.points, r.closed)).toLocaleString('en-US')} ft`,
    })
  }

  // A picture of a line with no scale is a picture of a squiggle. Rounded to a
  // figure somebody can actually use against the photograph.
  const fpp = feetPerPixel(v)
  const want = (v.w / 5) * fpp
  const feet = [10, 20, 25, 50, 100, 200, 250, 500, 1000]
    .reduce((b, s) => (Math.abs(s - want) < Math.abs(b - want) ? s : b), 10)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${v.w}" height="${v.h}"`
    + ` viewBox="0 0 ${v.w} ${v.h}">${strokes.join('')}</svg>`

  return {
    ink: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    labels,
    scale: { feet, px: Math.round(feet / fpp) },
  }
}
