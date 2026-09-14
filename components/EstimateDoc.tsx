import { quoteLines, whatWeBuild, specWords, money, day, type Frozen } from '@/lib/estimate'

/* ==========================================================================
   THE CUSTOMER'S ESTIMATE, AS A DOCUMENT.

   Two letter sheets on screen, two pages out of a printer, and the same markup
   for both -- the page breaks are in the stylesheet rather than in a second
   renderer. It is the only thing in Hopper drawn in ON CALL's brand rather than
   Hopper's, because it is the only thing a customer ever sees.

   AN ESTIMATE SAYS SO. Ryan's rule, 14 Sep: the number is worked out from what
   we know today and confirmed after somebody measures it on the ground, so it
   is said under the number at the top, in a band above the fold, and again
   beside the total. A document that lets a customer read it as a final price is
   the document that starts the argument.

   RED IS THE LOGO'S AND NOTHING ELSE'S -- his other rule the same day, system
   wide. Steel does the eyebrow, the rules, the bullets and the line on the
   plan. The only red on the page is inside the artwork.
   ========================================================================== */

export type EstimateFor = {
  job: { ref: string; name: string; customer: string | null; site_address: string | null }
  place: { line1: string | null; line2: string | null; city: string | null
           region: string | null; postcode: string | null } | null
  option: { label: string; price: number; spec_code: string | null }
  frozen: Frozen
  gateNames: Map<string, string>
  specName: string | null
  seller: { name: string; email: string | null; phone: string | null; title: string | null } | null
  contact: { name: string; title: string | null; email: string | null
             phone: string | null; company: string | null } | null
  company: { name: string | null; line1: string | null; line2: string | null
             phone: string | null; site: string | null; license: string | null }
  issuedOn: string
  goodThrough: string | null
  /** Where the aerial comes from, or null when the line was walked with a wheel. */
  mapSrc: string | null
  /* THE SAME DOCUMENT, AFTER THE SURVEY.
     When this is set the sheet stops being an estimate and becomes a price:
     the customer signed a figure, somebody walked the site, and what they found
     is listed line by line UNDER the signed roll-up rather than folded into it.
     Folding it in would have quietly changed the fence line's own amount, which
     is precisely the move this whole flow exists to prevent. */
  firm?: {
    before: number
    after: number
    note: string | null
    extras: { what: string; detail: string; amount: number }[]
  } | null
  /** The signing block, or the record of it. Given by whoever is rendering. */
  children?: React.ReactNode
}

