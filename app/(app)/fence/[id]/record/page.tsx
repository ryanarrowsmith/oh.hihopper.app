import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadJob } from '@/lib/fence'
import { buildSheet, mergeSheet, whoCarriedIt, finishedOn } from '@/lib/handoff'
import { loadBilling } from '@/lib/billing'
import { supabaseServer } from '@/lib/supabase/server'
import { SPINE, spineOf } from '@/lib/sow'
import PrintIt from '@/components/PrintIt'

export const dynamic = 'force-dynamic'

/**
 * The whole job, as a document.
 *
 * This is the thing that gets filed to the Navusoft account, and it is the
 * reason the module can say "with the whole job attached" without hand-waving:
 * six sections, in the order the work ran, every figure the one that was frozen
 * rather than the one that happens to be current.
 *
 * IT SHOWS WHAT WAS SOLD, NOT WHAT THE BOOK SAYS TODAY. The sell lines come off
 * the accepted option's frozen takeoff. A rate corrected next March must not
 * silently restate a job billed last September — a document outlives the moment
 * it was made, and that is the whole argument for freezing.
 *
 * NO COST AND NO MARGIN, EVER. Not because of who is reading: because of where
 * this piece of paper ends up. It is attached to an account, forwarded, printed
 * and left on desks. Cost lives behind a row policy for people; it stays off
 * paper for places.
 */
