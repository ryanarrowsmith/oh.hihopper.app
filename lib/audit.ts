import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Nothing. Deliberately.
 *
 * Hopper used to keep its own hash-chained log in hopper.audit_entry, written
 * by hand from eighteen call sites. The platform keeps that log now --
 * beebee.audit_log, filled by triggers on the tables registered in
 * beebee.audited_tables -- so every one of those writes had become a second,
 * weaker copy of a record something else was already keeping properly. A
 * trigger cannot be forgotten at a new call site; a hand-written line can, and
 * three of these had already drifted out of step with what they claimed.
 *
 * The call sites are left alone on purpose. They read as the intent they
 * always were, they cost nothing, and if the platform log ever needs a Hopper
 * detail the triggers cannot see, this is the one place to put it back.
 *
 * What reads the log is /activity. hopper.audit_entry still holds its old rows
 * and nothing writes to it any more; it can be dropped once those rows are
 * confirmed unwanted.
 */
export type AuditKind =
  | 'entity' | 'department' | 'location' | 'person' | 'module' | 'access' | 'report' | 'system'

export async function logAudit(
  _db: SupabaseClient,
  _e: { account_id: string; kind: AuditKind; summary: string
        object?: string | null; object_id?: string | null; note?: string | null
        payload?: Record<string, unknown> },
): Promise<string | null> {
  return null
}
