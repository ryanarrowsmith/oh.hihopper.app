import { notFound } from 'next/navigation'
import { openQuote } from '@/lib/quote'
import { money, day } from '@/lib/estimate'
import EstimateDoc from '@/components/EstimateDoc'
import SignEstimate from '@/components/SignEstimate'
import PrintIt from '@/components/PrintIt'

export const dynamic = 'force-dynamic'

/**
 * The customer's estimate.
 *
 * Outside the (app) group on purpose, like the crew ticket: no rail, no top
 * bar, no sign-in. The person opening this has no Hopper account and never
 * will, and everything that is not the estimate is in the way.
 *
 * A token that is unknown, revoked or past its date gets the SAME page as one
 * that never existed, because a reply that differs is a way to test tokens. A
 * token that has been SIGNED still opens -- to the same document, with the
 * signature where the button was -- because the person who signed it should be
 * able to go back and read what they agreed to.
 */
export const metadata = { robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const q = await openQuote(token)

  if (!q) {
    return (
      <main className="est est--gone">
        <h1>This estimate is no longer open</h1>
        <p>
          The link has expired or been replaced. Call the person who sent it and they will
          send you a current one.
        </p>
      </main>
    )
  }

  const hasMap = Array.isArray((q.frozen as any)?.measure?.runs)
    && (q.frozen as any).measure.runs.some((r: any) => Array.isArray(r.points) && r.points.length >= 2)

  return (
    <main className="est__page">
      <div className="est__bar noprint">
        <span>{q.job.ref} &middot; {q.firm ? 'firm price' : 'estimate'} for{' '}
          {q.contact?.company ?? q.job.customer ?? q.job.name}</span>
        <PrintIt label="Print or save as PDF" />
      </div>

      <EstimateDoc
        job={q.job}
        place={q.place}
        option={q.option}
        frozen={q.frozen}
        gateNames={q.gateNames}
        specName={q.specName}
        seller={q.seller}
        contact={q.contact}
        company={q.company}
        issuedOn={q.issuedOn}
        goodThrough={q.goodThrough}
        mapSrc={hasMap ? `/e/${token}/map` : null}
        firm={q.firm}
      >
        {q.signedAt ? (
          <section className="est__sec est__accept est__accept--done">
            <h2>Signed</h2>
            <p className="est__signed">
              <b>{q.signedName}</b> signed this {q.firm ? 'price' : 'estimate'} on{' '}
              {day(q.signedAt)} at {money(q.option.price)}.
            </p>
            <p>
              {q.firm
                ? <>We have it. This is the figure we build to, and the work goes on the
                    schedule from here.</>
                : <>We have it. Somebody will be in touch to book the site survey, and the
                    firm price follows that. Nothing is built until you have agreed to it in
                    writing.</>}
            </p>
          </section>
        ) : (
          <SignEstimate token={token} price={money(q.option.price)}
                        was={q.contact} />
        )}
      </EstimateDoc>
    </main>
  )
}
