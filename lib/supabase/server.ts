import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * The user's own session, not the service role. Every query in this app goes
 * through here on purpose: RLS is where access is decided, and a server that
 * reaches around it is a second, quieter answer to "what may this person see".
 */
export function supabaseServer() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try { list.forEach(({ name, value, options }) => jar.set(name, value, options)) }
          catch { /* called from a Server Component; middleware refreshes instead */ }
        },
      },
    },
  )
}
