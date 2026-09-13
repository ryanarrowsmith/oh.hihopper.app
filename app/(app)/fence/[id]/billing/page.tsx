import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import {
  loadJob, fenceStance, howToDraw, loadRights, type Section,
} from '@/lib/fence'
import {
  buildSheet as rollUp, mergeSheet, whatBlocks,
  whoCarriedIt, finishedOn, keyingMessage,
} from '@/lib/handoff'
import { loadBilling } from '@/lib/billing'
import { FenceMark } from '@/components/FenceMark'
import ActionForm from '@/components/ActionForm'
import HandoffMessage from '@/components/HandoffMessage'
import { RecordRow, RowForm, RowDanger, Toggle } from '@/components/RowEdit'
import { buildSheet, setChargeLine, dropChargeLine, recordHandoff } from '@/app/actions/fence'

export const dynamic = 'force-dynamic'

/**
 * The billing handoff.
 *
 * Fence Builder does not invoice. It writes accounting ONE MESSAGE laid out to be
 * keyed from, with the whole job attached — and everything on this screen is in
 * service of that one sentence, in the order the person doing it works:
 *
 *   is it releasable       the gate, said as a list of jobs to go and do
 *   what gets keyed        the five facts, in the words Navusoft uses
 *   the lines              rolled up from the sold quote, correctable by hand
 *   what to attach         the record, and what is in it
 *   the message            composed, copyable, and recorded as a separate act
 *
 * NOTHING RELEASES while a change order is unpriced or a punch item is open. The
 * gate is drawn here and asked again in the action, because a screen can be
 * stale and the only copy of that rule that counts is the one the button asks.
 *
 * THE SHEET IS A ROLL-UP, NOT A RE-PRICE. Gates that bill on their own line come
 * off the sold quote's frozen takeoff, the rest is one install line, and the
 * total has to match what the customer bought to the cent. When it does not, that
 * is the loudest thing on the page.
 */
