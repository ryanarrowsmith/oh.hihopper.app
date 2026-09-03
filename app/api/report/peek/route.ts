import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Look at a source before registering it.
 *
 * This is a proxy and nothing more: the read happens in the read-report edge
 * function, through the same parser the scheduled look uses. A preview drawn by
 * a second implementation is a preview that can disagree with what actually
 * gets stored, and then the form has lied about what came back.
 *
 * The person's own token goes along, so the function can refuse anyone who is
 * not signed in.
 */
export async function POST(req: Request) {
  const db = supabaseServer()
  const { data: { session } } = await db.auth.getSession()
  if (!session) return NextResponse.json({ ok: false, failure: 'Sign in again.' }, { status: 401 })

  const { url, tab, kind } = await req.json().catch(() => ({ url: null, tab: null, kind: null }))
  if (!url) return NextResponse.json({ ok: false, failure: 'Where does the data live?' })

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/read-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ peek: { url, tab: tab || null, kind: kind || null } }),
      cache: 'no-store',
    })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ ok: false, failure: 'Hopper could not reach the reader.' })
  }
}
