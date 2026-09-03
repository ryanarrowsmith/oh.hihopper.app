import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * What tabs are in this sheet.
 *
 * A proxy and nothing more, the same shape as peek: the reading happens in the
 * read-report edge function, because a second implementation of "what tabs are
 * there" is a second thing that can be right about a different workbook.
 */
export async function POST(req: Request) {
  const db = supabaseServer()
  const { data: { session } } = await db.auth.getSession()
  if (!session) return NextResponse.json({ ok: false, failure: 'Sign in again.' }, { status: 401 })

  const { url } = await req.json().catch(() => ({ url: null }))
  if (!url) return NextResponse.json({ ok: false, failure: 'Where does the sheet live?' })

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/read-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ tabs: { url } }),
      cache: 'no-store',
    })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ ok: false, failure: 'Hopper could not reach the reader.' })
  }
}
