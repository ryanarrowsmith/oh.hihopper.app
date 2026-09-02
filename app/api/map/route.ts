import { NextResponse } from 'next/server'
import { staticMapUrl } from '@/lib/mapbox'
import { currentSession } from '@/lib/tenant'

export const revalidate = 86400   // a street does not move

/**
 * Proxies one static map image so MAPBOX_TOKEN stays on the server.
 * Signed-in only: an open proxy on somebody else's Mapbox bill is a gift to
 * whoever finds it.
 */
export async function GET(req: Request) {
  if (!(await currentSession())) return new NextResponse('Sign in first.', { status: 401 })

  const q = new URL(req.url).searchParams
  const latitude = Number(q.get('lat')), longitude = Number(q.get('lng'))
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return new NextResponse('Bad pin.', { status: 400 })
  }

  const url = staticMapUrl({
    latitude, longitude,
    zoom: Number(q.get('z')) || undefined,
    width: Number(q.get('w')) || undefined,
    height: Number(q.get('h')) || undefined,
    dark: q.get('theme') === 'dark',
  })
  if (!url) return new NextResponse('Maps are not configured.', { status: 503 })

  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return new NextResponse('Mapbox refused it.', { status: 502 })

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
