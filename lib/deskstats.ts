import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * What the Desk dashboard reads.
 *
 * Server only, for the same reason lib/deskdata.ts is: one import of
 * supabaseServer in a module a client component touches drags next/headers
 * into the browser bundle and fails the build.
 *
 * Every number on the screen comes out of hopper.ticket_scored -- one row per
 * ticket with both promises already scored. The view is security_invoker, so
 * this can read the whole thing and still be right: what a person may not see
 * simply is not there, and the dashboard inherits the same answer the queue
 * screen gives.
 */

import type { Scored } from '@/lib/desk'


const COLS =
  'id, ref, subject, status, priority, source, entity_id, queue_id, kind_id, ' +
  'assignee_id, contact_id, opened_at, resolved_at, first_reply_at, last_message_at, ' +
  'first_reply_due, resolve_due, reply_state, resolve_state, reply_mins, resolve_mins, ' +
  'age_mins, quiet_mins'

/**
 * Everything scored, newest first, plus who leads what.
 *
 * The whole set rather than a window, because the range picker lives in the
 * browser and a person moving from 30 days to Year to date should not wait for
 * a round trip to find out. A desk reaches five thousand tickets long after it
 * has outgrown a single-page dashboard anyway.
 */
export async function loadScored() {
  const db = supabaseServer()
  const [scored, agents] = await Promise.all([
    db.schema('hopper').from('ticket_scored').select(COLS)
      .order('opened_at', { ascending: false }).limit(5000),
    db.schema('hopper').from('queue_agent').select('queue_id, person_id, lead')
      .eq('active', true),
  ])
  return {
    rows: (scored.data ?? []) as unknown as Scored[],
    agents: (agents.data ?? []) as { queue_id: string; person_id: string; lead: boolean }[],
  }
}
