import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'

const TIER_BLURB: Record<string, string> = {
  system: 'Sign-ins and system events. Kept 45 days, then sealed.',
  structural: 'Changes to the shape of the portfolio. Kept 7 years.',
  access: 'Anything about who may reach what. Kept indefinitely.',
}

export default async function Audit() {
  const db = supabaseServer()
  const { data: entries, error } = await db.schema('hopper')
    .from('audit_entry')
    .select('id, seq, kind, tier, summary, note, occurred_at, sealed_at, corrects_id, hash, prev_hash')
    .order('seq', { ascending: false }).limit(200)

  return (
    <>
      <div className="hi"><h1>Activity Log</h1>
        <p className="scopeline"><span>
          Append-only and hash chained. A mistake is corrected by appending a
          correction that points at what it corrects — nothing is edited in place.
        </span></p>
      </div>

      <Section title="Entries" blurb={`Newest first. ${entries?.length ?? 0} shown.`}>
        {error || (entries?.length ?? 0) === 0 ? (
          <p className="empty">
            {error ? 'You do not hold the audit log permission.' : 'Nothing logged yet.'}
          </p>
        ) : (
          <div className="items">
            {entries!.map((e: any) => (
              <div className="item" key={e.id}>
                <span className="tno">#{e.seq}</span>
                <div>
                  <b>
                    <span className="tag">{e.kind}</span>
                    {e.sealed_at && <span className="tag tag--warn">Sealed</span>}
                    {e.corrects_id && <span className="tag tag--bad">Correction</span>}
                    {e.summary}
                  </b>
                  <small>
                    {TIER_BLURB[e.tier]} {e.note ? ` · ${e.note}` : ''}
                  </small>
                </div>
                <span className="when mono">
                  {new Date(e.occurred_at).toLocaleString('en-US',
                    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
