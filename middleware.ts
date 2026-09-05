import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// /forgot and /reset are reachable signed out by definition: somebody who
// could sign in would not be on either of them. /landing and /beta are the
// public face on hihopper.app and have no session by design.
const PUBLIC = ['/sign-in', '/forgot', '/reset', '/auth', '/no-access', '/landing', '/beta/']

/* The bare domain is the landing page; oh. is the app.
   One project, one deploy, one set of keys — the host decides which face a
   visitor gets. A rewrite rather than a redirect, so hihopper.app stays
   hihopper.app in the address bar instead of bouncing somebody to a
   subdomain they did not ask for.
   /beta/* is excluded because it is the landing's own machinery — confirming
   an address, leaving the list — and the links in our mail point at those
   real paths. */
const LANDING_HOSTS = new Set(['hihopper.app', 'www.hihopper.app'])

export async function middleware(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')

  // Ahead of everything else: a stranger on the bare domain has no session to
  // refresh and must not be sent to /sign-in.
  if (LANDING_HOSTS.has(host) && !req.nextUrl.pathname.startsWith('/beta/')) {
    const to = req.nextUrl.clone()
    to.pathname = '/landing'
    return NextResponse.rewrite(to)
  }

  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  // getUser, not getSession: getSession trusts the cookie, getUser asks.
  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname
  const open = PUBLIC.some((p) => path.startsWith(p))

  if (!user && !open) {
    const to = req.nextUrl.clone()
    to.pathname = '/sign-in'
    to.searchParams.set('next', path)
    return NextResponse.redirect(to)
  }
  if (user && path === '/sign-in') {
    const to = req.nextUrl.clone(); to.pathname = '/'; to.search = ''
    return NextResponse.redirect(to)
  }
  return res
}

export const config = {
  // `cal` is out because a calendar client signs in to nothing: Google and
  // Apple fetch the .ics with no cookie at all, so sending them to /sign-in
  // would make every subscription fail silently. The secret in the path is
  // what stands in for a session there.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|cal/|.*\\.(?:svg|png|jpg|webp|ico)$).*)'],
}
