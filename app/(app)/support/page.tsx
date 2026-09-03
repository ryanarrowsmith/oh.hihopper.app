import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import SupportForm from '@/components/SupportForm'
import Requests from '@/components/Requests'

export const dynamic = 'force-dynamic'

/**
 * Support.
 *
 * Hopper keeps no inbox. There is no ticket table here, no contact form store,
 * no feedback rows -- the platform owns support the same way it owns identity
 * and the ledger, and a second copy of somebody's problem is a second place for
 * it to be forgotten. This page is a form over beebee.open_request and a list
 * from beebee.my_requests.
 *
 * What Hopper does not send is the interesting half: not who is asking, because
 * identity comes from the token and an app that can name the reporter can open
 * a request as anybody; and not status or priority, because urgency is the
 * reporter's and priority is a staff decision. Those are two columns for a
 * reason.
 */
export default async function Support() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const { data: mine } = await db.schema('beebee').rpc('my_requests', {
    p_app: 'hopper', p_limit: 50,
  })

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Support</h1>
        <p className="scopeline"><span>
          Ask us anything about Hopper. What you send goes to the people who
          build it, with the page you were on and the build you were on, so
          nobody has to write back and ask.
        </span></p>
      </div></div>

      <Section title="Ask for help"
               blurb="Say what you expected and what happened instead. That pair is almost always enough.">
        <SupportForm accountId={session.accountId} />
      </Section>

      <Section title="What you've asked"
               blurb="Yours — and everybody's on this account, if you administer it.">
        <Requests rows={(mine ?? []) as any} />
      </Section>
    </>
  )
}
