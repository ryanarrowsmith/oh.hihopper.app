import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Append to the log. The database stamps the actor, the sequence and the hash
 * chain from the session, so a caller cannot choose who they were or what came
 * before them -- which is what makes an INSERT policy safe here.
 *
 * A kind with no retention tier raises rather than defaulting. That is
 * deliberate: a kind nobody has decided a tier for is a kind nobody has thought
 * about, and it should stop the write rather than quietly become a 45-day one.
 */
export type AuditKind =
  | 'entity' | 'department' | 'location' | 'person' | 'module' | 'access' | 'report' | 'system'

export async function logAudit(
  db: SupabaseClient,
  e: { account_id: string; kind: AuditKind; summary: string
       object?: string | null; object_id?: string | null; note?: string | null
       payload?: Record<string, unknown> },
) {
  const { error } = await db.schema('hopper').from('audit_entry').insert({
    account_id: e.account_id, kind: e.kind, summary: e.summary,
    object: e.object ?? null, object_id: e.object_id ?? null,
    note: e.note ?? null, payload: e.payload ?? {},
  })
  // A failed log must not silently swallow a successful write, and must not
  // roll one back either -- so it surfaces to the caller to report.
  return error?.message ?? null
}
