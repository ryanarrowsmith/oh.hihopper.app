import 'server-only'
import { decodePng, metresFrom, walk, terrainKey, readProfile, atZoom, Z, TILE, MAX_TILES,
         type Fall } from '@/lib/terrain'
import type { LngLat } from '@/lib/geo'

/**
 * The one part of the terrain reading that needs a token and a network: asking
 * Mapbox for the tiles. Everything it does with them is in lib/terrain.ts,
 * where it can be checked without either.
 */

/**
 * The reading itself. Null whenever anything is missing or refused — a terrain
 * reading that could not be taken must never arrive looking like level ground.
 */
export async function readFall(
  points: LngLat[], closed: boolean, spacingFt: number | null,
): Promise<Fall | null> {
  const raw = process.env.MAPBOX_TOKEN
  if (!raw || !raw.trim() || points.length < 2) return null
  const token = raw.trim().replace(/^['"]|['"]$/g, '')

  const at = walk(points, closed)
  if (at.length < 2) return null

  // Which tiles this line crosses. Fetched once each, whatever the sampling.
  const need = new Map<string, { tx: number; ty: number }>()
  const where = at.map((p) => {
    const { x, y } = atZoom(p)
    const tx = Math.floor(x), ty = Math.floor(y)
    need.set(`${tx}/${ty}`, { tx, ty })
    return { tx, ty, px: Math.floor((x - tx) * TILE), py: Math.floor((y - ty) * TILE) }
  })
  if (need.size > MAX_TILES) return null

  const tiles = new Map<string, { w: number; h: number; px: Uint8Array }>()
  try {
    await Promise.all([...need.entries()].map(async ([key, t]) => {
      const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${t.tx}/${t.ty}.pngraw`
        + `?access_token=${encodeURIComponent(token)}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return
      // A tile that is not a PNG is an error page, and an error page decoded as
      // terrain would be an invented hillside. Check the type, not the status.
      if (!(res.headers.get('content-type') ?? '').startsWith('image/')) return
      const got = decodePng(Buffer.from(await res.arrayBuffer()))
      if (got) tiles.set(key, got)
    }))
  } catch { return null }
  if (!tiles.size) return null

  const metres = where.map((w) => {
    const t = tiles.get(`${w.tx}/${w.ty}`)
    if (!t) return null
    const i = (Math.min(w.py, t.h - 1) * t.w + Math.min(w.px, t.w - 1)) * 3
    return metresFrom(t.px[i], t.px[i + 1], t.px[i + 2])
  })
  if (metres.every((m) => m == null)) return null
  return readProfile(metres, spacingFt)
}

