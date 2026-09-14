import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw, loadRights } from '@/lib/fence'
import { loadSurvey, conditionTotals } from '@/lib/survey'
import ActionForm from '@/components/ActionForm'
import SurveyRuns from '@/components/SurveyRuns'
import SurveyConditions from '@/components/SurveyConditions'
import { saveAccess, closeSurvey, sendResults } from '@/app/actions/survey'

export const dynamic = 'force-dynamic'

/**
 * The site survey: what the ground turned out to be.
 *
 * The estimate is deliberately preliminary — sales works off a photograph, an
 * aerial cannot read a slope, and the signature buys a SURVEY rather than a
 * fence. This is where that promise is kept, so every block on it is a
 * difference: what was drawn against what was walked, what the quote assumed
 * against what was standing there.
 *
 * ONE DECISION AT THE END, and it is a person's. When the survey moves the
 * price, nothing reaches the customer automatically: the difference is
 * sometimes worth eating and sometimes worth a conversation, and only whoever
 * just walked the site knows which.
 */

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`
const day = (s: string | null) => (s
  ? new Date(s.length === 10 ? s + 'T00:00:00' : s)
      .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  : null)

export default async function Survey({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [read, stance, rights, { data: seals }, { data: place }] = await Promise.all([
    loadSurvey(session.accountId, params.id),
    fenceStance(session.accountId),
    loadRights(session.accountId),
    db.schema('hopper').from('fence_seal').select('section')
      .eq('account_id', session.accountId).eq('job_id', params.id),
    db.schema('hopper').from('fence_location')
      .select('line1, city, region, postcode')
      .eq('account_id', session.accountId).eq('job_id', params.id).maybeSingle(),
  ])

  const job: any = read.measure.job
  if (!job) redirect('/fence')

  const sealed = new Set(((seals ?? []) as any[]).map((s) => s.section))
  const stand = howToDraw('survey', stance.jobRole, sealed as Set<any>, rights.mayManage)
  const closed = !!read.survey?.closed_at
  const signedPrice = (read.measure.job as any)?.sold_price
  /* READABLE BEFORE IT IS SIGNED, AND NOTHING TO ENTER. Ryan, 14 Sep. A survey
     confirms a price somebody agreed to, so until there is one there is nothing
     here to confirm — but the PM can still look at the line and the list. */
  const mayEdit = stand === 'edit' && !closed && signedPrice != null

  const where = place
    ? [place.line1, [place.city, place.region].filter(Boolean).join(', '), place.postcode]
        .filter(Boolean).join(', ')
    : job.site_address

  const { sell: found, gaps } = conditionTotals(read.conditions, read.found)
  const { sell: assumed } = conditionTotals(read.conditions, read.quoted)
  const signed = job.sold_price == null ? null : Number(job.sold_price)

  const walkedBy = new Map(read.walked.map((w) => [w.run_id, w]))
  const rows = read.measure.runs.map((r) => {
    const w = walkedBy.get(r.id)
    const drawn = read.measure.sums.runs.find((x) => x.id === r.id)
    return {
      runId: r.id, label: r.label,
      drawnFt: drawn?.planFt ?? 0,
      fallFt: (r as any).fall_ft == null ? null : Number((r as any).fall_ft),
      steepest: (r as any).steepest == null ? null : Number((r as any).steepest),
      walkedFt: w?.walked_ft == null ? null : Number(w.walked_ft),
      gradePct: w?.grade_pct == null ? null : Number(w.grade_pct),
      measuredBy: w?.measured_by ?? null,
    }
  })

  /* The difference, in the two figures it is actually made of. The conditions
     are priced through the rate book; the footage is valued at the job's own
     per-foot, which is the signed price over the footage it was signed for --
     an honest arithmetic rather than a re-quote, and the screen says so. */
  const drawnFt = read.measure.sums.fenceFt
  const afterFt = read.after.fenceFt
  const perFoot = signed && drawnFt > 0 ? signed / drawnFt : null
  const lengthDelta = perFoot == null ? 0 : Math.round((afterFt - drawnFt) * perFoot)
  const moved = Math.round(found - assumed) + lengthDelta
  const firm = signed == null ? null : Math.round(signed + moved)

  const steep = rows.filter((r) => (r.steepest ?? 0) >= 5)

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{job.name}</h1>
        <p className="scopeline">
          {job.ref}{job.customer ? ` · ${job.customer}` : ''}
        </p>
        <p className="fjplace"><span>{where ?? 'No address yet'}</span></p>
        <p className="svwhen">
          {job.sold_on ? `Signed ${day(job.sold_on)}` : 'Not signed yet'}
          {closed ? ` · survey closed ${day(read.survey!.closed_at)}` : ''}
        </p>
      </div></div>

      {signed != null ? (
        <div className="svthesis">
          <b>The estimate was {money(signed)}, drawn off a photograph.</b>
          <p>
            This screen is what turns it into a price. Everything below is the difference
            between what the aerial showed and what is on the ground — and the customer was
            told, in writing, that this is where the number gets confirmed.
          </p>
        </div>
      ) : (
        <p className="note" style={{ marginTop: 16 }}>
          <b>Nothing has been signed on this job yet,</b> so there is nothing here to fill in
          — a survey confirms a price somebody agreed to. Everything below is readable, and
          opens once <Link href={`/fence/${job.id}/estimate`}>the estimate</Link> is signed.
        </p>
      )}

      {stand === 'read' && (
        <p className="note" style={{ marginTop: 16 }}>
          The survey belongs to the project manager. Every figure is readable; nothing here opens.
        </p>
      )}
      {closed && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>Closed {day(read.survey!.closed_at)}.</b>{' '}
          {read.survey!.outcome === 'absorb'
            ? 'We absorbed the difference and the job books at the signed price.'
            : 'The difference went back to the customer to review.'}
        </p>
      )}

      {/* 1 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">1</b>Walk the line</h2>
          <p>The line as it was drawn is already here. Correct it, and put the walked
            figure in beside it — a wheel beats a photograph.</p>
        </div></div>

        {rows.length === 0 ? (
          <p className="note">
            Nothing was drawn on this job, so there is no line to walk.{' '}
            <Link href={`/fence/${job.id}/estimate`}>The estimate</Link> is where it gets drawn.
          </p>
        ) : (
          <div className="svsplit">
            <div className="svshot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/fence/${job.id}/map`} alt="The line as the estimate drew it" />
            </div>
            <SurveyRuns jobId={job.id} rows={rows} mayEdit={mayEdit} />
          </div>
        )}

        {steep.length > 0 && (
          <p className="svnote">
            <b>The ground falls on {steep.map((r) => r.label).join(', ')}.</b>{' '}
            Read off the elevation model when the line was drawn, so it is an estimate and you
            are not. It never touched the quoted footage — a 7.5% grade over 186 feet adds six
            inches — but it is what decides whether these panels get stepped or raked.
          </p>
        )}
      </section>

      {/* 2 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">2</b>What the aerial could not see</h2>
          <p>Each of these is a charge code. What you type is a quantity — the price
            beside it is the rate book&rsquo;s.</p>
        </div></div>

        {read.quoted.length > 0 && (
          <p className="svnote">
            <b>The quote already assumed {money(assumed)} of this.</b>{' '}
            {read.conditions.filter((c) => read.quoted.some((q) => q.condition_id === c.id))
              .map((c) => c.name_en).join(' · ')}. What you turn on below is what was actually
            there, and the difference between the two is what moves the price.
          </p>
        )}

        {read.conditions.length === 0 ? (
          <p className="note">
            No site conditions are set up yet.{' '}
            <Link href="/admin/fence?s=conditions">Admin</Link> is where the list lives.
          </p>
        ) : (
          <SurveyConditions
            jobId={job.id} where="survey"
            conditions={read.conditions} found={read.found} mayEdit={mayEdit} />
        )}
      </section>

      {/* 3 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">3</b>Getting on site, and getting power in the ground</h2>
          <p>What the crew needs to know before a truck leaves the yard.</p>
        </div></div>

        {mayEdit ? (
          <ActionForm action={saveAccess} label="Save it" busy="Saving…">
            <input type="hidden" name="job_id" value={job.id} />
            <div className="formrow">
              <div><label htmlFor="sv-tkt">811 locate ticket</label>
                <input className="field" id="sv-tkt" name="locate_ticket"
                       defaultValue={read.survey?.locate_ticket ?? ''} />
                <small>Oklahoma 811. Two working days, and it is the law, not a courtesy.</small></div>
              <div><label htmlFor="sv-from">Clear to dig on</label>
                <input className="field" id="sv-from" name="dig_from" type="date"
                       defaultValue={read.survey?.dig_from ?? ''} />
                <small>Nothing can be scheduled before this date.</small></div>
              <div><label htmlFor="sv-ends">Locate expires</label>
                <input className="field" id="sv-ends" name="locate_expires" type="date"
                       defaultValue={read.survey?.locate_expires ?? ''} />
                <small>A job that slips past this needs a fresh ticket.</small></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="sv-acc">Truck access</label>
                <input className="field" id="sv-acc" name="access"
                       defaultValue={read.survey?.access ?? ''}
                       placeholder="Which drive takes an auger truck, and what is in the way" /></div>
              <div><label htmlFor="sv-ask">Who to ask for on site</label>
                <input className="field" id="sv-ask" name="ask_for"
                       defaultValue={read.survey?.ask_for ?? ''}
                       placeholder="Name and a number" />
                <small>Goes onto the crew ticket verbatim.</small></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="sv-utl">Overhead and buried, as found</label>
                <input className="field" id="sv-utl" name="utilities"
                       defaultValue={read.survey?.utilities ?? ''}
                       placeholder="What the locate marked, plus anything it did not" /></div>
            </div>
          </ActionForm>
        ) : (
          <dl className="svfacts">
            <div><dt>811 ticket</dt><dd>{read.survey?.locate_ticket ?? '—'}</dd></div>
            <div><dt>Clear to dig</dt><dd>{day(read.survey?.dig_from ?? null) ?? '—'}</dd></div>
            <div><dt>Locate expires</dt><dd>{day(read.survey?.locate_expires ?? null) ?? '—'}</dd></div>
            <div><dt>Truck access</dt><dd>{read.survey?.access ?? '—'}</dd></div>
            <div><dt>Ask for</dt><dd>{read.survey?.ask_for ?? '—'}</dd></div>
            <div><dt>Utilities</dt><dd>{read.survey?.utilities ?? '—'}</dd></div>
          </dl>
        )}
      </section>

      {/* 4 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">4</b>The firm price</h2>
          <p>The estimate said it would be confirmed here. This is the confirming.</p>
        </div></div>

        <div className="svverdict">
          <div>
            <h3>Signed estimate</h3>
            <b>{signed == null ? '—' : money(signed)}</b>
            <p>{job.sold_on ? day(job.sold_on) : 'not signed'} · {ft(drawnFt)} off the aerial</p>
          </div>
          <div>
            <h3>What the survey changed</h3>
            <b>{moved === 0 ? 'nothing' : `${moved > 0 ? '+' : '−'}${money(Math.abs(moved))}`}</b>
            <p>
              {money(found)} of site conditions
              {assumed > 0 ? `, ${money(assumed)} of it already quoted` : ''}
              {lengthDelta !== 0
                ? ` · ${lengthDelta > 0 ? '+' : '−'}${money(Math.abs(lengthDelta))} on `
                  + `${Math.abs(Math.round(afterFt - drawnFt))} ft of line`
                : ''}
            </p>
          </div>
          <div className="svnow">
            <h3>Firm price</h3>
            <b>{firm == null ? '—' : money(firm)}</b>
            <p>{gaps.length
              ? `${gaps.length} condition${gaps.length === 1 ? '' : 's'} measured but not priced`
              : 'every condition priced through the book'}</p>
          </div>
        </div>

        {gaps.length > 0 && (
          <p className="note note--err" style={{ marginTop: 12 }}>
            <b>Not everything priced.</b> {gaps.join(' · ')}. It is on the survey and it will be
            on the revision; it is not in the figure above.
          </p>
        )}

        {/* TWO STEPS, IN THIS ORDER. Ryan, 14 Sep: sales hear the results before
            anybody decides about the cost — they are the one who has to speak
            to the customer, and being told what was settled without them is not
            the same as being asked. The server refuses to close a survey whose
            results have not gone, so the rule survives a busy Friday rather
            than living in this markup. */}
        {read.survey?.results_sent_at ? (
          <p className="svnote">
            <b>Sales have the results.</b> Sent{' '}
            {day(read.survey.results_sent_at)} — the decision below is theirs to argue with
            before it is made.
          </p>
        ) : mayEdit && (
          <div className="svstep">
            <div className="svstep__t">
              <b>Sales have not seen this yet</b>
              <span>
                They take the call if the price moves, so they read the numbers before the
                cost is settled. Nothing goes to the customer from here.
              </span>
            </div>
            <ActionForm action={sendResults} label="Send the results to sales"
                        busy="Sending…" className="svstep__f">
              <input type="hidden" name="job_id" value={job.id} />
            </ActionForm>
          </div>
        )}

        {read.revision && (
          <p className="svnote">
            {read.revision.held_price ? (
              <>
                <b>The price was held.</b> {money(Number(read.revision.sold_before ?? 0))} stands,
                and the difference came out of the margin.
              </>
            ) : (
              <>
                <b>The firm price went out at {money(Number(read.revision.sold_after ?? 0))}.</b>{' '}
                {read.revision.link?.signed_at
                  ? `Signed ${day(read.revision.link.signed_at)}.`
                  : read.revision.link?.mailed_at
                    ? `Mailed ${day(read.revision.link.mailed_at)}`
                      + `${read.revision.link.mailed_to ? ` to ${read.revision.link.mailed_to}` : ''}`
                      + ', waiting on a signature.'
                    : 'Waiting on a signature.'}
              </>
            )}
            {read.revision.note && <> &ldquo;{read.revision.note}&rdquo;</>}
          </p>
        )}

        {mayEdit && signed != null && read.survey?.results_sent_at && (
          <ActionForm action={closeSurvey} label="Close the survey" busy="Closing…">
            <input type="hidden" name="job_id" value={job.id} />
            <div className="svfork">
              <label className="svfork__c">
                <input type="radio" name="outcome" value="absorb" />
                <span className="svfork__b">
                  <b>We absorb it</b>
                  <span>
                    The customer keeps the number they signed. The job books at{' '}
                    {money(signed)} and the {money(Math.abs(moved))} comes out of the margin.
                  </span>
                </span>
              </label>
              <label className="svfork__c">
                <input type="radio" name="outcome" value="review" defaultChecked />
                <span className="svfork__b">
                  <b>The customer reviews it</b>
                  <span>
                    {firm == null ? 'The revised figure' : money(firm)} goes to them for
                    signature as a FIRM price, with everything the survey found listed under
                    what they signed. Sales are copied on the same letter.
                  </span>
                </span>
              </label>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="sv-note">Anything sales needs to say</label>
                <input className="field" id="sv-note" name="note"
                       placeholder="Why it moved, in a sentence they can repeat" /></div>
            </div>
          </ActionForm>
        )}
      </section>
    </>
  )
}
