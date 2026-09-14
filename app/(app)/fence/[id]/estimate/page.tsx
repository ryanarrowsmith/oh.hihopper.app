import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw, loadRates, loadRights } from '@/lib/fence'
import { loadMeasure, loadRecipe } from '@/lib/takeoff'
import { priceIt } from '@/lib/price'
import { FenceMark } from '@/components/FenceMark'
import FenceDraw from '@/components/FenceDraw'
import FenceGates from '@/components/FenceGates'
import ActionForm from '@/components/ActionForm'
import Choice from '@/components/Choice'
import { setJobSpec, putOnQuote, releaseOption, acceptOption } from '@/app/actions/fence'
import type { LngLat } from '@/lib/geo'

export const dynamic = 'force-dynamic'

/**
 * The estimator: measure the line, say what goes in it.
 *
 * Four numbered blocks, in the order the work happens — where it is, draw the
 * line, what goes in, what it comes to — because an estimator does them in that
 * order and a screen that lets you price before you measure invites a price with
 * nothing behind it. Cause above effect: the gates that change the number sit
 * above the number.
 *
 * Nothing on this page is money. That is not a limitation of the screen, it is
 * where the seam falls: everything here is a quantity anybody on the job may
 * read, and the price is the next block down.
 *
 * PRELIMINARY, always. Aerial imagery gets you a quote; it does not get you a
 * build. The stamp is drawn by the page rather than stored on a row, so there is
 * no field anybody can clear.
 */

const CLASSES = [
  { value: 'permanent', label: 'Permanent', hint: 'Built to stay. Posts in concrete.' },
  { value: 'temporary', label: 'Temporary', hint: 'Panels on bases, rented by the cycle.' },
  { value: 'secure', label: 'Secure', hint: 'Anti-climb, anti-dig, escorted sites.' },
]
const CLASS_WORD: Record<string, string> = {
  permanent: 'Permanent', temporary: 'Temporary', secure: 'Secure',
}

