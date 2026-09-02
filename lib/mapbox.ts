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
export type GeocodeResult =
  | { ok: true; pin: Pin }
  | { ok: false; reason: 'unconfigured' | 'unresolved' | 'refused'; detail?: string }

export type Place = {
  address_line1?: string | null; address_line2?: string | null
  city?: string | null; region?: string | null
  postal_code?: string | null; country?: string | null
}

export function addressOf(l: Place) {
  return [l.address_line1, l.address_line2,
          [l.city, [l.region, l.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          l.country].filter(Boolean).join(', ').trim()
}

/** Mapbox wants ISO-3166 alpha-2, not the word people type. */
function countryCode(name?: string | null) {
  const s = (name ?? '').trim().toLowerCase()
  if (!s) return 'us'
  if (/^(us|usa|united states.*)$/.test(s)) return 'us'
  if (/^(ca|canada)$/.test(s)) return 'ca'
  if (/^(uk|gb|united kingdom.*|great britain)$/.test(s)) return 'gb'
  if (/^(mx|mexico|méxico)$/.test(s)) return 'mx'
  return s.length === 2 ? s : ''
}

/**
 * Structured lookup, not a mashed-together string. Mapbox matches street,
 * city, region and postcode far better as separate fields -- and address_line2
 * is deliberately left out, because a suite or mailbox number ("#52014") is
 * not part of what a geocoder can find and only makes the match worse.
 *
 * The reason comes back with the failure. "Not configured" and "could not be
 * found" are different problems and a message that confuses them sends people
 * to check an address that was never the fault.
 */
export async function geocode(place: Place): Promise<GeocodeResult> {
  const token = process.env.MAPBOX_TOKEN
  if (!token) return { ok: false, reason: 'unconfigured' }

  const q = new URLSearchParams({ access_token: token, limit: '1' })
  const put = (k: string, v?: string | null) => { if (v && v.trim()) q.set(k, v.trim()) }
  put('address_line1', place.address_line1)
  put('place', place.city)
  put('region', place.region)
  put('postcode', place.postal_code)
  const cc = countryCode(place.country); if (cc) q.set('country', cc)

  if (!q.has('address_line1') && !q.has('place') && !q.has('postcode')) {
    return { ok: false, reason: 'unresolved', detail: 'There is no address to look up yet.' }
  }

  try {
    const res = await fetch(`${GEOCODE}?${q}`, { cache: 'no-store' })
    if (!res.ok) {
      return { ok: false, reason: 'refused', detail: `Mapbox answered ${res.status}.` }
    }
    const j = await res.json()
    const f = j?.features?.[0]
    const c = f?.geometry?.coordinates
    if (!Array.isArray(c) || c.length !== 2) return { ok: false, reason: 'unresolved' }

    // Reject only an outright low-confidence guess. A street that Mapbox
    // places on the right block is more useful than no map at all.
    if (f?.properties?.match_code?.confidence === 'low') {
      return { ok: false, reason: 'unresolved',
               detail: 'Mapbox found only a rough match for that address.' }
    }
    return { ok: true, pin: { longitude: Number(c[0]), latitude: Number(c[1]) } }
  } catch (e) {
    return { ok: false, reason: 'refused', detail: 'The lookup did not complete.' }
  }
}

/** What to say when a pin could not be set. Never blame the address for a
 *  missing token. */
export function whyNoPin(r: Exclude<GeocodeResult, { ok: true }>) {
  if (r.reason === 'unconfigured') {
    return 'Maps are not switched on yet — MAPBOX_TOKEN is not set on this deployment.'
  }
  if (r.reason === 'refused') {
    return `Mapbox could not be reached. ${r.detail ?? ''}`.trim()
  }
  return r.detail ?? 'That address did not resolve to a point on the map.'
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
  return `https://api.mapbox.com/styles/v1/${style}/static/`
    + `${o.longitude},${o.latitude},${z},0/${w}x${h}@2x`
    + `?access_token=${token}&attribution=false&logo=false`
}
