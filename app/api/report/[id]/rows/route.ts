import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * The rows behind a report, fetched when somebody opens the second tab.
 *
 * They are not sent down with the list on purpose: five hundred rows times
 * every card on the page is a page nobody can load, and most people never open
 * this tab at all. It is the same reasoning as the contact details on People —
 * a second read, taken only when it is wanted.
 *
 * There is no permission check in here. hopper.report_rows is readable only
 * where the report itself is, so a report this person may not see comes back
 * empty from the database rather than being filtered by hand afterwards.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const db = supabaseServer()

  const { data, error } = await db.schema('hopper').from('report_rows')
    .select('columns, rows, row_count, truncated, fetched_at')
    .eq('report_id', params.id).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    // Nothing has been read yet. That is a state, not a failure, and the tab
    // says so rather than drawing an empty table that looks broken.
    return NextResponse.json({ columns: [], rows: [], row_count: 0, truncated: false, fetched_at: null })
  }
  return NextResponse.json(data)
}
