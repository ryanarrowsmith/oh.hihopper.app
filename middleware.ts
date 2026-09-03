import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// /forgot and /reset are reachable signed out by definition: somebody who
// could sign in would not be on either of them.
const PUBLIC = ['/sign-in', '/forgot', '/reset', '/auth', '/no-access']

export async function middleware(req: NextRequest) {
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
