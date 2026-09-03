import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Off to Google to ask.
 *
 * `access_type=offline` with `prompt=consent` because Hopper needs a LASTING
 * permission: the every-fifteen-minutes sweep runs with nobody signed in, so an
 * access token that dies within the hour is no use. Google only sends the
 * lasting half on a fresh consent, and silently omits it if it remembers saying
 * yes before -- which is how an app ends up connected today and broken
 * tomorrow.
 *
 * One scope, drive.file. Not "read my Drive": read the files handed over
 * through the picker, and nothing else. That is what keeps this out of Google's
 * verification and out of your other spreadsheets at the same time.
 */
export async function GET(req: Request) {
  const db = supabaseServer()
  const { data: { session } } = await db.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/sign-in', req.url))

  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const redirect = process.env.GOOGLE_REDIRECT_URI
  if (!id || !redirect) {
    return NextResponse.redirect(new URL('/admin?google=unset', req.url))
  }

  // A nonce in a cookie and in the URL, compared on the way back. Without it
  // anybody could hand this person's browser a callback carrying THEIR code and
  // quietly connect their Google to this Hopper.
  const state = randomBytes(24).toString('base64url')

  const to = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  to.searchParams.set('client_id', id)
  to.searchParams.set('redirect_uri', redirect)
  to.searchParams.set('response_type', 'code')
  to.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file email')
  to.searchParams.set('access_type', 'offline')
  to.searchParams.set('prompt', 'consent')
  to.searchParams.set('include_granted_scopes', 'true')
  to.searchParams.set('state', state)

  const res = NextResponse.redirect(to)
  res.cookies.set('hopper_g_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/auth/google', maxAge: 600,
  })
  return res
}
