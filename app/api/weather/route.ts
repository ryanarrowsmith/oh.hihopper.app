import { NextResponse } from 'next/server'

/**
 * The temperature at a place.
 *
 * Open-Meteo, which wants no key -- so there is no secret here and nothing to
 * rotate. Called from the server rather than the browser so the reader's
 * machine is not making a request to a third party on Hopper's behalf, and so
 * the answer can be cached once for everybody rather than once per tab.
 *
 * Fifteen minutes. Weather does not move faster than that, and a home page that
 * called out on every load would spend its first hundred milliseconds on the
 * least important thing on it.
 */
export const revalidate = 900

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))

  // Bounds, not just presence: this is a URL we build from user data and then
  // hand to somebody else, and "is it a number" is not the same question as
  // "is it a coordinate".
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
      || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'Not a coordinate.' }, { status: 400 })
  }

  try {
    const r = await fetch(
      'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      + '&current=temperature_2m&temperature_unit=fahrenheit',
      { signal: AbortSignal.timeout(4000), next: { revalidate: 900 } },
    )
    if (!r.ok) throw new Error(`Open-Meteo answered ${r.status}`)
    const j = await r.json()
    const t = j?.current?.temperature_2m
    if (typeof t !== 'number') throw new Error('No temperature in the answer.')
    return NextResponse.json({ f: Math.round(t) })
  } catch {
    // The weather is the least important thing on the page, so it fails the
    // way the least important thing should: quietly, with the clock and the
    // date still standing. 200 and no figure, not a 500 the caller has to
    // decide what to do about.
    return NextResponse.json({ f: null })
  }
}
