import { redirect } from 'next/navigation'
import Link from 'next/link'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import SubscribeList from '@/components/SubscribeList'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: feeds }, { data: rights }] = await Promise.all([
    db.schema('hopper').from('calendar_feed')
      .select('id, name, url, colour, last_look, last_ok, failure').order('name'),
    db.schema('hopper').from('entity_rights').select('may_edit'),
  ])

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Subscribed calendars</h1>
        <p className="scopeline">
          <span>Any calendar that publishes an .ics address can appear in Hopper.</span>
        </p>
      </div>
      <div className="hi__go"><Link className="btn" href="/calendar">Back to the calendar</Link></div>
      </div>

      <SubscribeList feeds={(feeds ?? []) as any}
                     mayEdit={(rights ?? []).some((r: any) => r.may_edit)} />
    </>
  )
}
