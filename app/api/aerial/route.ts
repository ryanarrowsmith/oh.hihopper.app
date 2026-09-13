import { NextResponse } from 'next/server'
import { aerialBoxUrl } from '@/lib/mapbox'
import { currentSession } from '@/lib/tenant'

export const revalidate = 86400   // a parcel does not move either

/**
 * Proxies one aerial of one bounding box, so MAPBOX_TOKEN stays on the server.
 *
 * Signed-in only, like /api/map: an open image proxy on somebody else's Mapbox
 * bill is a gift to whoever finds it. The box comes from the client because the
 * client is what the person is panning and zooming, and it is bounded here
 * rather than trusted — a 10-degree box at 1280px is a picture of Oklahoma
 * charged as a parcel.
 */
export async function GET(req: Request) {
  if (!(await currentSession())) return new NextResponse('Sign in first.', { status: 401 })

  const q = new URL(req.url).searchParams
  const num = (k: string) => Number(q.get(k))
  const [west, south, east, north] = ['w', 's', 'e', 'n'].map(num)
  const width = num('px') || 800, height = num('py') || 600

  const ok = [west, south, east, north].every(Number.isFinite)
    && east > west && north > south
    && Math.abs(east - west) < 0.2 && Math.abs(north - south) < 0.2
    && Math.abs(north) <= 85 && Math.abs(south) <= 85
  if (!ok) return new NextResponse('Bad box.', { status: 400 })

  const url = aerialBoxUrl({ west, south, east, north, width, height })
  if (!url) return new NextResponse('Maps are not configured.', { status: 503 })

  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) {
    // Mapbox's own words. 'Mapbox refused it' tells nobody anything.
    const said = (await res.text().catch(() => '')).slice(0, 200)
    return new NextResponse(`Mapbox answered ${res.status}. ${said}`, { status: 502 })
  }

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
