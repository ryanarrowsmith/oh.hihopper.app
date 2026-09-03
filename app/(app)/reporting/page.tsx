import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'
import Reports from '@/components/Reports'
import { loadCards } from '@/lib/cards'

export const dynamic = 'force-dynamic'

/**
 * Reporting — the reports for the organizations you can open.
 *
 * Access is subtractive and silent: a report somebody may not see is ABSENT,
 * not greyed out and not counted. That is not enforced here — it is enforced by
 * the policy on hopper.report, which is why this page can read the whole table
 * and still be right. A count computed in JavaScript would be a second, weaker
 * answer to a question the database has already answered.
 */
export default async function Reporting() {
  const db = supabaseServer()

  // The cards themselves come from lib/cards, which a dashboard reads too --
  // one answer to "what does a report look like" rather than two that drift.
  const [cards, { data: rights }] = await Promise.all([
    loadCards(),
    db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
  ])

  // Where this person may register one. The button is not rendered at all when
  // the answer is nowhere -- an offer you cannot accept is worse than no offer.
  const mayAdd = (rights ?? []).some((r: any) => r.may_edit)

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Reporting</h1>
        <p className="scopeline">
          <span>{cards.length === 0
            ? 'Nothing registered yet.'
            : `${cards.length} report${cards.length === 1 ? '' : 's'} across the organizations you can open.`}</span>
        </p>
      </div>
      {mayAdd && <div className="hi__go">
        {/* Categories live under Reporting rather than beside it: one entry in
            the menu, and the vocabulary is reachable from the place it governs. */}
        <Link className="btn" href="/reporting/categories">Categories</Link>
        <Link className="btn btn--amber" href="/reporting/new">Add a report</Link>
      </div>}</div>

      {cards.length === 0
        ? <div className="empty">
            <p>A report in Hopper is a pointer, not data: a spreadsheet, one tab inside it, and
               a schedule for going back to look.</p>
            {mayAdd && <p><Link className="btn btn--amber" href="/reporting/new">Point it at something</Link></p>}
          </div>
        : <Reports cards={cards} />}
    </>
  )
}
