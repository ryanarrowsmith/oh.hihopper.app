import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw, loadRates, loadRights } from '@/lib/fence'
import { loadMeasure, loadRecipe } from '@/lib/takeoff'
import { loadQuoteConditions } from '@/lib/survey'
import { priceJob } from '@/lib/price'
import { FenceMark } from '@/components/FenceMark'
import FenceDraw from '@/components/FenceDraw'
import FenceGates from '@/components/FenceGates'
import SurveyConditions from '@/components/SurveyConditions'
import ActionForm from '@/components/ActionForm'
import Choice from '@/components/Choice'
import QuoteLink from '@/components/QuoteLink'
import { RecordRow, RowForm } from '@/components/RowEdit'
import { setJobSpec, putOnQuote, releaseOption, acceptOption,
         sendForSignature, revokeQuoteLink, setJobContact } from '@/app/actions/fence'
import { headers } from 'next/headers'
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

/* A FIFTH OF A POINT IS NOT ZERO POINTS. Rounding to whole points had a 34.8%
   margin reading "0 points under the 35% floor", which is a screen arguing with
   itself: either it clears the floor or it does not, and a figure that says
   nothing is wrong beside a warning that says something is will be believed
   over the warning. */
const points = (n: number) => {
  const d = Math.abs(n) < 1 ? Math.round(Math.abs(n) * 10) / 10 : Math.round(Math.abs(n))
  return `${d} point${d === 1 ? '' : 's'}`
}

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

  /* What has gone out to be signed, and what came back. One live link at a
     time by construction -- issuing a new one revokes the old -- so this reads
     the newest and lets the rest be history. */
  const quote = await loadQuoteConditions(session.accountId, params.id)

  const [{ data: links }, { data: signatures }, { data: people }, h] = await Promise.all([
    db.schema('hopper').from('fence_quote_link')
      .select('id, token, option_id, issued_at, expires_on, revoked, signed_at,'
        + ' mailed_at, mailed_to')
      .eq('account_id', session.accountId).eq('job_id', params.id)
      .order('issued_at', { ascending: false }),
    db.schema('hopper').from('fence_signature')
      .select('id, option_id, signed_name, signed_title, signed_at, price')
      .eq('account_id', session.accountId).eq('job_id', params.id)
      .order('signed_at', { ascending: false }),
    /* The contact book. Account-wide and reusable: the second job for the same
       customer picks the same person off a list rather than retyping them and
       getting the address one character wrong. */
    db.schema('hopper').from('fence_contact')
      .select('id, full_name, title, email, phone, company')
      .eq('account_id', session.accountId).eq('active', true).order('full_name'),
    headers(),
  ])
  const contacts = (people ?? []) as
    { id: string; full_name: string; title: string | null; email: string | null
      phone: string | null; company: string | null }[]

  const { data: jobRow } = await db.schema('hopper').from('fence_job')
    .select('contact_id, customer').eq('account_id', session.accountId)
    .eq('id', params.id).maybeSingle()
  const forWhom = contacts.find((c) => c.id === (jobRow as any)?.contact_id) ?? null
  const allLinks = (links ?? []) as any[]
  const live = allLinks.find((l) => !l.revoked && !l.signed_at) ?? null
  const signed = ((signatures ?? []) as any[])[0] ?? null
  const origin = `https://${h.get('host') ?? 'oh.hihopper.app'}`

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
  // One row per gate now, so the stepper's figure is a sum rather than a read.
  const have: Record<string, number> = {}
  for (const g of m.gates) {
    if (g.type_code) have[g.type_code] = (have[g.type_code] ?? 0) + g.qty
  }

  const s = m.sums
  const unpriced = m.gates.filter((g) => !g.priced).length

  const priced = priceJob({
    takeoff: s, legs: m.legs, gates: m.gates, spec: m.spec, recipe,
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

      {/* WHO IT IS FOR. An estimate goes to a person, and the job's `customer`
          is a company typed into a box -- there was nothing on this screen that
          could be addressed. Contacts are account-wide on purpose: the second
          job for the same customer picks the same person rather than retyping
          them. Sits above the work because it is the first thing a salesperson
          settles and the last thing anybody wants to discover missing at the
          moment they press send. */}
      <div className="fxfor">
        {mayEdit ? (
          <RecordRow editLabel={forWhom ? 'Change who it is for' : 'Say who it is for'} face={
            <p className="fjplace">
              <span>{forWhom
                ? `${forWhom.full_name}${forWhom.title ? `, ${forWhom.title}` : ''}`
                : 'Nobody on the estimate yet'}</span>
              {forWhom?.email && <i>{forWhom.email}</i>}
              {forWhom?.phone && <i>{forWhom.phone}</i>}
              {forWhom?.company && <i>{forWhom.company}</i>}
            </p>
          }>
            {/* ONE FORM, AND IT SHUTS WHEN IT SAVES. Two stacked forms each with
                their own button was the mess: two ways to do one thing, both
                open, both reporting. The picker and the new-contact fields are
                one act now -- type a name and it adds them, leave it empty and
                it uses whoever is picked -- and RowForm closes the drawer on a
                save, which is the house rule everywhere else. */}
            <RowForm action={setJobContact} label="Put them on the estimate">
              <input type="hidden" name="job_id" value={params.id} />
              {contacts.length > 0 && (
                <div><label htmlFor="fc-pick">Somebody already in the book</label>
                  <select className="field" id="fc-pick" name="contact_id"
                          defaultValue={forWhom?.id ?? ''}>
                    <option value="">Pick a contact…</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}{c.company ? ` — ${c.company}` : ''}
                        {c.email ? ` · ${c.email}` : ''}
                      </option>
                    ))}
                  </select></div>
              )}

              <h4 className="fxsub2">Or somebody new</h4>
              <div className="formrow">
                <div><label htmlFor="fc-name">Name</label>
                  <input className="field" id="fc-name" name="full_name" /></div>
                <div><label htmlFor="fc-title">Title</label>
                  <input className="field" id="fc-title" name="title"
                         placeholder="Operations" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="fc-email">Email</label>
                  <input className="field" id="fc-email" name="email" type="email" /></div>
                <div><label htmlFor="fc-phone">Phone</label>
                  <input className="field" id="fc-phone" name="phone" /></div>
                <div><label htmlFor="fc-co">Company</label>
                  <input className="field" id="fc-co" name="company"
                         defaultValue={(jobRow as any)?.customer ?? ''} /></div>
              </div>
              <p className="fxhint">
                An address already in the book is the same person: typing them again corrects
                the one that is there.
              </p>
            </RowForm>
          </RecordRow>
        ) : (
          <p className="fjplace">
            <span>{forWhom
              ? `${forWhom.full_name}${forWhom.title ? `, ${forWhom.title}` : ''}`
              : 'Nobody on the estimate yet'}</span>
            {forWhom?.email && <i>{forWhom.email}</i>}
          </p>
        )}
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
            <p>Frame the property first — drag it, zoom it, then press <b>Use this view</b>.
              The picture stops moving after that, and a tap drops a point. Once the line
              is down, <b>Sides and gates</b> is where one side gets a different fence and
              the gates go where they actually hang.</p>
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
            }))}
            legs={m.legRows.map((l) => ({
              id: l.id, runId: l.run_id, sort: l.sort,
              label: l.label, specCode: l.spec_code,
            }))}
            gates={m.gates.map((g) => ({
              id: g.id, typeCode: g.type_code,
              name: g.qty > 1 ? `${g.name ?? g.type_code ?? 'Gate'} ×${g.qty}`
                : (g.name ?? g.type_code ?? 'Gate'),
              widthFt: g.width_ft, legId: g.leg_id, atPct: g.at_pct,
            }))}
            specs={specsHere.map((sp) => ({
              code: sp.code, name: sp.name_en,
              heightFt: sp.height_ft == null ? null : Number(sp.height_ft),
              spacingFt: sp.spacing_ft == null ? null : Number(sp.spacing_ft),
            }))}
            jobSpec={m.spec ? {
              code: m.spec.code, name: m.spec.name_en,
              heightFt: m.spec.height_ft == null ? null : Number(m.spec.height_ft),
              spacingFt: m.spec.spacing_ft == null ? null : Number(m.spec.spacing_ft),
            } : null} />
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

        {/* WHAT IS ALREADY STANDING THERE. Ryan, 14 Sep: yes, sales may tick an
            existing fence — it is usually visible on the aerial and the
            customer mentions it on the phone, so the FACT is knowable even when
            the footage is a guess. Only the conditions marked `at_estimate` in
            Admin appear here: nobody guesses at rock from a photograph, and a
            condition sales cannot honestly know belongs to the survey alone.
            The survey confirms all of this, in its own table, beside rather
            than over what was quoted. */}
        {quote.conditions.length > 0 && (
          <>
            <h3 className="fxsub">What is already there</h3>
            <SurveyConditions
              jobId={m.job.id} where="quote"
              conditions={quote.conditions} found={quote.quoted} mayEdit={mayEdit} />
            <p className="fxhint">
              A rough footage is fine here. The survey measures it and the difference is what
              moves the price.
            </p>
          </>
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

            {/* SIDE BY SIDE, because that is the question being asked of this
                screen. Ryan, 14 Sep: show each length as it is drawn so you can
                identify the cost per side -- and a side sometimes needs to be
                taller than the rest, which is only arguable with if each one
                carries its own figure. The run table this replaces answered a
                question nobody had: a run is the whole tracing. */}
            {priced.legs.length > 0 ? (
              <table className="fxtable fxmeasure">
                <thead><tr>
                  <th>Side</th><th>Length</th><th>To build</th><th>What goes in</th>
                  <th>Gates</th><th>Amount</th>
                </tr></thead>
                <tbody>
                  {priced.legs.map((l) => (
                    <tr key={l.legId}>
                      <td>{l.label}</td>
                      <td className="fxnum">{ft(l.planFt)}</td>
                      <td className="fxnum">{ft(l.fenceFt)}</td>
                      <td>
                        {l.specName ?? <span className="fjnone">not chosen</span>}
                        {l.overrides && <> <FenceMark kind="edit">Different</FenceMark></>}
                      </td>
                      <td>{l.gates.length
                        ? l.gates.map((g) => `${g.qty} × ${g.name}`).join(', ') : '—'}</td>
                      <td className="fxnum">{money(l.sell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
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
            )}

            {/* A total that did not come from the table above it has to say so.
                It happens when a run was typed rather than drawn: there is no
                geometry to cut into sides, so the whole job answers and the
                sides are shown for what they are worth. */}
            {priced.legs.length > 0 && !priced.byLeg && (
              <p className="note">
                <b>The amounts by side do not add to the total.</b> Part of this line was
                measured rather than drawn, so the price comes off the job as a whole.
                Drawing that run makes the two the same figure.
              </p>
            )}

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
                        ? `${points(m.marginFloor - priced.margin)} under. Needs releasing.`
                        : `${points(priced.margin - m.marginFloor)} of room.`}</small>
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
                            {mayEdit && !q.accepted && !signed && (
                              <form className="fxopt__go" action={async (f: FormData) => {
                                'use server'
                                await sendForSignature(null, f)
                              }}>
                                <input type="hidden" name="job_id" value={params.id} />
                                <input type="hidden" name="option_id" value={q.id} />
                                <button className="btn btn--amber" type="submit">
                                  {forWhom?.email ? `Send it to ${forWhom.full_name}` : 'Make a signing link'}
                                </button>
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
                    {/* Out to sign, or signed. A signature is the handoff: it marks
                        the sale, seals this section and dates the project manager's
                        plan from the day the customer agreed. */}
                    {signed ? (
                      <p className="fxsigned">
                        <FenceMark kind="done">
                          Signed {String(signed.signed_at).slice(0, 10)}
                        </FenceMark>
                        <small>
                          {signed.signed_name}
                          {signed.signed_title ? `, ${signed.signed_title}` : ''}
                          {signed.price != null
                            ? ` · ${money(Number(signed.price))}`
                            : ''}
                        </small>
                      </p>
                    ) : live ? (
                      <>
                        <h3 className="fxsub">Out to sign</h3>
                        {live.mailed_at ? (
                          <p className="fxsigned">
                            <FenceMark kind="done">
                              Emailed {String(live.mailed_at).slice(0, 10)}
                            </FenceMark>
                            <small>{live.mailed_to}</small>
                          </p>
                        ) : (
                          <p className="fxsigned">
                            <FenceMark kind="warn">Not emailed</FenceMark>
                            <small>Nobody on this job had an address, so the link is yours to
                              send</small>
                          </p>
                        )}
                        <QuoteLink url={`${origin}/e/${live.token}`} />
                        <p className="fxhint">
                          {quotes.find((q) => q.id === live.option_id)?.label ?? 'One option'}
                          , good through {live.expires_on ?? 'no date'}. Signing marks it sold,
                          seals the estimate and opens the project manager&rsquo;s list dated from
                          that day &mdash; so send the one they should be looking at.
                        </p>
                        {mayEdit && (
                          <form action={async (f: FormData) => {
                            'use server'
                            await revokeQuoteLink(null, f)
                          }}>
                            <input type="hidden" name="job_id" value={params.id} />
                            <input type="hidden" name="link_id" value={live.id} />
                            <button className="btn btn--quiet" type="submit">
                              Stop this link working
                            </button>
                          </form>
                        )}
                      </>
                    ) : mayEdit && !quotes.some((q) => q.accepted) ? (
                      <p className="fxhint">
                        None marked sold. Send one to sign and the customer settles it, or mark
                        it sold by hand if they already have.
                      </p>
                    ) : null}
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
