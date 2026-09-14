import { inflateSync } from 'node:zlib'
import { FT_PER_M, type LngLat } from '@/lib/geo'

/**
 * What the ground does under a line, read off Mapbox's elevation tiles.
 *
 * ALL OF THIS IS PURE — no `server-only`, no token, no fetch — which is what
 * lets lib/terrain.check.ts build a PNG of its own and decode it back. The
 * decoder is the part that most needs checking, because a PNG read wrong does
 * not throw: it returns a hillside that is not there. The fetching lives next
 * door in lib/terrain-read.ts, where the token is.
 *
 * WHY THIS EXISTS, and what it is NOT for. A fence follows the ground, and an
 * aerial photograph cannot see a slope — so at estimate time, where nobody has
 * stood on the site, every job was priced as though the lot were flat.
 *
 * It is NOT a length correction. A 7.5% grade over 186 feet adds six inches;
 * even a brutal 20% adds two percent. Chasing that would be chasing a rounding
 * error. What a slope actually costs is the BUILD METHOD — stepped panels
 * instead of raked ones, longer posts, more terminal posts, and the labor to
 * set them — which is a site condition with a charge code, priced by quantity
 * through the rate book like everything else.
 *
 * So this file answers one question: does this run fall enough to matter, and
 * by how much? The screen turns that into a sentence and a pre-ticked
 * condition. It never touches the quoted footage.
 *
 * HONEST ABOUT THE DATA. Mapbox's terrain is roughly a ten-metre posting. It
 * will catch a real hill and it will not catch a two-foot berm, so every figure
 * here is reported as an estimate and a person standing on the ground beats it
 * — which is exactly what the survey screen is for.
 */

/* Terrain-RGB tops out at zoom 15, which is about 3.9 metres a pixel at Tulsa's
   latitude — finer than the source data, so there is nothing to gain by asking
   for @2x tiles and twice the bytes. */
export const Z = 15
export const TILE = 256
/* A grade measured between two samples ten feet apart is mostly quantization:
   the encoding steps in tenths of a metre, so a single step reads as 3%. Fifty
   feet is a baseline long enough to mean something, and is also about the
   distance over which a crew decides to step a panel rather than rake it. */
const STEP_FT = 50
/* A run needs a lot of tiles only when it is enormous or the points are wrong.
   Either way, stop rather than hammer the API. */
export const MAX_TILES = 9

export type Fall = {
  /** Total rise and fall along the run, in feet. */
  fallFt: number
  /** The steepest fifty-foot stretch, in percent. */
  steepest: number
  /** Roughly how many panels would want stepping, at the spec's spacing. */
  steps: number
}

// ------------------------------------------------------------------ the tiles
/** Web Mercator tile coordinates, kept fractional so the pixel falls out of it. */
export function atZoom([lng, lat]: LngLat) {
  const f = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180
  const n = 2 ** Z
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2) * n,
  }
}

/**
 * A PNG, decoded here rather than by a library.
 *
 * Terrain-RGB tiles are one narrow shape — eight bits a channel, colour type 2
 * or 6, not interlaced — so the general case is not needed, and the general
 * case would mean depending on `sharp`, which this project only has as an
 * undeclared transitive of Next's image optimizer. A decoder that fits on a
 * screen and can be exercised against a PNG built in a test is worth more here
 * than a native module that might not survive an upgrade.
 *
 * Returns the pixels as RGB triples, or null for anything unexpected — a
 * refusal that reads as "no terrain reading", never as flat ground.
 */
