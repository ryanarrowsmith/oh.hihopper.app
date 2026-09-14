import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw, loadRights } from '@/lib/fence'
import { loadSchedule } from '@/lib/schedule'
import { endsOn } from '@/lib/booking'
import { FenceMark } from '@/components/FenceMark'
import ActionForm from '@/components/ActionForm'
import { saveBooking, bookJob, issueTicket, revokeTicket } from '@/app/actions/schedule'

export const dynamic = 'force-dynamic'

/**
 * When it happens, and who does it.
 *
 * Everything above this screen is settled: the line is measured, the price is
 * signed and the scope is written. What is left is a date the law allows, a crew
 * who can work that date, and a ticket in their hands.
 *
 * THE 811 WINDOW WARNS RATHER THAN REFUSES. Ryan's call, 14 Sep. A hard block
 * sounds safer and is not: the date a customer can take is sometimes the date,
 * and a screen that refuses it gets worked around — the job is booked in
 * somebody's head, or the locate dates get edited to make the form happy, which
 * is the failure the block was supposed to prevent. So it books, the warning
 * does not go away, and it travels onto the crew's ticket, because the person
 * who would be standing over a shovel is the one who needs to hear it.
 *
 * The warning is COMPUTED from three dates rather than stored as a flag, which
 * means it cannot drift: move the start or call a fresh locate and it corrects
 * itself.
 */

const day = (s: string | null) => (s
  ? new Date(s.length === 10 ? `${s}T00:00:00` : s)
      .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  : null)
const LANG: Record<string, string> = { es: 'Español', en: 'English' }

