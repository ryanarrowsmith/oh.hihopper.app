import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Back from Google, with a code that is worth a token.
 *
 * The code is handed straight to the edge function and never exchanged here:
 * the exchange needs the client SECRET, and this app deliberately holds no
 * secrets -- not the service key, and not this either. One place holds both,
 * and it is the place that already reaches past RLS to do the writing.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const back = (q: string) => NextResponse.redirect(new URL(`/admin?google=${q}`, req.url))

  const jar = cookies()
  const expected = jar.get('hopper_g_state')?.value
  const state = url.searchParams.get('state')
  // Compared before anything else is looked at: a callback whose state does not
  // match this browser is somebody else's, however well-formed the rest of it is.
  if (!expected || !state || state !== expected) return back('state')

  if (url.searchParams.get('error')) return back('declined')
  const code = url.searchParams.get('code')
  if (!code) return back('nocode')

  const db = supabaseServer()
  const { data: { session } } = await db.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/sign-in', req.url))

  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/read-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ google: { code } }),
      cache: 'no-store',
    }).then((x) => x.json())

    const res = back(r?.ok ? 'connected' : 'failed')
    // The nonce is spent either way. A state that survives its callback is a
    // state that can be replayed.
    res.cookies.set('hopper_g_state', '', { path: '/auth/google', maxAge: 0 })
    return res
  } catch {
    return back('failed')
  }
}
