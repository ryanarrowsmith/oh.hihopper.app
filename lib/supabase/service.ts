import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * The service role, for the one thing in Hopper that has no signed-in person.
 *
 * Every other query in this app goes through `supabaseServer()` on purpose —
 * RLS is where access is decided, and a server that reaches around it is a
 * second, quieter answer to "what may this person see". This client is the
 * deliberate exception, and it exists for the crew ticket alone: a fence crew
 * opens a per-job link with no account, so there is no session for a policy to
 * read.
 *
 * The rules that keep the exception honest, and they are not optional:
 *
 *  1. IT IS ONLY EVER REACHED FROM A TOKEN ROUTE. Never from a page somebody
 *     signs in to — those have a session, and the policies work.
 *  2. THE TOKEN IS RESOLVED FIRST, AND EVERY QUERY IS SCOPED TO THE ONE JOB IT
 *     RESOLVED TO. The client can read anything; the code must not.
 *  3. NO MONEY LEAVES THIS PATH. The crew ticket carries quantities and never
 *     dollars, and the selects in lib/crew.ts name their columns for that
 *     reason rather than using `*`.
 *
 * Absent key: this throws rather than falling back to the anon client. A crew
 * ticket that silently renders empty is a crew standing in a yard with nothing
 * to build from, and they will not file a bug — they will phone the PM.
 */
export function supabaseService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. The crew ticket cannot resolve its ' +
      'token without it. Add it in Vercel as a Secret, in all three environments.',
    )
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
