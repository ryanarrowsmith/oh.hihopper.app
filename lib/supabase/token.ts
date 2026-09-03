import { supabaseServer } from '@/lib/supabase/server'

/**
 * The caller's access token, and a live one.
 *
 * getSession() hands back whatever is sitting in the cookie without asking
 * Supabase whether it is still any good. An access token lasts an hour, so a
 * tab left open over lunch forwards an EXPIRED one to the edge function -- and
 * the function, quite correctly, answers "Not signed in." to somebody who is.
 * The form then says it could not read the sheet, which is true and is about
 * the wrong thing entirely.
 *
 * getUser() goes to Supabase to ask, and refreshing the pair is a side effect
 * of asking. So the order here is the whole point: ask who, THEN take the
 * token, because only the second one is guaranteed to be current.
 */
export async function liveToken(): Promise<string | null> {
  const db = supabaseServer()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return null
  const { data: { session } } = await db.auth.getSession()
  return session?.access_token ?? null
}
