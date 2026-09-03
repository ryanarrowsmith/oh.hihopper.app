import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Why, not what.
 *
 * The platform records what changed on its own: an event trigger attaches
 * capture to every table in the hopper schema as it is created, and inserts,
 * updates and deletes land in beebee.audit_log with the actor and the columns
 * that actually moved, hash-chained per tenant. Hopper writes none of that and
 * must not -- it used to keep its own hash-chained copy in hopper.audit_entry,
 * written by hand from eighteen call sites, and three of them had already
 * drifted out of step with what they claimed. A trigger cannot be forgotten at
 * a new call site. That table is dropped.
 *
 * What a row diff cannot say is why. It can tell you an entity_module row went
 * false to true; only Hopper knows that somebody turned Reporting on across
 * nine organizations in one go, and that those nine writes were one decision.
 * beebee.audit('hopper', ...) is where that sentence goes, and it is also the
 * answer to "should this table have a reason column" -- it should not, it
 * should make this call.
 *
 * These eighteen call sites were left standing through the whole period when
 * this function did nothing, on the grounds that they read as the intent they
 * always were and that if the platform ever wanted a Hopper detail the
 * triggers cannot see, this was the one place to put it back. It is back.
 *
 * It never throws. An intent line is a note in the margin of a write that has
 * already succeeded and been permitted; losing one is a worse record, but
 * failing a save the database accepted because the margin note did not go
 * through would be a worse product.
 */
export type AuditKind =
  | 'entity' | 'department' | 'location' | 'person' | 'module' | 'access' | 'report'
  | 'calendar' | 'project' | 'wiki' | 'system'

/** What the platform calls the thing, where its word differs from Hopper's. */
const SUBJECT: Record<AuditKind, string | null> = {
  entity: 'organization',
  department: 'department',
  location: 'location',
  person: 'person',
  module: 'module',
  access: 'access',
  report: 'report',
  // Subscribing points this server at an address somebody chose, which is a
  // structural decision about what Hopper reads -- so it belongs in the ledger
  // beside the report sources, not in the activity stream.
  calendar: 'calendar',
  project: 'project',
  wiki: 'document',
  system: null,
}

export async function logAudit(
  db: SupabaseClient,
  e: { account_id: string; kind: AuditKind; summary: string
       object?: string | null; object_id?: string | null; note?: string | null
       payload?: Record<string, unknown> },
): Promise<string | null> {
  const subject = SUBJECT[e.kind]
  const { data, error } = await db.schema('beebee').rpc('audit', {
    p_app: 'hopper',
    // A verb, and the noun it acted on: hopper.organization.changed. The
    // summary is the sentence; this is the thing you filter a year of them by.
    p_action: `hopper.${subject ?? 'system'}.${verbOf(e.summary)}`,
    p_summary: e.summary,
    p_account: e.account_id,
    p_subject_type: subject,
    p_subject_id: e.object_id ?? null,
    p_payload: {
      ...(e.object ? { name: e.object } : {}),
      ...(e.note ? { note: e.note } : {}),
      ...(e.payload ?? {}),
    },
  })
  if (error) {
    // Said out loud rather than swallowed: a silent failure here is a gap in
    // the record that nobody finds until they need it.
    console.error('[audit] intent not recorded:', error.message, e.summary)
    return null
  }
  return data == null ? null : String(data)
}

/**
 * The verb, taken from the sentence Hopper already wrote rather than from a
 * second argument at every call site. These summaries are written by us and
 * they all start with one, so this reads it instead of asking for it twice.
 */
function verbOf(summary: string) {
  const first = summary.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (first === 'added') return 'added'
  if (first === 'removed' || first === 'deleted') return 'removed'
  if (first === 'set') return 'set'
  if (first === 'renamed') return 'renamed'
  if (first === 'turned') return 'set'
  return 'changed'
}