export function decodePng(buf: Buffer): { w: number; h: number; px: Uint8Array } | null {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null
  let at = 8
  let w = 0, h = 0, depth = 0, kind = 0, interlace = 0
  const idat: Buffer[] = []

  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at)
    const tag = buf.toString('latin1', at + 4, at + 8)
    const body = buf.subarray(at + 8, at + 8 + len)
    if (tag === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4)
      depth = body[8]; kind = body[9]; interlace = body[12]
    } else if (tag === 'IDAT') {
      idat.push(body)
    } else if (tag === 'IEND') break
    at += 12 + len
  }
  if (!w || !h || depth !== 8 || interlace !== 0) return null
  const ch = kind === 2 ? 3 : kind === 6 ? 4 : 0
  if (!ch) return null

  let raw: Buffer
  try { raw = inflateSync(Buffer.concat(idat)) } catch { return null }
  if (raw.length < h * (1 + w * ch)) return null

  /* Undo the per-row filters. The five filter types are the whole of PNG's
     compression cleverness and each is two lines; getting one wrong shows up as
     a tile that shears, which is why the check file decodes an image it built
     itself with every filter exercised. */
  const px = new Uint8Array(w * h * 3)
  const line = new Uint8Array(w * ch)
  const prev = new Uint8Array(w * ch)
  let p = 0
  for (let y = 0; y < h; y++) {
    const f = raw[p++]
    for (let i = 0; i < w * ch; i++) {
      const x = raw[p + i]
      const a = i >= ch ? line[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v: number
      switch (f) {
        case 0: v = x; break
        case 1: v = x + a; break
        case 2: v = x + b; break
        case 3: v = x + ((a + b) >> 1); break
        case 4: {
          const q = a + b - c
          const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c)
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: return null
      }
      line[i] = v & 0xff
    }
    p += w * ch
    for (let x = 0; x < w; x++) {
      px[(y * w + x) * 3]     = line[x * ch]
      px[(y * w + x) * 3 + 1] = line[x * ch + 1]
      px[(y * w + x) * 3 + 2] = line[x * ch + 2]
    }
    prev.set(line)
  }
  return { w, h, px }
}

/** Mapbox's encoding, verbatim: metres above sea level in tenths. */
export function metresFrom(r: number, g: number, b: number): number {
  return -10000 + ((r * 65536 + g * 256 + b) * 0.1)
}

// --------------------------------------------------------------- the sampling
/** Points every STEP_FT along the line, in order, including both ends. */
export function walk(points: LngLat[], closed: boolean, stepFt = STEP_FT): LngLat[] {
  const path = closed && points.length > 2 ? [...points, points[0]] : points
  if (path.length < 2) return []
  const out: LngLat[] = [path[0]]
  // Feet per degree, good enough for stepping ALONG a line whose length is
  // measured properly elsewhere by haversine.
  const perLat = 364000
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i]
    const k = Math.cos((y0 * Math.PI) / 180)
    const dx = (x1 - x0) * perLat * k, dy = (y1 - y0) * perLat
    const legFt = Math.hypot(dx, dy)
    const n = Math.max(1, Math.round(legFt / stepFt))
    for (let s = 1; s <= n; s++) {
      out.push([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n])
    }
  }
  return out
}

/** What a sampled profile says. Pure, so it can be checked without a network. */
export function readProfile(metres: (number | null)[], spacingFt: number | null): Fall {
  const ft = metres.map((m) => (m == null ? null : m * FT_PER_M))
  let fall = 0, steepest = 0, steps = 0
  for (let i = 1; i < ft.length; i++) {
    const a = ft[i - 1], b = ft[i]
    if (a == null || b == null) continue
    const d = Math.abs(b - a)
    fall += d
    const pct = (d / STEP_FT) * 100
    if (pct > steepest) steepest = pct
    /* A stretch is stepped when following it would tilt a panel more than a
       crew will accept. Counted per panel at the spec's spacing, because that
       is what gets built and what the rate book charges for. */
    if (pct >= 5 && spacingFt && spacingFt > 0) steps += Math.round(STEP_FT / spacingFt)
  }
  return {
    fallFt: Math.round(fall * 10) / 10,
    steepest: Math.round(steepest * 100) / 100,
    steps,
  }
}

/**
 * A fingerprint of the geometry a reading was taken from.
 *
 * Drawing a line autosaves every two seconds. Without this, every one of those
 * saves would be a handful of tile requests for a line whose shape has not
 * changed. Six decimals is about four inches — finer than the terrain and finer
 * than anybody can tap.
 */
export function terrainKey(points: LngLat[], closed: boolean): string {
  return (closed ? 'c:' : 'o:')
    + points.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(';')
}

/** Whether a reading is worth saying anything about. Ryan, 14 Sep: flag it only
 *  if it is caught, so a flat lot stays silent. */
export function worthSaying(f: Fall | null): boolean {
  return !!f && (f.steepest >= 5 || f.fallFt >= 6)
}