export default function EstimateDoc(p: EstimateFor) {
  const where = p.place
    ? [p.place.line1, p.place.line2,
       [p.place.city, p.place.region].filter(Boolean).join(', '), p.place.postcode]
        .filter(Boolean).join(', ')
    : p.job.site_address ?? '—'
  const line1 = p.place?.line1 ?? p.job.site_address ?? '—'
  const line2 = p.place
    ? [[p.place.city, p.place.region].filter(Boolean).join(', '), p.place.postcode]
        .filter(Boolean).join(' ')
    : ''

  const gName = (code: string) => p.gateNames.get(code) ?? 'gate'
  const lines = quoteLines(p.frozen, gName)
  const gates: { name: string; n: number }[] = []
  for (const l of p.frozen.lines) {
    if (!l.type_code) continue
    const nm = gName(l.type_code)
    const had = gates.find((g) => g.name === nm)
    if (had) had.n += Number(l.qty ?? 0)
    else gates.push({ name: nm, n: Number(l.qty ?? 0) })
  }
  const build = whatWeBuild(p.frozen, gates)
  const title = p.specName ?? (p.frozen.spec ? specWords(p.frozen.spec) : 'Fence')

  const Mast = ({ sub }: { sub: React.ReactNode }) => (
    <>
      <header className="est__mast">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/oncall-logo.png" alt="On Call Services and Rentals" width={250} height={49} />
        <div className="est__no">
          <b>Estimate</b>
          <span>{p.job.ref}</span>
          <small>{sub}</small>
        </div>
      </header>
      <div className="est__rule" />
    </>
  )

  return (
    <div className="est">
      {/* ---------------- sheet one ---------------- */}
      <section className="est__sheet">
        <Mast sub={<>
          {day(p.issuedOn)}
          {p.goodThrough ? <> &middot; good through {day(p.goodThrough)}</> : null}
          <br />{p.firm ? <>Firm &mdash; confirmed by the survey</> : <>Estimated &mdash; not a final price</>}
        </>} />

        <h1>{title} &mdash;<br />{line1}</h1>
        <p className="est__lede">
          {p.firm
            ? <>We have walked the site and measured the line on the ground. Here is the
                price, what changed from the estimate you signed, and why.</>
            : <>Here is what we think this comes to, worked out from the aerial measure and
                what material costs today &mdash; along with what it does not include.</>}
        </p>

        <div className="est__band">
          <b>{p.firm ? 'Firm price' : 'Estimate'}</b>
          <p>
            {p.firm
              ? <>This is a firm price, not an estimate. Somebody has walked the line,
                  measured it on the ground and seen what is actually in the way. Everything
                  that changed is listed below with what it costs. Nothing else changes
                  without your agreement.</>
              : <>This is an estimate, not a final price. It is based on the information we
                  have right now. We confirm it after a site survey, when somebody walks the
                  line, measures it on the ground and sees what is actually in the way. If
                  that changes the number, you will see the change and agree to it before
                  anybody builds anything.</>}
          </p>
          {p.firm?.note && <p><b>{p.firm.note}</b></p>}
        </div>

        <div className="est__facts">
          <div>
            <span>Prepared for</span>
            <b>{p.contact?.company ?? p.job.customer ?? p.job.name}</b>
            {p.contact
              ? <i>{[p.contact.name, p.contact.title].filter(Boolean).join(', ')}</i>
              : (p.job.customer && p.job.name !== p.job.customer && <i>{p.job.name}</i>)}
          </div>
          <div>
            <span>Where the work is</span>
            <b>{line1}</b>
            {line2 && <i>{line2}</i>}
          </div>
          <div>
            <span>Your estimator</span>
            <b>{p.seller?.name ?? <i className="est__none">not recorded</i>}</b>
            {p.seller && (
              <i>{[p.seller.phone, p.seller.email].filter(Boolean).join(' · ')}</i>
            )}
          </div>
        </div>

        {p.mapSrc && (
          <section className="est__sec">
            <h2>The line we measured</h2>
            <figure className="est__fig">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.mapSrc} alt={`The fence line on ${p.job.ref}`} />
              <figcaption>
                <span>{p.job.ref} &middot; measured {day(p.frozen.priced_on)}</span>
                <span>
                  {p.frozen.measure.fence_ft.toLocaleString('en-US')} ft measured on the aerial
                  {gates.length > 0 && ` · ${gates.reduce((s, g) => s + g.n, 0)} gate openings`}
                </span>
              </figcaption>
            </figure>
          </section>
        )}

        <section className="est__sec">
          <h2>What we&rsquo;ll build</h2>
          <ul className="est__spec">
            {build.map((b, i) => (
              <li key={i}><b>{b.label}</b><span>{b.says}</span></li>
            ))}
          </ul>
        </section>

        <section className="est__sec">
          <h2>{p.firm ? 'What it comes to' : 'What we estimate it at'}</h2>
          <table className="est__price">
            <thead><tr><th>Item</th><th>Quantity</th><th>Amount</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.what}<small>{l.detail}</small></td>
                  <td className="est__num">{l.qty}</td>
                  <td className="est__num">{money(l.amount)}</td>
                </tr>
              ))}
              {p.firm ? (
                <>
                  <tr className="est__sub">
                    <td>Estimated at signing</td><td />
                    <td className="est__num">{money(p.firm.before)}</td>
                  </tr>
                  {p.firm.extras.map((e, i) => (
                    <tr key={`x${i}`}>
                      <td>{e.what}<small>{e.detail}</small></td>
                      <td className="est__num" />
                      <td className="est__num">{money(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="est__tot">
                    <td>Firm total</td><td />
                    <td className="est__num">{money(p.firm.after)}</td>
                  </tr>
                </>
              ) : (
                <tr className="est__tot">
                  <td>Estimated total</td><td />
                  <td className="est__num">{money(p.option.price)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="est__after">
            {p.frozen.per_foot != null && !p.firm && (
              <span><b>{money(p.frozen.per_foot)}</b> a foot, estimated</span>
            )}
            {p.goodThrough && <span><b>Good through</b> {day(p.goodThrough)}</span>}
            <span><b>Tax</b> not included</span>
          </p>
          <p className="est__note">
            {p.firm ? (
              <>
                <b>This is the price.</b> The line above was measured on the ground, not on a
                photograph, and everything the survey found is listed with what it costs.
                Signing here agrees to the figure, and it is the figure we build to.
              </>
            ) : (
              <>
                <b>Confirmed after the survey.</b> The length above was measured on an aerial
                photograph, which is accurate to the line we can see. Grade, rock, an old
                footing or a fence line that does not run where the picture suggests all move
                the number, and the only way to know is to stand on it. The survey is how the
                estimate becomes a price.
              </>
            )}
          </p>
        </section>
      </section>

      {/* ---------------- sheet two ---------------- */}
      <section className="est__sheet est__sheet--last">
        <Mast sub={<>{p.contact?.company ?? p.job.customer ?? p.job.name}<br />page 2 of 2</>} />

        <section className="est__sec">
          <div className="est__two">
            <div>
              <h2>Included</h2>
              <ul className="est__list">
                <li>Measuring and laying out the line on site</li>
                <li>Calling in utility locates and waiting them out</li>
                <li>All material, delivered</li>
                <li>Digging, setting and concreting every post</li>
                {gates.length > 0 && <li>Hanging and adjusting every gate</li>}
                <li>Hauling off spoil and packaging</li>
                <li>One year on workmanship</li>
              </ul>
            </div>
            <div>
              <h2>Not included</h2>
              <ul className="est__list est__list--not">
                <li>Sales tax</li>
                <li>Permits, if the city requires one</li>
                <li>Removing or disposing of an existing fence</li>
                <li>Rock, concrete or buried debris in a post hole</li>
                <li>Clearing brush or trees along the line</li>
                <li>Grading, fill or drainage work</li>
                <li>Anything a locate marks that has to be hand dug</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="est__sec">
          <h2>How it runs</h2>
          <div className="est__runs">
            <div>
              <h3>Schedule</h3>
              <p>Two to three weeks from the day you approve the firm price, weather
                allowing. We call the day before and again when the crew is on the way.</p>
            </div>
            <div>
              <h3>Locates</h3>
              <p>We call them in. Anything private &mdash; irrigation, yard lighting, a dog
                fence &mdash; is yours to mark, because nobody else knows it is there.</p>
            </div>
            <div>
              <h3>Payment</h3>
              <p>Half when you approve the firm price, the balance when the work is finished
                and you have walked it with us. Net 30 on approved accounts.</p>
            </div>
          </div>
        </section>

        {p.children}

        <footer className="est__foot">
          <span><b>{p.company.name ?? 'On Call Services and Rentals'}</b></span>
          {p.company.line1 && (
            <span>{[p.company.line1, p.company.line2].filter(Boolean).join(', ')}</span>
          )}
          {p.company.phone && <span>{p.company.phone}</span>}
          {p.company.license && <span>License {p.company.license}</span>}
          {p.company.site && <span>{p.company.site}</span>}
        </footer>
      </section>
    </div>
  )
}
