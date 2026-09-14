import { NextResponse } from 'next/server'
import { openQuote } from '@/lib/quote'
import type { MapRun } from '@/lib/quote-map'
import { renderQuoteMap } from '@/lib/quote-map-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The quote map on the customer's own page.
 *
 * Same picture as the one in the record, reached with the token instead of a
 * session -- and FROZEN, always: the customer sees the line the price was
 * worked out from, never the runs as somebody has since redrawn them. There is
 * no fall-back to the live geometry here for that reason. A quote whose picture
 * moves after it was sent is not evidence of anything.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const q = await openQuote(token)
  if (!q) return new NextResponse('This link is no longer active.', { status: 404 })

  const runs: MapRun[] = ((q.frozen as any)?.measure?.runs ?? [])
    .filter((r: any) => Array.isArray(r.points) && r.points.length >= 2)
    .map((r: any) => ({ label: r.label, points: r.points, closed: !!r.closed }))
  if (runs.length === 0) {
    return new NextResponse('This estimate was measured by hand, so there is no picture.',
      { status: 409 })
  }

  return renderQuoteMap(
    { ref: q.job.ref, name: q.job.name, site_address: q.job.site_address },
    runs,
    q.frozen.priced_on ?? null,
    'public, max-age=3600',
  )
}
