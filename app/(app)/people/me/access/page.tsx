import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import { FLAT_OBJECTS, held, type Grant, type Verb } from '@/lib/access'
import { OrgMark } from '@/components/Icons'

export const dynamic = 'force-dynamic'

/**
 * What you may do.
 *
 * "Why can't I see that report" is a question people ask about themselves, and
 * until this page there was nowhere in Hopper that answered it. Admin ->
 * Permissions answers it about somebody else and only an administrator can
 * open it, which is exactly the wrong shape: the person who needs the answer
 * is the person who cannot get to the screen.
 *
 * It renders the same rows as Permissions, from lib/access.ts, because two
 * hand-written copies of "what a permission is" is how two screens start
 * disagreeing about what somebody can do.
 *
 * Two rules make it honest. It fetches the places WITHOUT a filter and lets
 * RLS answer -- so it cannot claim access the database would refuse, which is
 * the one property an access screen has to have. And it is read only: nothing
 * here is a control, because a control you may not use is a worse answer than
 * a sentence. Owners see everything whatever the grant table says, and it says
 * so rather than drawing a grid of rows that are all false.
 */
const VERB: Record<Verb, string> = { view: 'View', edit: 'Edit', export: 'Export' }

export default async function MyAccess() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const owner = /owner|admin/i.test(session.role)

  const [{ data: grants }, { data: entities }, { data: departments }] = await Promise.all([
    db.schema('hopper').from('access_grant').select('*').eq('person_id', session.personId ?? ''),
    // No filter. RLS is the answer -- what comes back IS what you may open.
    db.schema('hopper').from('entity').select('id, name, parent_id').order('sort_order'),
    db.schema('hopper').from('department').select('id, name, entity_id').order('name'),
  ])
  const g = (grants ?? []) as Grant[]

  const mine = FLAT_OBJECTS
    .map((o) => ({ o, verbs: o.verbs.filter((v) => held(g, o.key, v)) }))
    .filter((r) => r.verbs.length > 0)

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>What you may do</h1>
        <p className="scopeline"><span>
          Signed in as {session.displayName} on {session.accountName}
          {owner ? ' — you own this account.' : '.'}
        </span></p>
      </div></div>

      <Section title="Across Hopper"
               blurb="The permissions that are not about a particular business.">
        {owner ? (
          <p className="empty">
            You own this account, so every one of these is yours whatever the
            grant table says. An owner able to remove their own last permission
            could lock the account&rsquo;s only administrator out of the screen
            that gives it back.
          </p>
        ) : mine.length === 0 ? (
          <p className="empty">
            None yet. Everything you can reach, you can reach because of the
            organizations below.
          </p>
        ) : (
          <ul className="holds">
            {mine.map(({ o, verbs }) => (
              <li key={o.key}>
                <b>{o.label}</b>
                <span className="holds__v">{verbs.map((v) => VERB[v]).join(' · ')}</span>
                <small>{o.blurb}</small>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What you can open"
               blurb="Every business and department this account holds that Hopper will let you load. Nothing is filtered by hand here — this is the database's own answer.">
        {(entities ?? []).length === 0 ? (
          <p className="empty">Nothing yet. Ask an administrator for a grant.</p>
        ) : (
          <ul className="holds">
            {(entities ?? []).map((e: any) => {
              const kids = (departments ?? []).filter((d: any) => d.entity_id === e.id)
              return (
                <li key={e.id}>
                  <b><OrgMark />{e.name}</b>
                  {e.parent_id && <span className="holds__v">Under its parent</span>}
                  {kids.length > 0 && (
                    <small>{kids.map((d: any) => d.name).join(' · ')}</small>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </>
  )
}
