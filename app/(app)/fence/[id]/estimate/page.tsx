import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw } from '@/lib/fence'
import { loadMeasure } from '@/lib/takeoff'
import { FenceMark } from '@/components/FenceMark'
import FenceDraw from '@/components/FenceDraw'
import FenceGates from '@/components/FenceGates'
import ActionForm from '@/components/ActionForm'
import Choice from '@/components/Choice'
import { setJobSpec } from '@/app/actions/fence'
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
  const [m, stance, { data: seals }] = await Promise.all([
    loadMeasure(session.accountId, params.id),
    fenceStance(session.accountId),
    db.schema('hopper').from('fence_seal').select('section')
      .eq('account_id', session.accountId).eq('job_id', params.id),
  ])
  if (!m.job) notFound()

  const sealed = new Set(((seals ?? []) as any[]).map((s) => s.section))
  const stand = howToDraw('estimate', stance.jobRole, sealed as Set<any>)
  const mayEdit = stand === 'edit' && !m.job.complete

  const pin: LngLat | null = m.job.lat != null && m.job.lon != null
    ? [Number(m.job.lon), Number(m.job.lat)] : null

  const specsHere = m.specs.filter((s) => s.cls === (m.job.cls ?? 'permanent'))
  const gatesHere = m.catalog.filter((g) => g.cls === (m.job.cls ?? 'permanent'))
  const have: Record<string, number> = {}
  for (const g of m.gates) if (g.type_code) have[g.type_code] = g.qty

  const s = m.sums
  const unpriced = m.gates.filter((g) => !g.priced).length

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Measure the line</h1>
        <p className="scopeline"><span>
          <Link href={`/fence/${m.job.id}`}>{m.job.ref}</Link>
          {m.job.name ? ` — ${m.job.name}` : ''}
          {m.job.customer ? ` · ${m.job.customer}` : ''}
        </span></p>
      </div>
        <div className="fxstamp">
          <FenceMark kind="warn">Preliminary</FenceMark>
          <small>
            An aerial gets you a quote. It does not get you a build — which is why the price is
            finalized at the survey, and why nobody can take this stamp off.
          </small>
        </div>
      </div>

      {stand === 'sealed' && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>This estimate is sealed.</b> It is readable and it cannot be changed — not by a
          project manager, not by an administrator. A revision supersedes it and leaves the
          original standing.
        </p>
      )}
      {stand === 'read' && !sealed.has('estimate') && (
        <p className="note" style={{ marginTop: 16 }}>
          The estimate belongs to sales. You can read every figure on it and add a note to the
          job; the line and the specification are theirs to change.
        </p>
      )}

      {/* 1 ------------------------------------------------------------------ */}
      <section className="sec fxstep1">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">1</b>Where it is</h2>
          <p>Typed once, on the job. It travels from here to the survey, the crew ticket, the
            scope of work and the service location accounting keys.</p>
        </div></div>
        <div className="fxwhere">
          <div className="fxfact">
            <b>Site address</b>
            <span>{m.job.site_address ?? <span className="fjnone">not set</span>}</span>
          </div>
          <div className="fxfact">
            <b>Aerial</b>
            <span>{pin
              ? <FenceMark kind="done">Centered on the pin</FenceMark>
              : <FenceMark kind="warn">No pin on this job</FenceMark>}</span>
          </div>
          {/* A mark carries a STATE — a word or two, in a case that shouts.
              A sentence in one runs out of its card at every width, so this is
              the sentence it always was. */}
          <div className="fxfact">
            <b>Grade</b>
            <span>Entered per run. An aerial cannot read a slope, so the survey confirms it.</span>
          </div>
        </div>
        {!pin && (
          <p className="note note--err">
            There is no map pin on this job, so there is nothing to draw on.{' '}
            <Link href={`/fence/${m.job.id}`}>The job</Link> is where the address and the pin are
            set. A parcel is found from the address; it is not guessed from the customer.
          </p>
        )}
      </section>

      {/* 2 ------------------------------------------------------------------ */}
      {pin && (
        <section className="sec">
          <div className="sec__h"><div className="sec__t">
            <h2><b className="fxn">2</b>Draw the line</h2>
            <p>Tap to drop a point, drag one to move it. Switch to <b>Move the map</b> to pan —
              one finger cannot mean two things. Every drawing control is in the strip under the
              plan.</p>
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

      {/* 3 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">3</b>What goes in</h2>
          <p>Class first, then the material. The class narrows the catalog, the gates, the labor
            task, the tools on the ticket and the charge codes — so a temporary job cannot be
            priced off a permanent spec.</p>
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
            <p className="fxhint">
              Changing the class does not clear the spec — saving a spec from another class is
              refused, with the reason, so nothing silently mismatches.
            </p>
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
            {unpriced === 1 ? 'One gate on this job has' : `${unpriced} gates on this job have`}{' '}
            no line in the rate book, so {unpriced === 1 ? 'it' : 'they'} will measure but not
            price. <Link href="/admin/fence?s=rates">The rate book</Link> is where that is fixed.
          </p>
        )}
      </section>

      {/* 4 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">4</b>What it comes to</h2>
          <p>The measure, run by run, with every deduction shown rather than folded in.</p>
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
                <span>{s.slopeFt > s.planFt ? `+${ft(s.slopeFt - s.planFt)}` : 'none'}</span>
                <small>A slope is longer than its shadow.</small></div>
              <div className="fxtally__r"><b>Gate openings</b>
                <span>{s.openingFt > 0 ? `−${ft(s.openingFt)}` : 'none'}</span>
                <small>Fence you do not build.</small></div>
              <div className="fxtally__r is-total"><b>Fence to price</b>
                <span>{ft(s.fenceFt)}</span>
                <small>{Math.round(s.fenceFt / Math.max(1, s.runs.length))} ft a run on average.</small></div>
            </div>

            <div className="fxposts">
              <div><b>{s.linePosts}</b><span>line posts</span>
                <small>at {Number(m.spec?.spacing_ft ?? 10)}′ spacing</small></div>
              <div><b>{s.terminalPosts}</b><span>terminal posts</span>
                <small>ends and gate posts</small></div>
              <div><b>{s.cornerPosts}</b><span>corner posts</span>
                <small>read off the line, at 12° or more</small></div>
              <div><b>{m.wastePct}%</b><span>waste</span>
                <small>added to fabric and rail</small></div>
            </div>

            <table className="fxtable">
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

            <p className="note">
              <b>The price is not here yet.</b> This screen measures; the money — materials from
              the rate book, labor in crew hours, the margin against the{' '}
              {m.marginFloor}% floor — is the next thing built, and the quote map with it.
            </p>
          </>
        )}
      </section>
    </>
  )
}