export default async function Schedule({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [read, stance, rights, { data: seals }, h] = await Promise.all([
    loadSchedule(session.accountId, params.id),
    fenceStance(session.accountId),
    loadRights(session.accountId),
    db.schema('hopper').from('fence_seal').select('section')
      .eq('account_id', session.accountId).eq('job_id', params.id),
    headers(),
  ])

  const job: any = read.job
  if (!job) notFound()

  const sealed = new Set(((seals ?? []) as any[]).map((s) => s.section))
  const stand = howToDraw('schedule', stance.jobRole, sealed as Set<any>, rights.mayManage)
  const mayEdit = stand === 'edit' && !job.complete
  const origin = `https://${h.get('host') ?? 'oh.hihopper.app'}`

  const b = read.booking
  const w = read.window
  const surveyed = !!read.survey?.closed_at
  const ends = b.endsOn ?? endsOn(b.startsOn, b.days)

  // Grouped the way a yard is walked rather than the way a bill is written.
  const groups = [...new Set(read.load.map((l) => l.group))]

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{job.name}</h1>
        <p className="scopeline">{job.ref}{job.customer ? ` · ${job.customer}` : ''}</p>
        <p className="fjplace"><span>{job.site_address ?? 'No address yet'}</span></p>
        <p className="svwhen">
          {surveyed ? `Survey closed ${day(read.survey!.closed_at)}` : 'Survey not closed yet'}
          {b.soldPrice != null && ` · signed at $${Math.round(b.soldPrice).toLocaleString('en-US')}`}
          {b.bookedAt && ` · booked ${day(b.bookedAt)}`}
        </p>
      </div></div>

      <div className="svthesis">
        <b>Everything above this is settled.</b>
        <p>
          The line is measured, the price is signed and the scope is written. What is left is
          a date the law allows, a crew who can work that date, and a ticket in their hands.
        </p>
      </div>

      {stand === 'read' && (
        <p className="note" style={{ marginTop: 16 }}>
          The schedule belongs to the project manager. Everything is readable; nothing here opens.
        </p>
      )}

      {/* 1 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">1</b>When you are allowed to dig</h2>
          <p>Not when it suits the calendar. Oklahoma 811 decides the front of this window
            and the back of it, and the survey already recorded both.</p>
        </div></div>

        {!read.survey ? (
          <p className="note">
            No locate has been recorded on this job.{' '}
            <Link href={`/fence/${job.id}/survey`}>The survey</Link> is where the ticket number
            and its dates are entered.
          </p>
        ) : (
          <div className="scdates">
            <div className="fxfact"><b>Clear to dig</b>
              <span>{day(read.survey.dig_from) ?? '—'}</span>
              <small>
                {read.survey.locate_ticket
                  ? `Ticket ${read.survey.locate_ticket} · two working days, and it is the law`
                  : 'No ticket number recorded'}
              </small></div>
            <div className="fxfact"><b>Locate expires</b>
              <span>{day(read.survey.locate_expires) ?? '—'}</span>
              <small>Past this the ticket is dead and needs calling again</small></div>
            <div className="fxfact"><b>How long it takes</b>
              <span>{read.suggested ? `${read.suggested} day${read.suggested === 1 ? '' : 's'}` : '—'}</span>
              <small>
                {read.hours > 0
                  ? `${Math.round(read.hours * 10) / 10} crew-hours off the takeoff, `
                    + `a crew of ${read.crew?.size ?? 3}, eight-hour days`
                  : 'No labor priced on this job yet'}
              </small></div>
            <div className="fxfact"><b>Days left in the window</b>
              <span>{w.room ?? '—'}</span>
              <small>Working days between the two dates above</small></div>
          </div>
        )}

        {mayEdit ? (
          <ActionForm action={saveBooking} label="Save the dates">
            <input type="hidden" name="job_id" value={job.id} />
            <div className="formrow">
              <div><label htmlFor="sc-start">Starts on</label>
                <input className="field" id="sc-start" name="starts_on" type="date"
                       defaultValue={b.startsOn ?? ''} /></div>
              <div><label htmlFor="sc-days">Days on site</label>
                <input className="field" id="sc-days" name="days_on_site" inputMode="numeric"
                       defaultValue={b.days ?? read.suggested ?? ''}
                       placeholder={read.suggested ? String(read.suggested) : ''} />
                <small className="fxhint">
                  Worked out from the labor hours. Change it and the finish moves.
                </small></div>
              <div><label>Finishes on</label>
                <p className="scread">{day(ends) ?? '—'}</p>
                <small className="fxhint">Follows the start and the days. Nothing types into it.</small></div>
            </div>
            <input type="hidden" name="crew" value={job.crew ?? read.crew?.name ?? ''} />
          </ActionForm>
        ) : (
          <div className="fxwhere">
            <div className="fxfact"><b>Starts on</b><span>{day(b.startsOn) ?? '—'}</span></div>
            <div className="fxfact"><b>Days on site</b><span>{b.days ?? '—'}</span></div>
            <div className="fxfact"><b>Finishes on</b><span>{day(ends) ?? '—'}</span></div>
          </div>
        )}

        {/* The warning, and it does not go away. */}
        {w.state === 'expired' && (
          <p className="note note--warn">
            <b>This start is {w.off} day{w.off === 1 ? '' : 's'} past the locate expiry.</b>{' '}
            The ticket dies {day(read.survey?.locate_expires ?? null)} and the marks on the
            ground go with it. Book it if the date is what the customer needs, but somebody has
            to call 811 again before a truck digs — and this warning follows the job onto the
            crew ticket until the dates agree.
          </p>
        )}
        {w.state === 'early' && (
          <p className="note note--warn">
            <b>This start is {w.off} day{w.off === 1 ? '' : 's'} before the locate matures.</b>{' '}
            It is not clear to dig until {day(read.survey?.dig_from ?? null)}. Two working days
            is the law, not a guideline.
          </p>
        )}
      </section>

      {/* 2 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">2</b>Who builds it</h2>
          <p>The crew decides two things beyond the work: which language the ticket and the
            scope of work go out in, and whether they can get on a badged site.</p>
        </div></div>

        {read.crews.length === 0 ? (
          <p className="note">
            No crews are set up yet. <Link href="/admin/fence?s=crews">Admin</Link> is where
            they live.
          </p>
        ) : mayEdit ? (
          <ActionForm action={saveBooking} label="Save the crew">
            <input type="hidden" name="job_id" value={job.id} />
            <input type="hidden" name="starts_on" value={b.startsOn ?? ''} />
            <input type="hidden" name="days_on_site" value={b.days ?? ''} />
            <fieldset className="sccrews">
              <legend className="vh">Which crew builds it</legend>
              {read.crews.map((c) => (
                <label className="sccrew" key={c.id}>
                  <input type="radio" name="crew" value={c.name}
                         defaultChecked={job.crew === c.name} />
                  <span className="sccrew__b">
                    <b>{c.name}</b>
                    <small>
                      {c.foreman ?? 'No foreman set'}
                      {c.size ? ` · ${c.size} on the truck` : ''}
                    </small>
                    <span className="sccrew__m">
                      <FenceMark kind="read">{LANG[c.lang] ?? c.lang}</FenceMark>
                      {c.badged
                        ? <FenceMark kind="done">Badged</FenceMark>
                        : <FenceMark kind="warn">Not badged</FenceMark>}
                    </span>
                    <small>
                      {c.busy.length === 0 ? 'Nothing else booked'
                        : c.busy.map((j) => `On ${j.ref} from ${day(j.from)}`
                            + (j.to ? ` to ${day(j.to)}` : '')).join(' · ')}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          </ActionForm>
        ) : (
          <p className="fxspec"><b>{job.crew ?? 'No crew set'}</b></p>
        )}

        {/* The language is not a setting on this screen. It travels with the
            crew, because a foreman who reads Spanish reads Spanish on every job
            — and the scope of work was written in both languages when it was
            drafted rather than translated at send time. */}
        {read.crew && (
          <p className="fxhint">
            The scope of work and the ticket go out in{' '}
            <b>{LANG[read.crew.lang] ?? read.crew.lang}</b>, which is what {read.crew.name} reads.
            {job.cls === 'secure' && !read.crew.badged && (
              <> This is a secure site and this crew is not badged — that stops a truck at
                the gate, and finding out on the morning is a wasted day for
                {read.crew.size ? ` ${read.crew.size}` : ''} people.</>
            )}
          </p>
        )}
      </section>

      {/* 3 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">3</b>The ticket in their hands</h2>
          <p>One live link at a time. Issuing a new one kills the old for everybody
            holding it.</p>
        </div></div>

        {read.ticket ? (
          <div className="sclink">
            <p className="sclink__u">{origin}/t/{read.ticket.token}</p>
            <p className="sclink__w">
              Live since {day(read.ticket.issued_at)} ·{' '}
              {LANG[read.ticket.lang] ?? read.ticket.lang} · no sign-in and no money on it
            </p>
          </div>
        ) : (
          <p className="empty">No ticket link yet. The crew has nothing to open.</p>
        )}

        {mayEdit && (
          <div className="scacts">
            <ActionForm action={issueTicket}
                        label={read.ticket ? 'Issue a new link' : 'Issue the link'}>
              <input type="hidden" name="job_id" value={job.id} />
              <input type="hidden" name="lang" value={read.crew?.lang ?? 'es'} />
              {read.ticket && (
                <p className="fxhint">
                  <b>Cycling is destructive.</b> The old address dies for everyone holding it.
                  What the crew has already ticked and photographed is kept — the link is a
                  door, not the record.
                </p>
              )}
            </ActionForm>
            {read.ticket && (
              <ActionForm action={revokeTicket} label="Take the link down">
                <input type="hidden" name="job_id" value={job.id} />
              </ActionForm>
            )}
          </div>
        )}
      </section>

      {/* 4 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">4</b>What to have on the truck</h2>
          <p>Straight off the takeoff the job was priced from. Nobody retypes a quantity.</p>
        </div></div>

        {read.load.length === 0 ? (
          <p className="empty">
            Nothing is priced on this job yet, so there is no list to load.
          </p>
        ) : (
          <table className="fxtable">
            <thead><tr><th>Item</th><th>Quantity</th><th>Where it comes from</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <>
                  <tr className="sclgroup" key={g}><td colSpan={3}>{g}</td></tr>
                  {read.load.filter((l) => l.group === g).map((l, i) => (
                    <tr key={`${g}-${i}`}>
                      <td>{l.name}</td>
                      <td className="fxnum">{l.qty}</td>
                      <td><small>{l.from}</small></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}

        {/* The last group is the one worth having. */}
        {read.load.some((l) => l.group === 'Because of what the survey found') && (
          <p className="fxhint">
            Fabric and posts come off any takeoff. &ldquo;Bring a rock bit&rdquo; comes from
            somebody standing on the site three weeks ago, and a crew that arrives without it
            loses the morning.
          </p>
        )}

        {mayEdit && (
          <div className="scbook">
            <ActionForm action={bookJob} label="Book it">
              <input type="hidden" name="job_id" value={job.id} />
              <p className="fxhint">
                Booking tells the crew, puts it on the calendar and opens close-out.
                {w.state !== 'clear' && w.state !== 'unknown' && (
                  <> The locate warning goes with it.</>
                )}
              </p>
            </ActionForm>
          </div>
        )}
        {b.bookedAt && (
          <p className="note">
            <b>Booked {day(b.bookedAt)}.</b>{' '}
            {job.crew} · {day(b.startsOn)}{ends && ends !== b.startsOn ? ` to ${day(ends)}` : ''}.{' '}
            <Link href={`/fence/${job.id}/closeout`}>Close-out</Link> is where it finishes.
          </p>
        )}
      </section>
    </>
  )
}
