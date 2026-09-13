import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadJobs, countComplete, daysIn, SECTIONS } from '@/lib/fence'
import { FenceMark } from '@/components/FenceMark'

export const dynamic = 'force-dynamic'

/**
 * Jobs.
 *
 * The customer column came out: seven of eight job names already carry the
 * customer, so it was a column repeating the one beside it. What replaced it is
 * DAYS IN THIS STAGE, which is the thing that turns a list into a worklist — a
 * job sitting a fortnight in "release to billing" is money not invoiced, and
 * that row should shout.
 */
export default async function Page({ searchParams }: {
  searchParams: Promise<{ complete?: string }>
}) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { complete } = await searchParams
  const showingComplete = complete === '1'
  const [{ jobs, error }, done] = await Promise.all([
    loadJobs(session.accountId, showingComplete),
    countComplete(session.accountId),
  ])

  const word = (s: string) => SECTIONS.find((x) => x.key === s)?.en ?? s

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Jobs</h1>
        <p className="scopeline">
          <span>
            {jobs.length === 0
              ? 'Nothing open. A new estimate starts at intake; a work order on an open rental starts at the survey.'
              : `${jobs.length} ${showingComplete ? 'complete' : 'open'}. The column that matters is the last one.`}
          </span>
        </p>
      </div>
      <div className="fjact">
        {/* Show complete SWAPS the list rather than appending to it, and carries
            no count of its own — a count there reads as clutter. */}
        {done > 0 && (
          <Link className="btn btn--quiet" href={showingComplete ? '/fence' : '/fence?complete=1' as any}>
            {showingComplete ? 'Show open' : 'Show complete'}
          </Link>
        )}
        <Link className="btn" href={'/fence/new?from=survey' as any}>New work order</Link>
        <Link className="btn btn--primary" href={'/fence/new' as any}>New estimate</Link>
      </div></div>

      {/* "Nothing here" and "I could not ask" are different answers, and only one
          of them is reassuring. Saying the wrong one is how a broken read looks
          like a quiet Tuesday. */}
      {error ? (
        <section className="sec"><p className="note note--err">
          <b>The jobs could not be read.</b> {error}
        </p></section>
      ) : jobs.length === 0 ? (
        <section className="sec"><p className="fjempty">
          No jobs yet. The rate book and the billing target are set up, so the first
          estimate has something to price against.
        </p></section>
      ) : (
        <section className="sec">
          <div className="fjhead" aria-hidden="true">
            <span>Job</span><span>Stage</span><span>Class</span>
          </div>
          <ul className="fjrows">
            {jobs.map((j) => {
              const days = daysIn(j.created_at)
              return (
                <li key={j.id} className="fjrow">
                  <Link className="fjrow__go" href={`/fence/${j.id}` as any}>
                    <span className="rcell rcell--lead">
                      <span className="fjname">{j.name}</span>
                      <span className="fjsub">
                        {j.ref}{j.site_address ? ` · ${j.site_address}` : ''}
                        {j.customer && !j.name.includes(j.customer) ? ` · ${j.customer}` : ''}
                      </span>
                    </span>
                    <span className="rcell fjstage">
                      <span className="rcell__lab">Stage</span>
                      <span className="rcell__val">
                        <b>{word(j.stage)}</b>
                        <span className={days >= 10 ? 'fjdays fjdays--long' : 'fjdays'}>
                          {days >= 10
                            ? <FenceMark kind="late" title="Sitting longer than this stage usually takes">
                                {days} days in this stage
                              </FenceMark>
                            : `${days === 1 ? '1 day' : `${days} days`} in this stage`}
                        </span>
                      </span>
                    </span>
                    <span className="rcell fjcls">
                      <span className="rcell__lab">Class</span>
                      <span className="rcell__val">
                        {/* Permanent is the default and badging it was noise on
                            most rows, so only the other two show. */}
                        {j.cls && j.cls !== 'permanent'
                          ? <em className="fjbadge">{j.cls === 'secure' ? 'Secure' : 'Temporary'}</em>
                          : <em className="fjnone">—</em>}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