export default async function Record({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { id } = await params
  const loaded = await loadJob(session.accountId, id)
  if (!loaded) notFound()
  const { job, tasks, seals, place } = loaded

  const b = await loadBilling(session.accountId, id)
  const derived = b.sold
    ? buildSheet({
        sold: b.sold, cls: job.cls ?? 'permanent',
        rules: b.rules, codes: b.codes, gateTypes: b.gateTypes,
      })
    : null
  const sheet = derived ? mergeSheet(derived, b.savedLines) : null

  const { data: dir } = await supabaseServer().schema('hopper').from('directory')
    .select('id, full_name').eq('active', true)
  const names = new Map(((dir ?? []) as any[]).map((p) => [p.id, p.full_name as string]))
  const pm = whoCarriedIt(tasks, names)
  const finished = finishedOn(tasks)

  const printedOn = new Date().toLocaleDateString('en-US',
    { day: 'numeric', month: 'short', year: 'numeric' })
  const day = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
        : '—'
  const money = (n: number | null | undefined) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const ft = (n: number | null | undefined) =>
    n == null ? '—' : `${Math.round(Number(n)).toLocaleString('en-US')} ft`

  const m = b.sold?.takeoff?.measure ?? null
  const soldLines: any[] = Array.isArray(b.sold?.takeoff?.lines) ? b.sold!.takeoff.lines : []
  const parts = spineOf(b.sow?.parts_en ?? null)
  const partsEs = spineOf(b.sow?.parts_es ?? null)
  const where = place
    ? [place.line1, place.line2, [place.city, place.region].filter(Boolean).join(', '), place.postcode]
        .filter(Boolean).join(', ')
    : job.site_address ?? '—'

  const ticket = tasks.filter((t) => t.section === 'ticket')
  const closeout = tasks.filter((t) => t.section === 'closeout')
  const pmNotes = b.notes.filter((n: any) => ['closeout', 'billing', 'ticket'].includes(n.section))

  return (
    <div className="pdoc">
      <div className="pdoc__do noprint"><PrintIt /></div>

      <div className="pdoc__top">
        <span className="pdoc__mark mark mark--sm">hopper<span className="pd">.</span></span>
        <div className="pdoc__t">
          <h1>{job.ref} — {job.name}</h1>
          <p>{[job.customer, where].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="pdoc__meta">
          <b>{place?.navusoft_account ? `Navusoft ${place.navusoft_account}` : 'No Navusoft account'}</b>
          {b.sold ? money(b.sold.price) : 'Nothing sold'}
          <br />Printed {printedOn}
        </div>
      </div>

      {/* 1 -------------------------------------------------------------- */}
      <section className="pblock">
        <div className="pblock__h"><h2>1 · The job</h2></div>
        <table className="fxtable fxrec">
          <tbody>
            <tr><th>Reference</th><td>{job.ref}</td></tr>
            <tr><th>Customer</th><td>{job.customer ?? '—'}</td></tr>
            <tr><th>Service location</th><td>{where}</td></tr>
            <tr><th>Fence</th><td>{job.cls ?? '—'}{b.sold?.spec_code ? ` · ${b.sold.spec_code}` : ''}</td></tr>
            <tr><th>Project manager</th><td>{pm ?? 'Nobody has ticked a step yet'}</td></tr>
            <tr><th>Crew</th><td>{job.crew ?? '—'}</td></tr>
            <tr><th>Started</th><td>{day(job.starts_on)}</td></tr>
            <tr><th>Work completed</th><td>{finished ? day(finished) : 'Not finished'}</td></tr>
          </tbody>
        </table>
        {place?.note && <p className="pblock__warn">About the site: {place.note}</p>}
      </section>

      {/* 2 -------------------------------------------------------------- */}
      <section className="pblock">
        <div className="pblock__h"><h2>2 · What was sold</h2></div>
        {!b.sold ? (
          <p className="pblock__none">No quote on this job is marked sold.</p>
        ) : (
          <>
            <p className="fxrec__lead">
              <b>{b.sold.label}</b> — {money(b.sold.price)}
              {b.sold.priced_at ? `, priced ${day(b.sold.priced_at)}` : ''}
              {seals.some((s) => s.section === 'estimate') ? ', estimate sealed' : ''}
            </p>
            <table className="fxtable">
              <thead><tr><th>Code</th><th>What</th><th>Qty</th><th>Extended</th></tr></thead>
              <tbody>
                {soldLines.map((l, i) => (
                  <tr key={`${l.code}-${i}`}>
                    <td className="fxcode">{l.code}</td>
                    <td>{l.name}</td>
                    <td className="fxnum">{Number(l.qty).toLocaleString('en-US')} {l.uom}</td>
                    <td className="fxnum">{money(l.extended)}</td>
                  </tr>
                ))}
                <tr className="fxrec__tot">
                  <td colSpan={3}>Sold for</td>
                  <td className="fxnum">{money(b.sold.price)}</td>
                </tr>
              </tbody>
            </table>
            {b.sold.note && <p className="pblock__warn">{b.sold.note}</p>}
          </>
        )}
      </section>

      {/* 3 -------------------------------------------------------------- */}
      <section className="pblock">
        <div className="pblock__h"><h2>3 · The measure</h2></div>
        {!m ? (
          <p className="pblock__none">Nothing was measured on the quote.</p>
        ) : (
          <>
            <table className="fxtable fxrec">
              <tbody>
                <tr><th>Plan length</th><td>{ft(m.plan_ft)}</td>
                    <th>With grade</th><td>{ft(m.slope_ft)}</td></tr>
                <tr><th>Gate openings</th><td>{ft(m.opening_ft)}</td>
                    <th>Fence built</th><td>{ft(m.fence_ft)}</td></tr>
                <tr><th>Line posts</th><td>{m.line_posts}</td>
                    <th>Terminal posts</th><td>{m.terminal_posts}</td></tr>
                <tr><th>Corner posts</th><td>{m.corner_posts}</td>
                    <th>Waste allowed</th><td>{b.sold?.takeoff?.waste_pct ?? '—'}%</td></tr>
              </tbody>
            </table>
            {Array.isArray(m.runs) && m.runs.length > 0 && (
              <table className="fxtable fxmeasure">
                <thead><tr><th>Run</th><th>Plan</th><th>With grade</th><th>Corners</th><th>Closed</th></tr></thead>
                <tbody>
                  {m.runs.map((r: any) => (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td className="fxnum">{ft(r.planFt)}</td>
                      <td className="fxnum">{r.slopeFt > r.planFt ? ft(r.slopeFt) : '—'}</td>
                      <td className="fxnum">{r.corners || '—'}</td>
                      <td>{r.closed ? 'Closes on itself' : 'Open ends'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* The same picture the customer was given, off the same frozen
                geometry. A screenshot would carry whatever was on somebody's
                screen and nothing that says which job it is. */}
            <figure className="fxmap fxrec__map">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/fence/${job.id}/map${b.sold ? `?option=${b.sold.id}` : ''}`}
                   alt={`The measured line on ${job.ref}`} />
            </figure>
          </>
        )}
      </section>

      {/* 4 -------------------------------------------------------------- */}
      <section className="pblock">
        <div className="pblock__h"><h2>4 · The scope of work</h2></div>
        {!b.sow || parts.every((p) => !p.text) ? (
          <p className="pblock__none">No scope of work was written.</p>
        ) : (
          <>
            <p className="fxrec__lead">
              {b.sow.signed_at
                ? `Signed ${day(b.sow.signed_at)}`
                : 'Not signed'}
              {b.sow.readability ? ` · readability ${Math.round(Number(b.sow.readability))}` : ''}
            </p>
            {SPINE.map((s, i) => {
              const en = parts[i]?.text ?? ''
              const es = partsEs[i]?.text ?? ''
              if (!en && !es) return null
              return (
                <div className="fxrec__part" key={s.key}>
                  <h3>{s.en} · {s.es}</h3>
                  {en && <p>{en}</p>}
                  {es && <p lang="es" className="fxrec__es">{es}</p>}
                </div>
              )
            })}
          </>
        )}
      </section>

      {/* 5 -------------------------------------------------------------- */}
      <section className="pblock">
        <div className="pblock__h"><h2>5 · The work as done</h2></div>
        {ticket.length + closeout.length === 0 ? (
          <p className="pblock__none">No crew ticket or close-out steps on this job.</p>
        ) : (
          <table className="fxtable">
            <thead><tr><th>Step</th><th>Phase</th><th>Done</th><th>By</th></tr></thead>
            <tbody>
              {[...ticket, ...closeout].map((t) => (
                <tr key={t.id}>
                  <td>{t.en}</td>
                  <td>{t.section === 'ticket' ? 'Crew ticket' : 'Close-out'}</td>
                  <td>{t.done ? day(t.done_at) : 'Open'}</td>
                  <td>{t.done_by ? names.get(t.done_by) ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {b.photos.length > 0 && (
          <p className="fxrec__lead">
            <b>{b.photos.length} photograph{b.photos.length === 1 ? '' : 's'}</b> on the job
            {b.photos.some((p: any) => p.caption)
              ? ` — ${b.photos.filter((p: any) => p.caption).map((p: any) => p.caption).join('; ')}`
              : ', none captioned'}.
          </p>
        )}
        {pmNotes.length > 0 && (
          <div className="fxrec__notes">
            {pmNotes.map((n: any, i: number) => (
              <p key={i}><b>{n.author ?? 'Somebody'}</b> — {n.body}</p>
            ))}
          </div>
        )}
      </section>

      {/* 6 -------------------------------------------------------------- */}
      <section className="pblock">
        <div className="pblock__h"><h2>6 · What accounting keys</h2></div>
        {!sheet || sheet.lines.length === 0 ? (
          <p className="pblock__none">No billing sheet has been built.</p>
        ) : (
          <>
            <table className="fxtable">
              <thead><tr><th>Code</th><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
              <tbody>
                {sheet.lines.map((l, i) => (
                  <tr key={l.id ?? `${l.code}-${i}`}>
                    <td className="fxcode">{l.code}</td>
                    <td>{l.description}
                      {l.recurring && <small>Bills again every cycle</small>}</td>
                    <td className="fxnum">
                      {l.qty == null ? '—' : `${l.qty.toLocaleString('en-US')} ${l.uom ?? ''}`}</td>
                    <td className="fxnum">{money(l.amount)}</td>
                  </tr>
                ))}
                <tr className="fxrec__tot">
                  <td colSpan={3}>Total</td>
                  <td className="fxnum">{money(sheet.total)}</td>
                </tr>
              </tbody>
            </table>
            {!sheet.tallies && (
              <p className="pblock__warn">
                This does not add up to what was sold ({money(sheet.sold)}). One of the two figures
                is wrong and this document does not decide which.
              </p>
            )}
          </>
        )}
        {b.handoffs.length > 0 ? (
          <div className="fxrec__notes">
            {b.handoffs.map((h) => (
              <p key={h.id}>
                <b>{h.how === 'mailed' ? 'Emailed' : 'Sent by hand'} {day(h.sent_at)}</b>
                {h.sent_by_name ? ` by ${h.sent_by_name}` : ''}
                {h.navusoft_account ? ` under Navusoft ${h.navusoft_account}` : ''}
                {h.how === 'mailed' && h.to_email ? ` to ${h.to_email}` : ''}
                {h.note ? ` — ${h.note}` : ''}
              </p>
            ))}
          </div>
        ) : (
          <p className="fxrec__lead">Not yet handed to accounting.</p>
        )}
      </section>

      <div className="pdoc__foot">
        <span>{job.ref} · {job.name}</span>
        <span>hopper — printed {printedOn}</span>
      </div>
    </div>
  )
}