const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`

export default async function Estimate({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [m, stance, { data: seals }, recipe, book, rights, { data: options }] =
    await Promise.all([
      loadMeasure(session.accountId, params.id),
      fenceStance(session.accountId),
      db.schema('hopper').from('fence_seal').select('section')
        .eq('account_id', session.accountId).eq('job_id', params.id),
      loadRecipe(session.accountId),
      loadRates(session.accountId),
      loadRights(session.accountId),
      db.schema('hopper').from('fence_option')
        .select('id, label, price, priced_at, note, accepted, takeoff')
        .eq('account_id', session.accountId).eq('job_id', params.id)
        .order('priced_at', { ascending: false }),
    ])

  // Which of those quotes has been let out below the floor, and by whom. Its own
  // table, so releasing touches nothing about the option it releases.
  const { data: releases } = await db.schema('hopper').from('fence_option_release')
    .select('option_id, released_at, note')
    .eq('account_id', session.accountId)
    .in('option_id', ((options ?? []) as any[]).map((o) => o.id).length
      ? ((options ?? []) as any[]).map((o) => o.id) : ['00000000-0000-0000-0000-000000000000'])
  if (!m.job) notFound()

  const sealed = new Set(((seals ?? []) as any[]).map((s) => s.section))
  const stand = howToDraw('estimate', stance.jobRole, sealed as Set<any>, rights.mayManage)
  const mayEdit = stand === 'edit' && !m.job.complete

  const pin: LngLat | null = m.job.lat != null && m.job.lon != null
    ? [Number(m.job.lon), Number(m.job.lat)] : null

  const specsHere = m.specs.filter((s) => s.cls === (m.job.cls ?? 'permanent'))
  const gatesHere = m.catalog.filter((g) => g.cls === (m.job.cls ?? 'permanent'))
  const have: Record<string, number> = {}
  for (const g of m.gates) if (g.type_code) have[g.type_code] = g.qty

  const s = m.sums
  const unpriced = m.gates.filter((g) => !g.priced).length

  const priced = priceIt({
    takeoff: s, gates: m.gates, spec: m.spec, recipe,
    rates: book.rates, wastePct: m.wastePct, seesCost: rights.mayReadCosts,
  })
  const thin = priced.margin != null && priced.margin < m.marginFloor
  const released = new Map(((releases ?? []) as any[]).map((r) => [r.option_id, r]))
  const quotes = (options ?? []) as any[]
  const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Measure the line</h1>
        <p className="scopeline"><span>
          <Link href={`/fence/${m.job.id}`}>{m.job.ref}</Link>
          {m.job.name ? ` — ${m.job.name}` : ''}
          {m.job.customer ? ` · ${m.job.customer}` : ''}
          {m.job.site_address ? ` · ${m.job.site_address}` : ''}
        </span></p>
      </div>
        {/* The stamp is the claim: an aerial gets you a quote, not a build. It
            used to carry two sentences explaining itself to somebody who had
            already read it. */}
        <div className="fxstamp">
          <FenceMark kind="warn">Preliminary</FenceMark>
        </div>
      </div>

      {stand === 'sealed' && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>Sealed.</b> A revision supersedes it and leaves the original standing.
        </p>
      )}
      {stand === 'read' && !sealed.has('estimate') && (
        <p className="note" style={{ marginTop: 16 }}>
          The estimate belongs to sales. Every figure is readable; nothing here opens.
        </p>
      )}

      {/* WHERE IT IS came off this page. It was three cards restating the job:
          the address, whether there is a pin, and a third whose whole content
          was a sentence about grade — a fact card holding no fact. The address
          is in the line under the title, the pin is the aerial you are looking
          at, and the grade is explained by the field that asks for it. What it
          carried that was not a restatement was this, and only when it is
          true. */}
      {!pin && (
        <p className="note note--err" style={{ marginTop: 16 }}>
          <b>No pin on this job</b>, so there is nothing to draw on.{' '}
          <Link href={`/fence/${m.job.id}`}>The job</Link> is where the address is set.
        </p>
      )}

      {/* 1 ------------------------------------------------------------------ */}
      {pin && (
        <section className="sec">
          <div className="sec__h"><div className="sec__t">
            <h2><b className="fxn">1</b>Draw the line</h2>
            {/* The one blurb that survived. Every other section explained its own
                title; this explains a control that is not obvious, which is a
                different thing. */}
            <p>Tap to drop a point, drag one to move it. Switch to <b>Move the map</b> to pan —
              one finger cannot mean two things.</p>
          </div></div>
          <FenceDraw
            jobId={m.job.id}
            centre={pin}
            mayEdit={mayEdit}
            runs={m.runs.map((r) => ({
              id: r.id, label: r.label,
              points: (r.points ?? []) as LngLat[],
              closed: r.closed_loop,
              grade: r.grade_pct == null ? null : Number(r.grade_pct),
              // A length that came off a wheel or a set of plans is shown as
              // typed; one off the aerial is left to the drawing, so redrawing
              // the line still changes the figure.
              typed: r.measured_by && r.measured_by !== 'aerial' && Number(r.plan_ft) > 0
                ? Number(r.plan_ft) : null,
            }))} />
        </section>
      )}

      {/* 2 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">2</b>What goes in</h2>
        </div></div>

        {mayEdit ? (
          <ActionForm action={setJobSpec} label="Save what goes in">
            <input type="hidden" name="job_id" value={m.job.id} />
            <div className="formrow">
              <div><label htmlFor="es-cls">Class</label>
                <Choice id="es-cls" name="cls" defaultValue={m.job.cls ?? 'permanent'}
                        options={CLASSES} /></div>
              <div><label htmlFor="es-spec">Fence type</label>
                <Choice id="es-spec" name="spec_code" defaultValue={m.job.spec_code ?? ''}
                        placeholder="Not chosen yet"
                        options={m.specs.map((sp) => ({
                          value: sp.code,
                          label: sp.name_en,
                          group: CLASS_WORD[sp.cls] ?? sp.cls,
                          hint: [sp.height_ft ? `${Number(sp.height_ft)}′ high` : null,
                                 sp.spacing_ft ? `${Number(sp.spacing_ft)}′ post spacing` : null]
                            .filter(Boolean).join(' · '),
                        }))} /></div>
            </div>

          </ActionForm>
        ) : (
          <div className="fxwhere">
            <div className="fxfact"><b>Class</b>
              <span>{CLASS_WORD[m.job.cls ?? ''] ?? <span className="fjnone">not set</span>}</span></div>
            <div className="fxfact"><b>Fence type</b>
              <span>{m.spec?.name_en ?? <span className="fjnone">not chosen</span>}</span></div>
          </div>
        )}

        {m.spec && (
          <p className="fxspec">
            <b>{m.spec.name_en}</b>
            {m.spec.height_ft && <span>{Number(m.spec.height_ft)}′ high</span>}
            {m.spec.spacing_ft && <span>{Number(m.spec.spacing_ft)}′ post spacing</span>}
            {m.spec.note && <small>{m.spec.note}</small>}
          </p>
        )}

        <h3 className="fxsub">Gates</h3>
        {gatesHere.length === 0 ? (
          <p className="empty">
            No gates in the catalog for {CLASS_WORD[m.job.cls ?? 'permanent']?.toLowerCase()} work.{' '}
            <Link href="/admin/fence?s=specs">Specs and gates</Link> is where they are added.
          </p>
        ) : (
          <FenceGates jobId={m.job.id} mayEdit={mayEdit} have={have}
                      kinds={gatesHere.map((g: any) => ({
                        code: g.code, name_en: g.name_en, cls: g.cls,
                        width_ft: g.width_ft == null ? null : Number(g.width_ft),
                        priced: !!g.rate_code,
                      }))} />
        )}
        {unpriced > 0 && (
          <p className="note">
            {unpriced === 1 ? 'One gate has' : `${unpriced} gates have`} no line in the rate book,
            so {unpriced === 1 ? 'it measures' : 'they measure'} but does not price.{' '}
            <Link href="/admin/fence?s=rates">The rate book</Link>.
          </p>
        )}
      </section>

      {/* 3 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">3</b>What it comes to</h2>
        </div></div>

        {s.planFt === 0 ? (
          <p className="empty">Nothing measured yet. The line above is where that starts.</p>
        ) : (
          <>
            <div className="fxtally">
              <div className="fxtally__r"><b>Plan length</b>
                <span>{ft(s.planFt)}</span>
                <small>{s.runs.filter((r) => r.drawn).length} drawn
                  {s.runs.some((r) => !r.drawn) && `, ${s.runs.filter((r) => !r.drawn).length} measured`}</small></div>
              <div className="fxtally__r"><b>Grade correction</b>
                <span>{s.slopeFt > s.planFt ? `+${ft(s.slopeFt - s.planFt)}` : 'none'}</span></div>
              <div className="fxtally__r"><b>Gate openings</b>
                <span>{s.openingFt > 0 ? `−${ft(s.openingFt)}` : 'none'}</span></div>
              <div className="fxtally__r is-total"><b>Fence to price</b>
                <span>{ft(s.fenceFt)}</span></div>
            </div>

            <div className="fxposts">
              {/* "at 10′ spacing" was real data and came off anyway: it is on the
                  specification line two blocks above this, and cutting it made the
                  four cards the same height — which is the tell that the row was
                  carrying something it did not need. */}
              <div><b>{s.linePosts}</b><span>line posts</span></div>
              <div><b>{s.terminalPosts}</b><span>terminal posts</span></div>
              <div><b>{s.cornerPosts}</b><span>corner posts</span></div>
              <div><b>{m.wastePct}%</b><span>waste</span></div>
            </div>

            <table className="fxtable fxmeasure">
              <thead><tr><th>Run</th><th>Plan</th><th>With grade</th><th>Corners</th><th>How</th></tr></thead>
              <tbody>
                {s.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td className="fxnum">{ft(r.planFt)}</td>
                    <td className="fxnum">{r.slopeFt > r.planFt ? ft(r.slopeFt) : '—'}</td>
                    <td className="fxnum">{r.corners || '—'}</td>
                    <td>{r.drawn
                      ? <FenceMark kind="read">Aerial</FenceMark>
                      : <FenceMark kind="edit">Measured</FenceMark>}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!m.spec ? (
              <p className="note">
                <b>No fence type chosen</b>, so there is nothing to price this against. The
                recipe — what a foot of this fence is made of — hangs off the spec.
              </p>
            ) : (
              <>
                <div className="fxprice">
                  <div className="fxprice__big">
                    <b>{money(priced.sell)}</b>
                    <span>
                      {priced.perFoot ? `${money(priced.perFoot)} a foot` : '—'}
                      {priced.margin != null && (
                        <> · margin <b className={thin ? 'fxthin' : undefined}>{priced.margin}%</b></>
                      )}
                    </span>
                  </div>
                  {/* Cause above effect: what the figure is made of sits under it,
                      and what it is held against sits beside it. */}
                  {priced.margin != null && (
                    <div className={`fxfloor${thin ? ' is-thin' : ''}`}>
                      {thin
                        ? <FenceMark kind="warn">Under the {m.marginFloor}% floor</FenceMark>
                        : <FenceMark kind="done">Clears the {m.marginFloor}% floor</FenceMark>}
                      <small>{thin
                        ? `${Math.round(m.marginFloor - priced.margin)} points under. Needs releasing.`
                        : `${Math.round(priced.margin - m.marginFloor)} points of room.`}</small>
                    </div>
                  )}
                  {priced.margin == null && rights.mayReadCosts && (
                    <div className="fxfloor">
                      <FenceMark kind="warn">No margin</FenceMark>
                      <small>One line has no cost behind it.</small>
                    </div>
                  )}
                </div>

                {priced.gaps.length > 0 && (
                  <p className="note note--err">
                    <b>{priced.gaps.length === 1 ? 'One line has' : `${priced.gaps.length} lines have`}{' '}
                    no price in the book</b> — {priced.gaps.join(', ')}, counted at nothing, so this
                    total is short. <Link href="/admin/fence?s=rates">The rate book</Link>.
                  </p>
                )}

                <table className="fxtable fxbill">
                  {/* Unit cost and unit sell are marked so a phone can drop
                      them: standing in a yard you want the quantity and what the
                      line comes to, and a six-column bill squeezed to 390px is
                      six columns nobody can read. */}
                  <thead><tr>
                    <th>Code</th><th>What</th><th>Qty</th>
                    {rights.mayReadCosts && <th className="fxunit">Cost</th>}
                    <th className="fxunit">Sell</th><th>Extended</th>
                  </tr></thead>
                  <tbody>
                    {priced.lines.map((l, i) => (
                      <tr key={`${l.code}-${l.per}-${i}`} className={l.gap ? 'is-gap' : undefined}>
                        <td className="fxcode">{l.code}</td>
                        <td>{l.name}
                          {l.note && <small>{l.note}</small>}</td>
                        <td className="fxnum">{l.qty.toLocaleString('en-US')} {l.uom}</td>
                        {rights.mayReadCosts && (
                          <td className="fxnum fxunit">{l.cost == null ? '—' : `$${l.cost}`}</td>
                        )}
                        <td className="fxnum fxunit">{l.sell == null ? '—' : `$${l.sell}`}</td>
                        <td className="fxnum">{l.extended == null
                          ? <FenceMark kind="warn">no price</FenceMark>
                          : money(l.extended)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="fxhint">
                  Every rate here is a placeholder until On Call&rsquo;s real book replaces the
                  seeded one.
                </p>

                {mayEdit && (
                  <div className="fxquote">
                    <ActionForm action={putOnQuote} label="Put it on the quote"
                                busy="Pricing…">
                      <input type="hidden" name="job_id" value={m.job.id} />
                      <div className="formrow">
                        <div><label htmlFor="q-label">What to call this option</label>
                          <input className="field" id="q-label" name="label"
                                 placeholder={`${m.spec.name_en} · ${Math.round(s.fenceFt)} ft`} /></div>
                      </div>
                      <p className="fxhint">
                        Priced again from the book as it stands, and the whole argument frozen
                        with it.
                      </p>
                    </ActionForm>
                  </div>
                )}

                {quotes.length > 0 && (
                  <>
                    <h3 className="fxsub">On the quote</h3>
                    <ul className="fxopts">
                      {quotes.map((q) => {
                        const under = !!q.takeoff?.below_floor
                        const rel = released.get(q.id)
                        return (
                          <li key={q.id} className="fxopt">
                            <span className="fxopt__n">
                              <b>{q.label}</b>
                              <small>
                                {q.priced_at ? `Priced ${q.priced_at.slice(0, 10)}` : 'Not priced'}
                                {q.takeoff?.measure?.fence_ft
                                  ? ` · ${Math.round(q.takeoff.measure.fence_ft).toLocaleString('en-US')} ft`
                                  : ''}
                              </small>
                              {/* Under the floor and not yet let out is a state
                                  worth a mark; released is a fact worth a name. */}
                              {under && (rel
                                ? <FenceMark kind="done" title={rel.note ?? undefined}>
                                    Released {rel.released_at?.slice(0, 10)}</FenceMark>
                                : <FenceMark kind="warn">Under the floor · not released</FenceMark>)}
                              {/* Which one they bought. Billing rolls its sheet up out of
                                  this and nothing else, and after the seal nobody can move
                                  it — so it is worth a mark rather than a note. */}
                              {q.accepted && <FenceMark kind="done">Sold</FenceMark>}
                            </span>
                            <span className="fxopt__p">{money(Number(q.price ?? 0))}</span>
                            {under && !rel && rights.mayRelease && (
                              <form className="fxopt__go" action={async (f: FormData) => {
                                'use server'
                                await releaseOption(null, f)
                              }}>
                                <input type="hidden" name="option_id" value={q.id} />
                                <button className="btn btn--amber" type="submit">Release it</button>
                              </form>
                            )}
                            {mayEdit && !q.accepted && (
                              <form className="fxopt__go" action={async (f: FormData) => {
                                'use server'
                                await acceptOption(null, f)
                              }}>
                                <input type="hidden" name="option_id" value={q.id} />
                                <button className="btn" type="submit">Mark it sold</button>
                              </form>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {mayEdit && !quotes.some((q) => q.accepted) && (
                      <p className="fxhint">
                        None marked sold. Billing rolls its sheet up out of the sold quote, and the
                        seal at handoff makes the answer permanent.
                      </p>
                    )}
                    {quotes.some((q) => q.takeoff?.below_floor && !released.get(q.id))
                      && !rights.mayRelease && (
                      <p className="note">
                        Releasing a thin quote is not the estimate&rsquo;s owner&rsquo;s to do — a
                        salesperson releasing their own is the floor releasing itself.
                      </p>
                    )}
                  </>
                )}

                {/* The quote map. Rendered on the server from the same geometry
                    that priced the job, so the picture in a customer's hand ties
                    back to the takeoff — a screenshot would carry whatever was on
                    somebody's screen and nothing that says which job it is. */}
                {s.runs.some((r) => r.drawn) && (
                  <>
                    <h3 className="fxsub">The quote map</h3>
                    <figure className="fxmap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/fence/${m.job.id}/map${quotes[0] ? `?option=${quotes[0].id}` : ''}`}
                           alt={`The measured line on ${m.job.ref}`} />
                      <figcaption>
                        <a href={`/fence/${m.job.id}/map${quotes[0] ? `?option=${quotes[0].id}` : ''}`}
                           target="_blank" rel="noreferrer">Open it full size</a>
                      </figcaption>
                    </figure>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  )
}
