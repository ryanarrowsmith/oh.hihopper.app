import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Dashboards, { type Board } from '@/components/Dashboards'

export const dynamic = 'force-dynamic'

/**
 * Dashboards — somebody's own page of reports.
 *
 * Reporting is every report you may see, grouped the way the business is.
 * A dashboard is the handful you actually watch, in the order you watch them,
 * and it belongs to a person rather than to the account. That is the whole
 * distinction, and it is why these are two screens and not one with a filter.
 *
 * The list is not filtered here. hopper.dashboard_named is yours plus anything
 * shared with you, decided by policy -- so a dashboard that stops being shared
 * simply stops appearing, without this page knowing the rule.
 */
export default async function DashboardsPage() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const { data: boards } = await db.schema('hopper')
    .from('dashboard_named').select('*').order('title')

  const rows = (boards ?? []) as Board[]
  const mine = rows.filter((b) => b.is_mine)
  const theirs = rows.filter((b) => !b.is_mine)

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Dashboards</h1>
          <p className="scopeline"><span>
            {rows.length === 0
              ? 'None yet.'
              : `${mine.length} of your own${theirs.length ? `, ${theirs.length} shared with you` : ''}.`}
          </span></p>
        </div>
        <div className="hi__go">
          <Link className="btn" href="/reporting">All reports</Link>
        </div>
      </div>

      <Dashboards mine={mine} theirs={theirs} />
    </>
  )
}
