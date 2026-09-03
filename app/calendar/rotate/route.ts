import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * A new address, and the old one dead.
 *
 * POST rather than a link, because this is destructive: every calendar app
 * already subscribed stops receiving anything the moment it runs, and a thing
 * that can be triggered by a prefetch or a crawler should not be able to do
 * that.
 */
export async function POST(req: Request) {
  const db = supabaseServer()
  const { data: { session } } = await db.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/sign-in', req.url))

  await db.schema('hopper').rpc('calendar_address', { p_rotate: true })
  return NextResponse.redirect(new URL('/calendar?rotated=1', req.url), { status: 303 })
}
