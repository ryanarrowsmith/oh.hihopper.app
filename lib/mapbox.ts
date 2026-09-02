/**
 * Mapbox, server-side only.
 *
 * The token lives in MAPBOX_TOKEN and never reaches the browser -- map images
 * are proxied through /api/map. A public pk.* token in the HTML is the normal
 * way to do this and it is fine until somebody lifts it; proxying costs one
 * route and removes the question.
 */
const GEOCODE = 'https://api.mapbox.com/search/geocode/v6/forward'

export type Pin = { latitude: number; longitude: number }

export function addressOf(l: {
  address_line1?: string | null; address_line2?: string | null
  city?: string | null; region?: string | null
  postal_code?: string | null; country?: string | null
}) {
  return [l.address_line1, l.address_line2,
          [l.city, [l.region, l.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          l.country].filter(Boolean).join(', ').trim()
}

/**
 * Returns null rather than throwing: a location that could not be pinned is
 * still a location, and the address is the thing that matters. A wrong pin is
 * worse than none, so a low-confidence match is refused too.
 */
export async function geocode(address: string): Promise<Pin | null> {
  const token = process.env.MAPBOX_TOKEN
  if (!token || !address) return null
  try {
    const url = `${GEOCODE}?q=${encodeURIComponent(address)}&limit=1&access_token=${token}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const j = await res.json()
    const f = j?.features?.[0]
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length !== 2) return null
    const acc = f?.properties?.match_code?.confidence
    if (acc === 'low') return null
    return { longitude: Number(c[0]), latitude: Number(c[1]) }
  } catch {
    return null
  }
}

/** The image URL, built server-side. Never rendered into the page. */
export function staticMapUrl(o: {
  latitude: number; longitude: number; zoom?: number
  width?: number; height?: number; dark?: boolean
}) {
  const token = process.env.MAPBOX_TOKEN
  if (!token) return null
  const style = o.dark
    ? (process.env.MAPBOX_STYLE_DARK || 'mapbox/dark-v11')
    : (process.env.MAPBOX_STYLE || 'mapbox/light-v11')
  const z = o.zoom ?? 14.2
  const w = Math.min(o.width ?? 640, 1280)
  const h = Math.min(o.height ?? 260, 1280)
  // No Mapbox marker: the pin is drawn over the image in the brand's own amber,
  // so it stays sharp, stays on-palette, and follows the theme.
  return `https://api.mapbox.com/styles/v1/${style}/static/`
    + `${o.longitude},${o.latitude},${z},0/${w}x${h}@2x`
    + `?access_token=${token}&attribution=false&logo=false`
}
