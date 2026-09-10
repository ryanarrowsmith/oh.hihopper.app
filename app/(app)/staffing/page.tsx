import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadLine, byManager, stanceIn } from '@/lib/staffing'
import StaffRow from '@/components/StaffRow'
import Fold from '@/components/Fold'

export const dynamic = 'force-dynamic'

/**
 * Staffing — your line of report, and nobody else's.
 *
 * A manager opens this and sees the people who report to them. Somebody
 * further up sees the same rows, gathered under each manager beneath them,
 * all the way down. Neither of them was granted anything: person.manager_id
 * already says who reports to whom, and the policies read it.
 *
 * Somebody with no reports and no staff_records grant lands on the one part of
 * this module that is theirs -- their own documents. Not a locked door with
 * their name on it. In Hopper, if you cannot see it, it is not there.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const stance = await stanceIn(session.accountId)
  const line = await loadLine(session.accountId, stance.personId)
  const hasLine = line.mine.length > 0

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Staffing</h1>
        <p className="scopeline">
          <span>
            {hasLine
              ? 'The people who report to you, and everyone beneath them.'
              : stance.stance === 'self'
                ? 'What is on your own record.'
                : 'Every line you hold staff records for.'}
          </span>
        </p>
      </div></div>

      {(hasLine || stance.stance === 'owner' || stance.stance === 'records') && (
        <nav className="stnav">
          <Link href={"/staffing/rankings" as any}>Stack Rankings</Link>
          <Link href={"/staffing/documents" as any}>Documents</Link>
        </nav>
      )}

      {hasLine ? (
        <>
          <section className="sec">
            <div className="sec__h"><div className="sec__t">
              <h2>Your reports</h2>
              <p>{line.mine.length} {line.mine.length === 1 ? 'person' : 'people'}, reporting to you directly.</p>
            </div></div>
            <div className="strows">{line.mine.map((m) => <StaffRow key={m.id} m={m} />)}</div>
          </section>

          {line.leaders.length > 0 && (
            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Down the line</h2>
                <p>Everyone beneath you, under the manager they answer to. Shut by
                   default, because your own reports are the page and this is the depth
                   behind it.</p>
              </div></div>
              {line.leaders.map((l) => (
                <Fold key={l.id} open={false} title={l.name}
                      note={`${l.reports.length} ${l.reports.length === 1 ? 'report' : 'reports'}`}>
                  <div className="strows">
                    {l.reports.map((m) => <StaffRow key={m.id} m={m} />)}
                  </div>
                </Fold>
              ))}
            </section>
          )}
        </>
      ) : stance.stance === 'owner' || stance.stance === 'records' ? (
        <RecordsView accountId={session.accountId} me={stance.personId} />
      ) : (
        <OwnFile me={stance.personId} />
      )}
    </>
  )
}

/** Nobody reports to you, but you hold the records. Everyone is here, under
 *  whoever manages them, because "by manager" is the only grouping that makes
 *  a line of report legible when it is not your own. */
async function RecordsView({ accountId, me }: { accountId: string; me: string | null }) {
  const line = await loadLine(accountId, me)
  const groups = byManager(line.all).filter((g) => g.leader !== null)

  if (groups.length === 0) {
    return <p className="empty">Nobody has a manager on their record yet, so there is no line to read.</p>
  }
  return (
    <section className="sec">
      <div className="sec__h"><div className="sec__t">
        <h2>By manager</h2>
        <p>Every line in the account. You hold staff records rather than a team.</p>
      </div></div>
      {groups.map((g) => (
        <Fold key={g.leader!.id} open={false} title={g.leader!.name}
              note={`${g.people.length} ${g.people.length === 1 ? 'report' : 'reports'}`}>
          <div className="strows">{g.people.map((m) => <StaffRow key={m.id} m={m} />)}</div>
        </Fold>
      ))}
    </section>
  )
}

/** Your own documents. Not your scores, and not your notes -- those are a
 *  management instrument here, by decision, and a greyed-out row that says so
 *  would tell you more than showing it would. */
async function OwnFile({ me }: { me: string | null }) {
  if (!me) return <p className="empty">You are not on the roster yet.</p>

  const db = supabaseServer()
  const { data: docs } = await db.schema('hopper').from('staff_document')
    .select('id, title, kind, happened_on').eq('person_id', me)
    .order('happened_on', { ascending: false })

  return (
    <section className="sec">
      <div className="sec__h"><div className="sec__t">
        <h2>Your documents</h2>
        <p>What has been filed against your record and shared with you.</p>
      </div></div>
      {(docs ?? []).length === 0
        ? <p className="empty">Nothing on file.</p>
        : <ul className="stdocs">
            {(docs ?? []).map((d: any) => (
              <li key={d.id}>
                <a href={`/api/staff-doc/${d.id}`} target="_blank" rel="noreferrer">{d.title}</a>
                <em>{d.kind}</em>
                <u>{d.happened_on}</u>
              </li>
            ))}
          </ul>}
    </section>
  )
}
