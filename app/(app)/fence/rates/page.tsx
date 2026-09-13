import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadRates, rateAge, RATE_KINDS, type Rate } from '@/lib/fence'
import { FenceMark } from '@/components/FenceMark'

export const dynamic = 'force-dynamic'

const money = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US',
    { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)

/**
 * The rate book.
 *
 * One cost and one markup for the whole account, however many organizations
 * run fence. Sell is generated in the database from the two, so it cannot drift
 * from the cost it came from — and reading it needs no access to either, which
 * is what lets a salesperson price a job without seeing the margin inputs.
 *
 * Nothing on this page asks whether somebody may see cost. The columns are
 * revoked, the query either returns them or does not, and the page draws what
 * came back.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { rates, seesCost } = await loadRates(session.accountId)
  const placeholders = rates.filter((r) => r.source === 'placeholder').length

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Rate book</h1>
        <p className="scopeline">
          <span>
            {rates.length} active {rates.length === 1 ? 'line' : 'lines'}
            {seesCost ? ' · you can see cost and markup' : ' · sell only'}
          </span>
        </p>
      </div></div>

      {placeholders > 0 && (
        <section className="sec">
          <p className="fjnote">
            <FenceMark kind="warn" title="Placeholder figures" />
            <span>
              <b>{placeholders} of {rates.length} figures are placeholders</b> — seeded so the
              estimator and the quote have something to price against. Nothing here prices
              honestly until On Call&rsquo;s real cost and sell replace them, and every one is
              stamped so it cannot be mistaken for a checked number.
            </span>
          </p>
        </section>
      )}

      {RATE_KINDS.map(({ key, en }) => {
        const rows = rates.filter((r) => r.kind === key)
        if (rows.length === 0) return null
        return (
          <section className="sec" key={key}>
            <header className="fjphase__h">
              <h2>{en}</h2>
              <span className="fjcount">{rows.length}</span>
            </header>
            <div className={seesCost ? 'fjhead fjhead--rate' : 'fjhead fjhead--sell'} aria-hidden="true">
              <span>Code</span><span>Item</span><span>Unit</span>
              {seesCost && <><span>Cost</span><span>Markup</span></>}
              <span>Sell</span><span>Checked</span>
            </div>
            <ul className="fjrows">
              {rows.map((r: Rate) => {
                const age = rateAge(r.verified_on)
                return (
                  <li className="fjrow" key={r.id}>
                    <div className={seesCost ? 'fjrow__go fjrow__go--rate' : 'fjrow__go fjrow__go--sell'}>
                      <span className="rcell rcell--lead"><span className="fjcode">{r.code}</span></span>
                      <span className="rcell">
                        <span className="rcell__lab">Item</span>
                        <span className="rcell__val">
                          <b className="fjname">{r.name_en}</b>
                          {r.name_es && <span className="fjsub">{r.name_es}</span>}
                        </span>
                      </span>
                      <span className="rcell">
                        <span className="rcell__lab">Unit</span>
                        <span className="rcell__val fjnum">{r.uom}</span>
                      </span>
                      {seesCost && (
                        <>
                          <span className="rcell">
                            <span className="rcell__lab">Cost</span>
                            <span className="rcell__val fjnum">{money(r.cost)}</span>
                          </span>
                          <span className="rcell">
                            <span className="rcell__lab">Markup</span>
                            <span className="rcell__val fjnum">{r.markup ?? '—'}</span>
                          </span>
                        </>
                      )}
                      <span className="rcell">
                        <span className="rcell__lab">Sell</span>
                        <span className="rcell__val fjnum"><b>{money(r.sell)}</b></span>
                      </span>
                      <span className="rcell">
                        <span className="rcell__lab">Checked</span>
                        <span className="rcell__val fjnum">
                          {age == null
                            ? <FenceMark kind="warn" title="Never checked against a supplier invoice">Never</FenceMark>
                            : `${age}d`}
                        </span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {rates.length === 0 && (
        <section className="sec"><p className="fjempty">
          The book is empty. Nothing can be priced until it has lines in it.
        </p></section>
      )}
    </>
  )
}
