import { ImageResponse } from 'next/og'
import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { aerialBoxUrl } from '@/lib/mapbox'
import { viewFit, toLngLat, lineFeet, type LngLat } from '@/lib/geo'
import { quoteMapArt, type MapRun } from '@/lib/quote-map'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const W = 1200, H = 750, BAR = 96
const PLAN = H - BAR

/**
 * The quote map: a picture, not a screenshot.
 *
 * Rendered on the server from the same run geometry that priced the job, at a
 * fixed size, with the job id, the length and the date burned into the caption —
 * so the image in a customer's hand can always be tied back to the takeoff it
 * came from. A screenshot of the estimator would carry whatever the salesperson's
 * window happened to be showing, and nothing that says which job it is.
 *
 * `?option=<id>` draws the geometry FROZEN on that option rather than the runs as
 * they stand now. That is what makes the picture reproducible: the option keeps
 * its own measure, so regenerating the map for a quote sent in March gives the
 * March line, not today's.
 *
 * The frame comes from the geometry alone (lib/geo.ts `viewFit`), never from
 * anything a person is holding, so the same line always produces the same
 * picture.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) return new NextResponse('Sign in first.', { status: 401 })

  const db = supabaseServer()
  const url = new URL(req.url)
  const optionId = url.searchParams.get('option')

  const { data: job } = await db.schema('hopper').from('fence_job')
    .select('id, ref, name, customer, site_address, cls')
    .eq('account_id', session.accountId).eq('id', params.id).maybeSingle()
  if (!job) return new NextResponse('No such job.', { status: 404 })

  // Either the line as frozen on an option, or the line as it stands.
  let runs: MapRun[] = []
  let asOf: string | null = null

  if (optionId) {
    const { data: opt } = await db.schema('hopper').from('fence_option')
      .select('takeoff, priced_at, label')
      .eq('account_id', session.accountId).eq('id', optionId).maybeSingle()
    const frozen: any = (opt as any)?.takeoff
    asOf = (opt as any)?.priced_at?.slice(0, 10) ?? null
    // The snapshot keeps each run's measure, and the points with it when the run
    // was drawn. A run that was walked with a wheel has no shape to draw.
    runs = (frozen?.measure?.runs ?? [])
      .filter((r: any) => Array.isArray(r.points) && r.points.length >= 2)
      .map((r: any) => ({ label: r.label, points: r.points, closed: !!r.closed }))
  }

  if (runs.length === 0) {
    const { data: live } = await db.schema('hopper').from('fence_run')
      .select('label, points, closed_loop, sort')
      .eq('account_id', session.accountId).eq('job_id', params.id).order('sort')
    runs = ((live ?? []) as any[])
      .filter((r) => Array.isArray(r.points) && r.points.length >= 2)
      .map((r) => ({ label: r.label, points: r.points as LngLat[], closed: !!r.closed_loop }))
  }

  if (runs.length === 0) {
    return new NextResponse('Nothing has been drawn on this job yet.', { status: 409 })
  }

  const all = runs.flatMap((r) => r.points)
  const view = viewFit(all, W, PLAN)
  const sw = toLngLat(view, 0, PLAN), ne = toLngLat(view, W, 0)
  const aerial = aerialBoxUrl({
    west: sw[0], south: sw[1], east: ne[0], north: ne[1],
    // Half size from Mapbox at @2x is the same pixels, and one request rather
    // than the largest the API will give us.
    width: W / 2, height: PLAN / 2,
  })

  const feet = runs.reduce((s, r) => s + lineFeet(r.points, r.closed), 0)
  const art = quoteMapArt(runs, view)
  const today = new Date().toISOString().slice(0, 10)

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
            {art.scale.feet} ft
          </div>
        </div>
        {/* The caption is the half that makes this evidence rather than a
            picture: which job, how long, measured how, and when. */}
        <div style={{ display: 'flex', alignItems: 'center', width: W, height: BAR,
                      background: '#231F20', color: '#FBF9F5', padding: '0 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>
              {job.ref}{job.name ? ` · ${job.name}` : ''}
            </div>
            <div style={{ fontSize: 17, color: '#B9B2A6', marginTop: 4 }}>
              {Math.round(feet).toLocaleString('en-US')} ft ·{' '}
              {runs.length} run{runs.length === 1 ? '' : 's'}
              {job.site_address ? ` · ${job.site_address}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, color: '#231F20',
                          background: '#F2A93B', padding: '4px 10px' }}>
              PRELIMINARY
            </div>
            <div style={{ fontSize: 15, color: '#B9B2A6', marginTop: 6 }}>
              {asOf ? `Priced ${asOf}` : `Measured ${today}`} · aerial
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: W, height: H,
      headers: { 'Cache-Control': 'private, max-age=300' },
    },
  )
}
