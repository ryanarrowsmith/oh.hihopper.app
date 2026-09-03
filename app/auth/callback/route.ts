import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * Where an emailed link lands.
 *
 * Supabase sends a one-time `code`; this trades it for a session on the server
 * and sends the person on. It exists because the modern flow puts the code in
 * a query string rather than a URL fragment -- a fragment never reaches the
 * server, which is why the old style needed the client to unpick it and why
 * that style could not set an httpOnly cookie.
 *
 * `next` is checked rather than trusted. It arrives in a URL somebody was
 * emailed, and an open redirect is exactly the shape a phishing link wants:
 * a real hihopper.app address that bounces you somewhere else once you have
 * proved who you are. Only a path on this site is allowed, and only one that
 * does not start with `//` -- which a browser reads as another host.
 */
function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?bad=link', url.origin))
  }

  const { error } = await supabaseServer().auth.exchangeCodeForSession(code)
  if (error) {
    // Expired or already used. Both are ordinary and neither is the person's
    // fault, so the sign-in page says so rather than showing a raw error.
    return NextResponse.redirect(new URL('/sign-in?bad=link', url.origin))
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
