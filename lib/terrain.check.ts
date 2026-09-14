/**
 * Checks for the terrain reading. `npx tsx lib/terrain.check.ts`
 *
 * The decoder is the part worth checking, because a PNG decoded wrong does not
 * throw — it returns a hillside that is not there. So this file BUILDS a PNG
 * with known pixels, exercising all five row filters, and decodes it back.
 *
 * Nothing here touches the network. The sampling and the profile are pure for
 * exactly that reason.
 */
import { deflateSync } from 'node:zlib'
import { decodePng, metresFrom, walk, readProfile, terrainKey, worthSaying } from './terrain'
import { FT_PER_M, type LngLat } from './geo'

let bad = 0
const ok = (what: string, got: unknown, want: unknown, tol = 0) => {
  const fine = typeof got === 'number' && typeof want === 'number'
    ? Math.abs(got - want) <= tol : got === want
  console.log(`${fine ? 'ok  ' : 'FAIL'}  ${what}: ${got}${fine ? '' : ` (wanted ${want})`}`)
  if (!fine) bad++
}

// ------------------------------------------------------------- build a PNG
function crc32(b: Buffer): number {
  let c = ~0
  for (let i = 0; i < b.length; i++) {
    c ^= b[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(tag: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length)
  const tb = Buffer.concat([Buffer.from(tag, 'latin1'), body])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb))
  return Buffer.concat([len, tb, crc])
}
/** filters[y] picks the row filter, so every one of the five gets exercised. */
function makePng(w: number, h: number, rgb: number[][], filters: number[]): Buffer {
  const rows: Buffer[] = []
  const prev = new Uint8Array(w * 3)
  for (let y = 0; y < h; y++) {
    const f = filters[y % filters.length]
    const line = new Uint8Array(w * 3)
    for (let x = 0; x < w; x++) {
      const p = rgb[y * w + x]
      line[x * 3] = p[0]; line[x * 3 + 1] = p[1]; line[x * 3 + 2] = p[2]
    }
    const enc = new Uint8Array(w * 3)
    for (let i = 0; i < w * 3; i++) {
      const a = i >= 3 ? line[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0
      let v: number
      switch (f) {
        case 1: v = line[i] - a; break
        case 2: v = line[i] - b; break
        case 3: v = line[i] - ((a + b) >> 1); break
        case 4: {
          const q = a + b - c
          const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c)
          v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: v = line[i]
      }
      enc[i] = v & 0xff
    }
    rows.push(Buffer.concat([Buffer.from([f]), Buffer.from(enc)]))
    prev.set(line)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------ decode
const W = 9, H = 10
const want: number[][] = []
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) want.push([(x * 17 + y * 7) & 0xff, (x * 3 + 1) & 0xff, (y * 29) & 0xff])
}
const png = makePng(W, H, want, [0, 1, 2, 3, 4])
const got = decodePng(png)
ok('a PNG decodes at all', !!got, true)
ok('width', got?.w, W)
ok('height', got?.h, H)
let wrong = 0
for (let i = 0; i < W * H; i++) {
  for (let c = 0; c < 3; c++) if (got!.px[i * 3 + c] !== want[i][c]) wrong++
}
ok('every pixel survives all five row filters', wrong, 0)

ok('junk is refused rather than guessed at', decodePng(Buffer.from('<html>not a tile')), null)

// -------------------------------------------------------------- the encoding
// Sea level is (0 + 10000) / 0.1 = 100000 = 1*65536 + 134*256 + 160.
ok('sea level decodes as zero', metresFrom(1, 134, 160), 0.0, 1e-9)
// 100 m is 101000 = 1*65536 + 138*256 + 136. Worked out by hand on purpose:
// the first attempt converted 101000 to hex wrong and the test failed rather
// than the code, which is the right way round.
ok('a hundred metres round-trips', metresFrom(1, 138, 136), 100, 1e-9)
ok('a tenth of a metre is the step', metresFrom(1, 134, 161) - metresFrom(1, 134, 160), 0.1, 1e-9)

// ----------------------------------------------------------------- sampling
// A leg of about 200 ft at Tulsa's latitude, north-south so the cosine is out of it.
const d200 = 200 / 364000
const leg: LngLat[] = [[-95.96, 36.10], [-95.96, 36.10 + d200]]
ok('a 200 ft leg samples at 50 ft: five points', walk(leg, false).length, 5)
ok('the first sample is the first point', walk(leg, false)[0][1], 36.10, 1e-12)
ok('the last sample is the last point', walk(leg, false)[4][1], 36.10 + d200, 1e-12)
ok('a closed loop returns to its start',
   walk([[-95.96, 36.10], [-95.959, 36.10], [-95.959, 36.101]], true).slice(-1)[0][0], -95.96, 1e-9)
ok('one point is not a line', walk([[-95.96, 36.10]], false).length, 0)

// ----------------------------------------------------------------- profile
// Five samples, each 50 ft apart, climbing 1 m then falling 2 m.
const m = [300, 301, 302, 300, 300]
const p = readProfile(m, 10)
// rise 1+1 = 2 m, fall 2 m, flat 0 => 4 m total
ok('fall is the sum of every rise and every drop', p.fallFt, 4 * FT_PER_M, 0.05)
// steepest step is 2 m over 50 ft = 6.56 ft / 50 ft
ok('steepest is the worst fifty feet', p.steepest, (2 * FT_PER_M / 50) * 100, 0.05)
ok('a flat line has no fall', readProfile([300, 300, 300], 10).fallFt, 0)
ok('a flat line is silent', worthSaying(readProfile([300, 300, 300], 10)), false)
ok('a hill speaks up', worthSaying(p), true)
// 0.3 m over 50 ft is about 2% — real, and not worth a sentence.
ok('a gentle slope stays quiet',
   worthSaying(readProfile([300, 300.3, 300.6], 10)), false)
ok('a missing reading is silence, not flat ground', worthSaying(null), false)
ok('gaps in the profile are skipped, not counted as zero',
   readProfile([300, null, 300], 10).fallFt, 0)

// --------------------------------------------------------------------- key
const a: LngLat[] = [[-95.96, 36.10], [-95.959, 36.101]]
ok('the same line fingerprints the same', terrainKey(a, false), terrainKey([...a], false))
ok('closing the loop changes the fingerprint', terrainKey(a, true) === terrainKey(a, false), false)
ok('a nudge under four inches does not',
   terrainKey(a, false), terrainKey([[-95.9600000001, 36.10], [-95.959, 36.101]], false))

console.log(bad ? `\n${bad} FAILED` : '\nall good')
process.exit(bad ? 1 : 0)
