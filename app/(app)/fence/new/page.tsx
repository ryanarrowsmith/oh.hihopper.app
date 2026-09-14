import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadFenceEntities, fenceStance, loadRights, ROLE_WORD } from '@/lib/fence'
import ActionForm from '@/components/ActionForm'
import Choice from '@/components/Choice'
import { FenceMark } from '@/components/FenceMark'
import { openJob } from '@/app/actions/fence'

export const dynamic = 'force-dynamic'

const CLASSES = [
  { value: 'permanent', label: 'Permanent', hint: 'Built to stay. Posts in concrete.' },
  { value: 'temporary', label: 'Temporary', hint: 'Panels on bases, rented by the cycle.' },
  { value: 'secure', label: 'Secure', hint: 'Anti-climb, anti-dig, escorted sites.' },
]

/**
 * Opening a job.
 *
 * TWO WAYS IN, AND THE DIFFERENCE IS WHERE IT STARTS. A new estimate begins at
 * intake and runs through sales: measure, price, quote, sell, hand over. A work
 * order on an open rental never had a sales phase — somebody rang and asked for
 * more fence — so it enters at the SURVEY with the project manager's task plan
 * already open. The job page draws the sales phase as "Not used" rather than
 * leaving it unfinished forever.
 *
 * THE ADDRESS IS THE ONLY THING THAT IS HARD TO ADD LATER. Everything else on
 * this form can be changed on the job; the address is what the aerial is found
 * from, so it is asked for here and confirmed at the survey. A lookup that fails
 * does not stop the job — the pin is a convenience and the job is the point.
 *
 * Nothing a person may not do is rendered: the organization list is only the
 * ones this person holds the fence module on at edit level, and landing on a
 * form with an empty list is worse than not arriving.
 */
export default async function NewJob({ searchParams }: {
  searchParams: Promise<{ from?: string }>
}) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { from } = await searchParams
  const fromSurvey = from === 'survey'

  const [orgs, { jobRole }, rights] = await Promise.all([
    loadFenceEntities(session.accountId),
    fenceStance(session.accountId),
    loadRights(session.accountId),
  ])

  if (orgs.length === 0) redirect('/fence')

  // Sales opens an estimate, a project manager opens a work order, and whoever
  // administers the account opens either. The database says the same thing; this
  // is so the answer arrives before the form is filled in rather than after.
  const mayOpen = rights.mayManage
    || (fromSurvey ? jobRole === 'pm' : jobRole === 'sales')

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{fromSurvey ? 'New work order' : 'New estimate'}</h1>
        <p className="scopeline"><span>
          {fromSurvey
            ? 'More fence on a site that is already open. It skips sales and starts at the survey, with the project manager’s tasks already on it.'
            : 'A job to measure, price and quote. It starts at intake and is sealed when sales hands it over.'}
        </span></p>
      </div>
      <div className="fjact">
        <FenceMark kind={fromSurvey ? 'edit' : 'read'}>
          {fromSurvey ? 'Enters at the survey' : 'Enters at intake'}
        </FenceMark>
      </div></div>

      {!mayOpen && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>This is not yours to open.</b>{' '}
          {fromSurvey
            ? 'A work order belongs to the project manager, because the survey is the first thing on it.'
            : 'An estimate belongs to sales, because intake is the first thing on it.'}
          {jobRole
            ? ` You are ${ROLE_WORD[jobRole].toLowerCase()} on fence jobs.`
            : ' You hold no fence job at all.'}
          {' '}The form is below and the database will refuse it, which is the honest version of
          hiding it.
        </p>
      )}

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>What and where</h2>
          <p>
            The name is what somebody would call it on the phone. The address is the only thing
            here that is awkward to add later — it is what the aerial is found from.
          </p>
        </div></div>

        <ActionForm action={openJob}
                    label={fromSurvey ? 'Open the work order' : 'Open the estimate'}
                    busy="Opening…">
          <input type="hidden" name="from" value={fromSurvey ? 'survey' : 'intake'} />

          <div className="formrow">
            <div><label htmlFor="nj-name">Job name</label>
              <input className="field" id="nj-name" name="name" required autoFocus
                     placeholder="Redbud Logistics — north yard" /></div>
            <div><label htmlFor="nj-cust">Customer</label>
              <input className="field" id="nj-cust" name="customer"
                     placeholder="Redbud Logistics" /></div>
          </div>

          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="nj-org">Organization</label>
              <Choice id="nj-org" name="entity_id" required
                      defaultValue={orgs.find((o) => /on call services/i.test(o.name))?.id
                        ?? orgs[0].id}
                      options={orgs.map((o) => ({ value: o.id, label: o.name }))} /></div>
            <div><label htmlFor="nj-cls">Class</label>
              <Choice id="nj-cls" name="cls" defaultValue="permanent" options={CLASSES} /></div>
          </div>

          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="nj-l1">Site address</label>
              <input className="field" id="nj-l1" name="line1"
                     placeholder="4120 N Peoria Ave" /></div>
          </div>
          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="nj-city">City</label>
              <input className="field" id="nj-city" name="city" placeholder="Tulsa" /></div>
            <div><label htmlFor="nj-region">State</label>
              <input className="field" id="nj-region" name="region" placeholder="OK" /></div>
            <div><label htmlFor="nj-zip">ZIP</label>
              <input className="field" id="nj-zip" name="postcode" placeholder="74106" /></div>
          </div>

          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="nj-note">Anything about getting on site</label>
              <input className="field" id="nj-note" name="pin_note"
                     placeholder="Gate code, which drive takes a truck, who to ask for" /></div>
          </div>

          <p className="fxhint">
            The reference is taken, not typed — the next number after the highest one here. The map
            pin is looked up from the address; if that fails the job still opens and the estimator
            says why there is nothing to draw on.
            {fromSurvey && ' The project manager’s task plan opens with it, starting with the Navusoft account.'}
          </p>
        </ActionForm>
      </section>

      <p className="fjfoot"><Link href={'/fence' as any}>Back to jobs</Link></p>
    </>
  )
}
