/**
 * A map of an address, drawn rather than fetched.
 *
 * Seeded off the address itself, so an office draws the same streets every
 * time -- a map that reshuffled on every load would be decoration admitting it
 * is decoration. Nothing here is a claim about the real geography, and the
 * address chip on top is the part that is actually true; when this takes real
 * tiles, the frame, the pin and the chip are the parts that stay.
 *
 * Roads read as roads only because the ground is darker than they are. A white
 * road on a near-white block is a gap, not a street, which is what the
 * --mapland / --mapblock / --maproad tokens carry in both themes.
 */
const W = 340, H = 170

function seedOf(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}

function rngOf(seed: number) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

export function mapPaths(addr: string) {
  const r = rngOf(seedOf(addr))
  const o: string[] = []
  const pick = (a: number[]) => a[Math.floor(r() * a.length)]

  // Streets are not evenly spaced anywhere real, so the spacing wanders and
  // roughly one run in each direction comes out a long block.
  const lanes = (span: number, lo: number, hi: number) => {
    const xs: number[] = []
    let x = -(lo * r())
    while (x < span + lo) { xs.push(x); x += lo + r() * (hi - lo) + (r() < 0.18 ? lo * 0.9 : 0) }
    return xs
  }
  let vs = lanes(W, 44, 74), hs = lanes(H, 38, 60)

  // The pin sits on a parcel, not in the middle of an intersection -- so find
  // the crossing nearest the middle and shift the whole grid onto it.
  const near = (a: number[], t: number) =>
    a.reduce((b, v) => (Math.abs(v - t) < Math.abs(b - t) ? v : b), a[0])
  const dx = W / 2 - near(vs, W / 2), dy = H * 0.56 - near(hs, H * 0.56)
  vs = vs.map((v) => v + dx); hs = hs.map((v) => v + dy)

  const av = pick(vs.filter((v) => v > 30 && v < W - 30)) ?? W / 2
  const ah = pick(hs.filter((v) => v > 26 && v < H - 26)) ?? H / 2

  o.push(`<rect width="${W}" height="${H}" fill="var(--mapland)"/>`)

  const park = Math.floor(r() * Math.max(1, vs.length - 1))
  const parkr = Math.floor(r() * Math.max(1, hs.length - 1))
  for (let i = 0; i < vs.length - 1; i++) {
    for (let j = 0; j < hs.length - 1; j++) {
      const x = vs[i] + 3, y = hs[j] + 3
      const w = vs[i + 1] - vs[i] - 6, h = hs[j + 1] - hs[j] - 6
      if (w <= 0 || h <= 0) continue
      const isPark = i === park && j === parkr
      o.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}"`
        + ` height="${h.toFixed(1)}" rx="1.5" fill="var(--${isPark ? 'mappark' : 'mapblock'})"/>`)
      // Building footprints, but not in every block -- a city where every
      // parcel is built on is a circuit board.
      if (!isPark && r() < 0.55) {
        const n = 1 + Math.floor(r() * 3)
        for (let k = 0; k < n; k++) {
          const bw = 6 + r() * (w * 0.4), bh = 5 + r() * (h * 0.45)
          if (bw > w - 4 || bh > h - 4) continue
          o.push(`<rect x="${(x + 2 + r() * (w - bw - 4)).toFixed(1)}"`
            + ` y="${(y + 2 + r() * (h - bh - 4)).toFixed(1)}"`
            + ` width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="var(--mapink)" opacity=".13"/>`)
        }
      }
    }
  }

  if (r() < 0.6) {
    const wy = 8 + r() * (H - 16)
    let d = `M-6 ${wy.toFixed(1)}`
    for (let t = 0; t <= 6; t++) {
      d += ` Q${(t * W / 6 + W / 12).toFixed(1)} ${(wy + (r() - 0.5) * 34).toFixed(1)}`
        + ` ${((t + 1) * W / 6).toFixed(1)} ${(wy + (r() - 0.5) * 22).toFixed(1)}`
    }
    o.push(`<path d="${d}" fill="none" stroke="var(--mapwater)"`
      + ` stroke-width="${(5 + r() * 4).toFixed(1)}" stroke-linecap="round"/>`)
  }

  // Every casing first, then every surface, so junctions merge into one
  // crossing instead of each road painting its own edge across the others.
  const road = (d: string, wide: boolean) => {
    const w = wide ? 11 : 6
    return [
      `<path d="${d}" stroke="var(--maproad-e)" stroke-width="${w + 2}" fill="none" stroke-linecap="square"/>`,
      `<path d="${d}" stroke="var(--maproad)" stroke-width="${w}" fill="none" stroke-linecap="square"/>`,
    ]
  }
  const casing: string[] = [], surf: string[] = []
  vs.forEach((v) => { const p = road(`M${v.toFixed(1)} -4V${H + 4}`, v === av); casing.push(p[0]); surf.push(p[1]) })
  hs.forEach((v) => { const p = road(`M-4 ${v.toFixed(1)}H${W + 4}`, v === ah); casing.push(p[0]); surf.push(p[1]) })
  o.push(casing.join(''), surf.join(''))

  // The centre line is what makes an arterial read as one rather than as a
  // street somebody drew too thick.
  o.push(`<path d="M${av.toFixed(1)} -4V${H + 4}" stroke="var(--mapink)" stroke-width=".8"`
    + ` stroke-dasharray="5 6" opacity=".5" fill="none"/>`)
  o.push(`<path d="M-4 ${ah.toFixed(1)}H${W + 4}" stroke="var(--mapink)" stroke-width=".8"`
    + ` stroke-dasharray="5 6" opacity=".5" fill="none"/>`)

  const px = W / 2 + 14, py = H * 0.56 + 13
  o.push(`<rect x="${px - 19}" y="${py - 15}" width="40" height="30" rx="2" fill="var(--mappin)" opacity=".14"/>`)
  o.push(`<rect x="${px - 19}" y="${py - 15}" width="40" height="30" rx="2" fill="none" stroke="var(--mappin)" stroke-width="1.1" opacity=".5"/>`)
  o.push(`<ellipse cx="${px}" cy="${py + 1.5}" rx="6.5" ry="2.4" fill="#000" opacity=".22"/>`)
  o.push(`<g transform="translate(${px},${py})">`
    + `<path d="M0 0c-5.2-7.4-8.4-11.6-8.4-15.6a8.4 8.4 0 0 1 16.8 0C8.4-11.6 5.2-7.4 0 0z"`
    + ` fill="var(--mappin)" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`
    + `<circle cy="-15.6" r="3.1" fill="#fff"/></g>`)

  return o.join('')
}

export default function DrawnMap({ address, label }: { address: string; label?: string }) {
  return (
    <span className="map">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
           role="img" aria-label={`Map of ${address.replace(/\n/g, ' ')}`}
           dangerouslySetInnerHTML={{ __html: mapPaths(address) }} />
      <span className="mapaddr">{label ?? address}</span>
    </span>
  )
}
