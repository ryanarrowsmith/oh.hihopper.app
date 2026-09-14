import { ImageResponse } from 'next/og'
import { aerialBoxUrl } from '@/lib/mapbox'
import { viewFit, toLngLat, lineFeet } from '@/lib/geo'
import { quoteMapArt, type MapRun } from '@/lib/quote-map'

/* ==========================================================================
   THE QUOTE MAP, DRAWN ONCE.

   Two routes reach this: /fence/[id]/map for somebody signed in, and
   /e/[token]/map for the customer holding the estimate. They differ only in how
   they are allowed to ask -- a session, or a token -- and they must not differ
   in what comes out, because the picture on the customer's page and the picture
   in the record are supposed to be the same evidence.
   ========================================================================== */

export const W = 1200, H = 750, BAR = 96
export const PLAN = H - BAR

export type MapJob = {
  ref: string; name: string | null; site_address: string | null
}

/**
 * THE BYTES ARE MADE HERE, NOT HANDED BACK LAZILY.
 *
 * `new ImageResponse(...)` returns instantly and rasterizes while the body is
 * being read, so anything that goes wrong in the drawing -- a font that will
 * not load, an aerial tile that will not fetch -- throws OUTSIDE whatever
 * try/catch wrapped the call and reaches a browser as a bare 500 inside an
 * <img>. Reading the buffer here puts the failure back where it can be caught
 * and named, which is the difference between a broken image and a sentence.
 */
export async function renderQuoteMap(
  job: MapJob, runs: MapRun[], asOf: string | null, cache: string,
  /** Draw without the aerial layer. The one thing that differs between a
   *  machine with no Mapbox token -- where this has always rendered -- and the
   *  deployment where it has never rendered at all, so it is worth being able
   *  to ask the question in production rather than guessing at it again. */
  bare = false,
): Promise<Response> {
  const img = build(job, runs, asOf, bare)
  return new Response(await img.arrayBuffer(), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': cache },
  })
}

function build(job: MapJob, runs: MapRun[], asOf: string | null,
               bare: boolean): ImageResponse {
  const all = runs.flatMap((r) => r.points)
  const view = viewFit(all, W, PLAN)
  const sw = toLngLat(view, 0, PLAN), ne = toLngLat(view, W, 0)
  const aerial = bare ? null : aerialBoxUrl({
    west: sw[0], south: sw[1], east: ne[0], north: ne[1],
    // Half size from Mapbox at @2x is the same pixels, and one request rather
    // than the largest the API will give us.
    width: W / 2, height: PLAN / 2,
  })

  const feet = runs.reduce((s, r) => s + lineFeet(r.points, r.closed), 0)
  const art = quoteMapArt(runs, view)
  const today = new Date().toISOString().slice(0, 10)

  /* ONE CHILD PER BOX, AND EVERY BOX SAYS display.
     Satori -- what next/og draws with -- refuses a <div> that has more than one
     child and no explicit display, and adjacent expressions in JSX are separate
     children even when they are all text. `{job.ref}{suffix}` is two. That is
     what has been throwing this route in production: it raises while the
     response body is being piped, so it arrived as "failed to pipe response"
     with the real reason two frames down. So every line below is composed in
     JavaScript and handed over as a single string. */
  const title = `${job.ref}${job.name ? ` · ${job.name}` : ''}`
  const under = `${Math.round(feet).toLocaleString('en-US')} ft`
    + ` · ${runs.length} run${runs.length === 1 ? '' : 's'}`
    + (job.site_address ? ` · ${job.site_address}` : '')
  const stamp = `${asOf ? `Priced ${asOf}` : `Measured ${today}`} · aerial`
  const scale = `${art.scale.feet} ft`

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: W, height: H,
                    background: '#FBF9F5' }}>
        <div style={{ display: 'flex', position: 'relative', width: W, height: PLAN }}>
          {aerial && <img src={aerial} width={W} height={PLAN} alt="" />}
          <img src={art.ink} width={W} height={PLAN} alt=""
               style={{ position: 'absolute', top: 0, left: 0 }} />

          {/* Type, drawn by the image renderer rather than by the SVG. An
              embedded SVG is rasterized with no fonts, so every <text> in it
              comes out blank -- which is a quote map with no lengths on it. */}
          {art.labels.map((l, i) => (
            <div key={i} style={{
              display: 'flex', position: 'absolute', left: l.x, top: l.y,
              transform: 'translateX(-50%)',
              background: '#FBF9F5', border: '2px solid #231F20',
              padding: '3px 10px', fontSize: 20, fontWeight: 600, color: '#231F20',
            }}>{l.text}</div>
          ))}

          <div style={{
            display: 'flex', position: 'absolute', left: 22, top: PLAN - 56,
            alignItems: 'center', gap: 12,
            background: 'rgba(251,249,245,.93)', border: '2px solid #231F20',
            padding: '7px 12px', fontSize: 19, color: '#231F20',
          }}>
            <div style={{ display: 'flex', width: art.scale.px, height: 5,
                          background: '#231F20' }} />
            <div style={{ display: 'flex' }}>{scale}</div>
          </div>
        </div>
        {/* The caption is the half that makes this evidence rather than a
            picture: which job, how long, measured how, and when. */}
        <div style={{ display: 'flex', alignItems: 'center', width: W, height: BAR,
                      background: '#231F20', color: '#FBF9F5', padding: '0 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700 }}>{title}</div>
            <div style={{ display: 'flex', fontSize: 17, color: '#B9B2A6',
                          marginTop: 4 }}>{under}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, color: '#231F20',
                          background: '#F2A93B', padding: '4px 10px' }}>
              PRELIMINARY
            </div>
            <div style={{ display: 'flex', fontSize: 15, color: '#B9B2A6',
                          marginTop: 6 }}>{stamp}</div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H },
  )
}