export default async function Billing({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { id } = await params
  const loaded = await loadJob(session.accountId, id)
  if (!loaded) notFound()
  const { job, tasks, seals, place } = loaded

  const [{ jobRole }, rights, b] = await Promise.all([
    fenceStance(session.accountId),
    loadRights(session.accountId),
    loadBilling(session.accountId, id),
  ])

  const sealed = new Set<Section>(seals.map((s) => s.section))
  const stand = howToDraw('billing', jobRole, sealed, rights.mayManage)
  const mayEdit = stand === 'edit'

  const derived = b.sold
    ? rollUp({
        sold: b.sold, cls: job.cls ?? 'permanent',
        rules: b.rules, codes: b.codes, gateTypes: b.gateTypes,
      })
    : null
  const sheet = derived ? mergeSheet(derived, b.savedLines) : null
  const written = b.savedLines.length > 0

  const blocked = whatBlocks({
    sold: b.sold, place, tasks, sheet, openRevisions: b.openRevisions, jobId: id,
  })

  const { data: dir } = await supabaseServer().schema('hopper').from('directory')
    .select('id, full_name').eq('active', true)
  const names = new Map(((dir ?? []) as any[]).map((p) => [p.id, p.full_name as string]))
  const pm = whoCarriedIt(tasks, names)
  const finished = finishedOn(tasks)
  const navusoft = String(place?.navusoft_account ?? '').trim() || null

  const h = await headers()
  const origin = `https://${h.get('host') ?? 'oh.hihopper.app'}`
  const pmNote = b.notes
    .filter((n: any) => ['closeout', 'billing'].includes(n.section))
    .map((n: any) => n.body).join(' ') || null

  const message = sheet
    ? keyingMessage({
        job, place, sheet, sold: b.sold, navusoft, pm, finished,
        note: pmNote, instructions: b.target?.instructions ?? null, origin,
      })
    : null

  const money = (n: number | null | undefined) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const day = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const codeOpts = b.codes.map((c) => `${c.code} — ${c.description}`)
  const provisional = b.codes.filter((c) => c.provisional).length

  const LineFields = ({ r }: { r?: (typeof b.savedLines)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`lc-${r?.id ?? 'new'}`}>Code</label>
          <input className="field" id={`lc-${r?.id ?? 'new'}`} name="code" required
                 defaultValue={r?.code} placeholder="DEL-TF" list="fx-codes" /></div>
        <div><label htmlFor={`ld-${r?.id ?? 'new'}`}>What it bills</label>
          <input className="field" id={`ld-${r?.id ?? 'new'}`} name="description" required
                 defaultValue={r?.description} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`lq-${r?.id ?? 'new'}`}>Quantity</label>
          <input className="field" id={`lq-${r?.id ?? 'new'}`} name="qty" inputMode="decimal"
                 defaultValue={r?.qty ?? ''} /></div>
        <div><label htmlFor={`lu-${r?.id ?? 'new'}`}>Unit</label>
          <input className="field" id={`lu-${r?.id ?? 'new'}`} name="uom"
                 defaultValue={r?.uom ?? ''} placeholder="ft, ea, day" /></div>
        <div><label htmlFor={`la-${r?.id ?? 'new'}`}>Amount</label>
          <input className="field" id={`la-${r?.id ?? 'new'}`} name="amount" inputMode="decimal"
                 defaultValue={r?.amount ?? ''} /></div>
        <div><label htmlFor={`ls-${r?.id ?? 'new'}`}>Order</label>
          <input className="field" id={`ls-${r?.id ?? 'new'}`} name="sort" inputMode="numeric"
                 defaultValue={r?.sort ?? 500} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`ln-${r?.id ?? 'new'}`}>Note for whoever keys it</label>
          <input className="field" id={`ln-${r?.id ?? 'new'}`} name="note"
                 defaultValue={r?.note ?? ''} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="recurring" label="Bills again every cycle" defaultOn={r?.recurring ?? false}
                say="A rental bills every cycle; everything else bills once" />
      </div>
    </>
  )

  return (
    <>
      <datalist id="fx-codes">
        {codeOpts.map((c) => <option key={c} value={c.split(' — ')[0]}>{c}</option>)}
      </datalist>

      <div className="hi"><div className="hi__t">
        <h1>Billing handoff</h1>
        <p className="scopeline"><span>
          <Link href={`/fence/${job.id}`}>{job.ref}</Link>
          {job.name ? ` — ${job.name}` : ''}
          {job.customer ? ` · ${job.customer}` : ''}
        </span></p>
      </div>
      <div className="fjact">
        {/* The record is its own page, and printing is done there. A print button
            here would print this screen — the gate, the editors, the composer —
            which is a working surface rather than the thing that gets filed. */}
        <a className="btn" href={`/fence/${job.id}/record`} target="_blank" rel="noreferrer">
          Print the record
        </a>
      </div></div>

      <p className="fxlede">
        Fence Builder does not invoice. It writes accounting one message laid out to be keyed
        from, with the whole job attached.
      </p>

      {stand === 'read' && (
        <p className="note" style={{ marginTop: 16 }}>
          The handoff belongs to billing. You can read every figure on it and add a note to the
          job; the lines and the send are theirs.
        </p>
      )}

      {/* 1 ------------------------------------------------------------------ */}
      <section className="sec fxrel">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">1</b>Is it releasable</h2>
          <p>Nothing releases while a change order is unpriced or a punch item is open.</p>
        </div></div>

        {blocked.length === 0 ? (
          <p className="fxrel__ok">
            <FenceMark kind="done">Ready to hand over</FenceMark>
            <span>
              The work is finished, the sold quote stands, the location has an account number and
              every line can be keyed.
            </span>
          </p>
        ) : (
          <ul className="fxrel__list">
            {blocked.map((x, i) => (
              <li key={i}>
                <FenceMark kind="warn">{x.what}</FenceMark>
                <p>{x.why}</p>
                {x.where && <Link href={x.where as any}>Go and fix it</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">2</b>Key this into Navusoft</h2>
          <p>The five things the person keying it types before they reach a figure.</p>
        </div></div>
        <div className="fxkey">
          <div><span>Navusoft account</span>
            <b className="fjamono">{navusoft ?? <i className="fjnone">none on file</i>}</b>
            <small>{navusoft
              ? 'Held against the address, so every job at this site bills under it'
              : 'The project manager creates it at the survey'}</small></div>
          <div><span>Service location</span>
            <b>{place
              ? [place.line1, [place.city, place.region].filter(Boolean).join(', '), place.postcode]
                  .filter(Boolean).join(', ')
              : job.site_address ?? '—'}</b>
            <small>{place ? 'A location record' : 'Typed on the job — no location record yet'}</small></div>
          <div><span>Work completed</span>
            <b>{finished ? day(finished) : <i className="fjnone">not finished</i>}</b>
            <small>The last crew or close-out step ticked</small></div>
          <div><span>Project manager</span>
            <b>{pm ?? <i className="fjnone">nobody yet</i>}</b>
            <small>Whoever picked the job up after sales</small></div>
          <div><span>Billing type</span>
            <b>{sheet?.recurring ? 'Recurring' : 'One time'}</b>
            <small>{sheet?.recurring
              ? 'A rental bills again every cycle'
              : 'Billed once on completion'}</small></div>
        </div>
      </section>

      {/* 3 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">3</b>What it bills</h2>
          <p>
            Rolled up from the quote the customer bought — the gates that bill on their own line,
            and one line for everything else. Never re-priced: the figures are the ones that were
            frozen when it was sold.
          </p>
        </div></div>

        {!b.sold ? (
          <p className="note note--err">
            <b>No quote is marked sold.</b> Sales says which option the customer bought, and the
            seal makes that permanent — so there is nothing here to roll up.{' '}
            <Link href={`/fence/${job.id}/estimate`}>The estimate</Link> is where it happens.
          </p>
        ) : !sheet ? null : (
          <>
            {!written && (
              <p className="note">
                This is what the sheet WOULD say. Nothing is written down until somebody presses
                the button below, and nothing can be sent until it is written down.
              </p>
            )}

            <table className="fxtable fxbill">
              <thead><tr>
                <th>Code</th><th>Description</th><th>Qty</th><th>Amount</th>
              </tr></thead>
              <tbody>
                {sheet.lines.map((l, i) => (
                  <tr key={l.id ?? `${l.code}-${i}`} className={l.gap ? 'is-gap' : undefined}>
                    <td className="fxcode">{l.code}</td>
                    <td>{l.description}
                      {l.gap && <small>{l.gap}</small>}
                      {l.note && <small>{l.note}</small>}
                      {l.edited && <small>Corrected by hand — a rebuild leaves it alone</small>}
                      {l.byHand && <small>Added by hand, not from the quote</small>}
                      {l.recurring && <small>Bills again every cycle</small>}</td>
                    <td className="fxnum">{l.qty == null ? '—'
                      : `${l.qty.toLocaleString('en-US')} ${l.uom ?? ''}`}</td>
                    <td className="fxnum">{l.amount == null
                      ? <FenceMark kind="warn">no amount</FenceMark>
                      : money(l.amount)}</td>
                  </tr>
                ))}
                <tr className="fxrec__tot">
                  <td colSpan={3}>Total</td>
                  <td className="fxnum">{money(sheet.total)}</td>
                </tr>
              </tbody>
            </table>

            {sheet.tallies ? (
              <p className="fxhint">
                The same as the quote, to the cent — {money(sheet.sold)} sold, {money(sheet.total)}{' '}
                billed.
              </p>
            ) : (
              <p className="note note--err">
                <b>This does not add up to what was sold.</b> The lines come to{' '}
                {money(sheet.total)} and the customer bought {money(sheet.sold)}. One of the two is
                wrong and it is not safe to guess which. Nothing sends until they agree.
              </p>
            )}

            {provisional > 0 && (
              <p className="fxhint">
                {provisional === 1 ? 'One charge code is' : `${provisional} charge codes are`} still a
                guess. Navusoft publishes no import schema, so these were invented to have something
                to key — <Link href="/admin/fence?s=billing">the code book</Link> is where the real
                ones go.
              </p>
            )}

            {mayEdit && (
              <>
                <div className="fxquote">
                  <ActionForm action={buildSheet}
                             label={written ? 'Roll it up again' : 'Write the sheet down'}
                             busy="Rolling up…">
                    <input type="hidden" name="job_id" value={job.id} />
                    <p className="fxhint">
                      Worked out again from the sold quote on the way in. A line you corrected by
                      hand, and a line you added, are both left alone — only the derived ones are
                      replaced.
                    </p>
                  </ActionForm>
                </div>

                {written && (
                  <>
                    <h3 className="fxsub">Correct a line, or add one</h3>
                    <div className="rlist">
                      {b.savedLines.map((r) => (
                        <RecordRow key={r.id} editLabel={`Edit the ${r.code} line`} face={
                          <>
                            <span className="rcell rcell--lead">
                              <span className="fjname">{r.code}</span>
                              <span className="fjsub">{r.description}</span>
                            </span>
                            <span className="rcell">
                              <span className="rcell__lab">Amount</span>
                              <span className="rcell__val fjamono">{money(r.amount)}</span>
                            </span>
                          </>
                        }>
                          <RowForm action={setChargeLine} danger={
                            <RowDanger action={dropChargeLine} label="Take it off">
                              <input type="hidden" name="id" value={r.id ?? ''} />
                              <input type="hidden" name="job_id" value={job.id} />
                            </RowDanger>
                          }>
                            <input type="hidden" name="id" value={r.id ?? ''} />
                            <input type="hidden" name="job_id" value={job.id} />
                            <LineFields r={r} />
                          </RowForm>
                        </RecordRow>
                      ))}
                    </div>

                    <div className="fxquote">
                      <ActionForm action={setChargeLine} label="Add the line" busy="Adding…">
                        <input type="hidden" name="job_id" value={job.id} />
                        <LineFields />
                        <p className="fxhint">
                          Delivery, a tear-out, an escorted day — anything the quote did not carry
                          but the job did. A line added here never comes back off in a rebuild.
                        </p>
                      </ActionForm>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </section>

      {/* 4 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">4</b>File these to the Navusoft account</h2>
          <p>What &ldquo;with the whole job attached&rdquo; means in practice.</p>
        </div></div>
        <ul className="fxfiles">
          <li>
            <FenceMark kind="done">The record</FenceMark>
            <span>Six sections: the job, what was sold, the measure, the scope of work, the work
              as done, and what accounting keys.</span>
            <Link href={`/fence/${job.id}/record` as any} target="_blank">Open it to print or save</Link>
          </li>
          <li>
            {b.sold
              ? <FenceMark kind="done">The quote map</FenceMark>
              : <FenceMark kind="absent">No quote map</FenceMark>}
            <span>The measured line as it was frozen on the quote, with the job, the length and
              the date burned into the picture.</span>
            {b.sold && (
              <a href={`/fence/${job.id}/map?option=${b.sold.id}`} target="_blank" rel="noreferrer">
                Open it full size</a>
            )}
          </li>
          <li>
            {b.sow?.signed_at
              ? <FenceMark kind="done">Signed scope of work</FenceMark>
              : <FenceMark kind="warn">Scope of work not signed</FenceMark>}
            <span>{b.sow?.signed_at
              ? `Signed ${day(b.sow.signed_at)}, in both languages.`
              : 'A scope nobody signed is a scope nobody agreed to.'}</span>
            <Link href={`/fence/${job.id}/sow` as any}>Open it</Link>
          </li>
          <li>
            {b.photos.length > 0
              ? <FenceMark kind="done">{b.photos.length} photograph{b.photos.length === 1 ? '' : 's'}</FenceMark>
              : <FenceMark kind="warn">No photographs</FenceMark>}
            <span>{b.photos.length > 0
              ? 'Taken on the job, listed in the record.'
              : 'A finished fence nobody photographed is a dispute waiting for a memory.'}</span>
          </li>
        </ul>
      </section>

      {/* 5 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">5</b>Send it to accounting</h2>
          <p>
            {b.target
              ? `${b.target.name} is the target. Hopper lays the message out; you send it, and
                 then record that you did.`
              : `No billing target is set up, so there is nobody to send to yet.`}
          </p>
        </div></div>

        {!b.target && (
          <p className="note note--err">
            <b>Nothing to send to.</b>{' '}
            <Link href="/admin/fence?s=billing">Charge codes and billing</Link> is where the target
            and the address it goes to live.
          </p>
        )}

        {message && written ? (
          <>
            <HandoffMessage subject={message.subject} body={message.body}
                            to={b.target?.to_email ?? null} />
            {mayEdit && blocked.length === 0 && (
              <div className="fxquote">
                <ActionForm action={recordHandoff} label="Record the handoff" busy="Recording…">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="how" value="copied" />
                  <div className="formrow">
                    <div><label htmlFor="hn">Anything accounting should know</label>
                      <input className="field" id="hn" name="note"
                             placeholder="Two gates went in on the north drive, not one" /></div>
                  </div>
                  <p className="fxhint">
                    Writes down the sheet exactly as it stands, against Navusoft{' '}
                    {navusoft ?? '—'}. A second send is a second entry rather than an overwrite,
                    which is how accounting losing the first one stays visible.
                  </p>
                </ActionForm>
              </div>
            )}
            {mayEdit && blocked.length > 0 && (
              <p className="note note--err">
                <b>Not yet.</b> {blocked.length === 1 ? 'One thing' : `${blocked.length} things`} on
                the list at the top of this page still has to be true. The button appears when it is.
              </p>
            )}
          </>
        ) : (
          <p className="empty">
            {b.sold
              ? 'Write the sheet down and the message appears here, laid out to be keyed from.'
              : 'Nothing is sold yet, so there is no message to write.'}
          </p>
        )}

        {b.handoffs.length > 0 && (
          <>
            <h3 className="fxsub">What has gone out</h3>
            <ul className="fxopts">
              {b.handoffs.map((x) => (
                <li key={x.id} className="fxopt">
                  <span className="fxopt__n">
                    <b>{day(x.sent_at)}</b>
                    <small>
                      {x.sent_by_name ? `${x.sent_by_name}` : 'Somebody'}
                      {x.navusoft_account ? ` · Navusoft ${x.navusoft_account}` : ''}
                      {x.to_email ? ` · ${x.to_email}` : ''}
                      {x.note ? ` · ${x.note}` : ''}
                    </small>
                  </span>
                  <span className="fxopt__p">
                    {money(Number(x.sheet?.total ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="fxhint">
              Append-only. A handoff cannot be edited or removed once it is recorded, because a
              record of a message you can change afterwards is a record of nothing.
            </p>
          </>
        )}
      </section>

      <p className="fjfoot">
        <Link href={`/fence/${job.id}` as any}>Back to the job</Link>
      </p>
    </>
  )
}
