import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadCalendar, celebrants } from '@/lib/calendar'
import Calendar from '@/components/Calendar'

export const dynamic = 'force-dynamic'

/**
 * Everything with a date on it.
 *
 * A window either side of now rather than exactly what is on screen: the client
 * pages between weeks and months without going back to the server, and a
 * calendar that had to fetch to show you next week would feel like a website
 * rather than a calendar. Six months back and twelve forward is the whole of
 * what anybody scrolls to in a sitting.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 12, 0)

  const db = supabaseServer()
  const [{ events, feeds }, { data: people }, { data: token }] = await Promise.all([
    loadCalendar(from, to),
    db.schema('hopper').from('directory')
      .select('id, full_name, entity_name, department_name, birth_month, birth_day, start_month, start_year')
      .eq('active', true),
    // Made on first sight rather than at signup: an address nobody has asked
    // for is a secret sitting in a table for no reason.
    db.schema('hopper').rpc('calendar_address', { p_rotate: false }),
  ])

  const { bdays, annis } = celebrants(people ?? [], now.getMonth() + 1)

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Calendar</h1>
        <p className="scopeline">
          <span>Everything with a date on it. Arrow keys move, <b>T</b> comes back to today.</span>
        </p>
      </div></div>

      <Calendar events={events} feeds={feeds as any} bdays={bdays} annis={annis}
                address={(token as string) ?? null} />
    </>
  )
}
