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
 * What is wrong with a token, said without ever printing one. A 401 from
 * Mapbox means the string it received is not a token it knows -- and by far
 * the commonest cause is a paste that carried quotes, a newline, or only half
 * the value. This describes the shape so the fault is visible without anyone
 * having to reveal a secret in a dashboard.
 */
function tokenShape(raw: string) {
  const bits: string[] = []
  if (raw !== raw.trim()) bits.push('has surrounding whitespace')
  const t = raw.trim()
  if (/^['"]|['"]$/.test(t)) bits.push('is wrapped in quotes')
  if (/\s/.test(t)) bits.push('contains a space or line break')
  if (!/^(pk|sk|tk)\./.test(t)) bits.push(`does not start with pk. or sk. (starts "${t.slice(0, 3)}")`)
  else bits.push(`starts ${t.slice(0, 3)}`)
  bits.push(`${t.length} characters`)
  return bits.join(', ')
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
  const raw = process.env.MAPBOX_TOKEN
  if (!raw || !raw.trim()) return { ok: false, reason: 'unconfigured' }
  const token = raw.trim().replace(/^['"]|['"]$/g, '')

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
      const said = await res.text().catch(() => '')
      let why = ''
      try { why = JSON.parse(said)?.message ?? '' } catch { why = said.slice(0, 120) }
      const shape = res.status === 401 || res.status === 403 ? ` The token ${tokenShape(raw)}.` : ''
      return { ok: false, reason: 'refused',
               detail: `Mapbox answered ${res.status}${why ? ': ' + why : ''}.${shape}` }
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
  const raw = process.env.MAPBOX_TOKEN
  if (!raw || !raw.trim()) return null
  const token = raw.trim().replace(/^['"]|['"]$/g, '')
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
