import { NextResponse } from 'next/server'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import type { LngLat } from '@/lib/geo'
import type { MapRun } from '@/lib/quote-map'
import { renderQuoteMap } from '@/lib/quote-map-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  return renderQuoteMap(job as any, runs, asOf, 'private, max-age=300')
}
