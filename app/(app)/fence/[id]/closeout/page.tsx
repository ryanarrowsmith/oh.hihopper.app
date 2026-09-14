import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { fenceStance, howToDraw, loadRights } from '@/lib/fence'
import { loadCloseout } from '@/lib/schedule'
import { FenceMark } from '@/components/FenceMark'
import ActionForm from '@/components/ActionForm'
import Choice from '@/components/Choice'
import FenceTasks from '@/components/FenceTasks'
import CloseoutRuns from '@/components/CloseoutRuns'
import { saveCloseout, closeOut } from '@/app/actions/schedule'

export const dynamic = 'force-dynamic'

/**
 * The fence is up. This is the last moment anybody who ran the job is still
 * looking at it.
 *
 * Which is why it is where the QA walk happens, where what was actually built
 * gets recorded, and where the sentence accounting will read gets written. After
 * this the job is a row on a bill.
 *
 * CLOSE-OUT IS THE PROJECT MANAGER'S, not the crew's and not billing's. Walking
 * the finished fence, the inspection and getting the customer to say they are
 * happy were never the crew's job — they are the reason a PM exists. Ryan
 * settled that on 13 Sep when close-out moved out of its own phase and in beside
 * the survey and the scope.
 */

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`
const day = (s: string | null) => (s
  ? new Date(s.length === 10 ? `${s}T00:00:00` : s)
      .toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  : null)

const HELD = [
  { value: 'held', label: 'The price is held',
    hint: 'The customer agreed on site. We bill what was signed.' },
  { value: 'credit', label: 'The customer is credited',
    hint: 'The bill comes down by what was not built.' },
]

export default async function Closeout({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [read, stance, rights, { data: seals }] = await Promise.all([
    loadCloseout(session.accountId, params.id),
    fenceStance(session.accountId),
    loadRights(session.accountId),
    db.schema('hopper').from('fence_seal').select('section')
      .eq('account_id', session.accountId).eq('job_id', params.id),
  ])

  const job: any = read.job
  if (!job) notFound()

  const sealed = new Set(((seals ?? []) as any[]).map((s) => s.section))
  const stand = howToDraw('closeout', stance.jobRole, sealed as Set<any>, rights.mayManage)
  const closed = !!read.closeout?.closed_at
  const mayEdit = stand === 'edit' && !closed && !job.complete

  const open = read.tasks.filter((t: any) => !t.done)
  const short = read.short
  const sold = read.sold
  const held = read.closeout?.price_held
  // What accounting is being told to bill. Never worked out silently: a job
  // built short of what was sold is a decision, and this screen makes it.
  const toBill = sold.price == null ? null
    : short < 0 && held === false && read.soldFt > 0
      ? Math.round(sold.price * (read.builtFt / read.soldFt))
      : sold.price

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{job.name}</h1>
        <p className="scopeline">{job.ref}{job.customer ? ` · ${job.customer}` : ''}</p>
        <p className="fjplace"><span>{job.site_address ?? 'No address yet'}</span></p>
        <p className="svwhen">
          {sold.startsOn
            ? `Built ${day(sold.startsOn)}${sold.endsOn && sold.endsOn !== sold.startsOn
                ? ` to ${day(sold.endsOn)}` : ''}${sold.crew ? ` by ${sold.crew}` : ''}`
            : 'Not booked yet'}
          {sold.price != null && ` · signed at ${money(sold.price)}`}
        </p>
      </div></div>

      <div className="svthesis">
        <b>The fence is up. This is the last moment anybody who ran the job is still looking at it.</b>
        <p>
          Which is why it is where the walk happens, where what was actually built gets
          recorded, and where the sentence accounting will read gets written. After this the
          job is a row on a bill.
        </p>
      </div>

      {stand === 'read' && (
        <p className="note" style={{ marginTop: 16 }}>
          Close-out belongs to the project manager. Everything is readable; nothing here opens.
        </p>
      )}
      {closed && (
        <p className="note" style={{ marginTop: 16 }}>
          <b>Closed out {day(read.closeout!.closed_at)}</b> and released to{' '}
          <Link href={`/fence/${job.id}/billing`}>billing</Link>.
        </p>
      )}

      {/* 1 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">1</b>Walk it</h2>
          <p>The steps are the account&rsquo;s own task plan, so this list is the same on
            every job and is changed in Admin rather than remembered.</p>
        </div></div>

        {read.tasks.length === 0 ? (
          <p className="note">
            No close-out steps are set up.{' '}
            <Link href="/admin/fence?s=plan">The task plan</Link> is where they live.
          </p>
        ) : (
          <FenceTasks jobId={job.id} mayEdit={mayEdit} navusoft={null} hasPlace
                      tasks={read.tasks.map((t: any) => ({
                        id: t.id, en: t.en, es: t.es, due_on: t.due_on,
                        done: t.done, needs: t.needs,
                      }))} />
        )}

        {/* An unticked step can carry a sentence. "Not yet" is not useful to
            whoever reads this in two weeks; "two bundles by the dumpster, Crew 2
            back Friday" is — and that sentence goes in the note at the bottom,
            which is what billing actually reads. */}
        {open.length > 0 && (
          <p className="note">
            <b>{open.length === 1 ? 'One step is' : `${open.length} steps are`} still open.</b>{' '}
            Closing anyway is allowed and records that — refusing would mean ticking a box
            somebody did not do. Say what is outstanding in the note at the bottom.
          </p>
        )}
      </section>

      {/* 2 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">2</b>What actually got built</h2>
          <p>The third and last measure. Drawn off a photograph, walked at the survey, and
            now what is standing in the ground.</p>
        </div></div>

        {read.runs.length === 0 ? (
          <p className="note">Nothing was drawn on this job, so there is no line to compare.</p>
        ) : (
          <CloseoutRuns jobId={job.id} mayEdit={mayEdit}
                        rows={read.runs.map((r) => ({
                          runId: r.id, label: r.label, drawn: r.drawn,
                          walked: r.walked, built: r.built, why: r.why,
                        }))} />
        )}

        {short < 0 && (
          <p className="note note--warn">
            <b>{ft(Math.abs(short))} less fence than the customer is being billed for.</b>{' '}
            Either the price comes down or somebody agreed to hold it. Say which below —
            billing will not decide it for you.
          </p>
        )}
        {short > 0 && (
          <p className="note">
            <b>{ft(short)} more fence than was sold.</b> Worth a sentence in the note: it is
            either a change somebody agreed to on site or a figure that wants checking.
          </p>
        )}
      </section>

      {/* 3 ------------------------------------------------------------------ */}
      {read.photos.length > 0 && (
        <section className="sec">
          <div className="sec__h"><div className="sec__t">
            <h2><b className="fxn">3</b>Photographs</h2>
            <p>Everything photographed against this job, the crew&rsquo;s own included.
            What you will wish you had when somebody disagrees in March.</p>
          </div></div>
          <ul className="cophotos">
            {read.photos.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/fence/file/${p.id}`} alt={p.caption ?? p.name} />
                <span>{p.caption ?? p.name}</span>
                <small>{p.takenBy ?? 'the office'} · {day(p.createdAt)}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">{read.photos.length > 0 ? 4 : 3}</b>The customer&rsquo;s say-so</h2>
          <p>Somebody walked it with them, or nobody did. Both are worth recording, and only
            one of them is worth billing against.</p>
        </div></div>

        {mayEdit ? (
          <ActionForm action={saveCloseout} label="Save the walk">
            <input type="hidden" name="job_id" value={job.id} />
            <div className="formrow">
              <div><label htmlFor="co-with">Who walked it with you</label>
                <input className="field" id="co-with" name="walked_with"
                       defaultValue={read.closeout?.walked_with ?? ''}
                       placeholder="Nobody, and that is an answer" /></div>
              <div><label htmlFor="co-on">On</label>
                <input className="field" id="co-on" name="walked_on" type="date"
                       defaultValue={read.closeout?.walked_on ?? ''} /></div>
            </div>
            <div><label htmlFor="co-said">What they said</label>
              <textarea className="field" id="co-said" name="they_said" rows={2}
                        defaultValue={read.closeout?.they_said ?? ''} /></div>

            {short < 0 && (
              <div><label htmlFor="co-held">The {ft(Math.abs(short))} that was not built</label>
                <Choice id="co-held" name="price_held" options={HELD}
                        placeholder="Not decided yet"
                        defaultValue={held == null ? '' : held ? 'held' : 'credit'} /></div>
            )}

            <div><label htmlFor="co-note">What accounting needs to know</label>
              <textarea className="field" id="co-note" name="note" rows={3}
                        defaultValue={read.closeout?.note ?? ''}
                        placeholder="18 ft short to save an oak, price held, agreed with Marcus on the 24th" />
              <small className="fxhint">
                Billing reads this at the top of the letter, and it is the only place the
                shape of the job survives. No quantity on any table answers the question
                somebody asks in March.
              </small></div>
          </ActionForm>
        ) : (
          <div className="fxwhere">
            <div className="fxfact"><b>Walked with</b>
              <span>{read.closeout?.walked_with ?? <span className="fjnone">nobody</span>}</span></div>
            <div className="fxfact"><b>On</b>
              <span>{day(read.closeout?.walked_on ?? null) ?? '—'}</span></div>
            <div className="fxfact"><b>They said</b>
              <span>{read.closeout?.they_said ?? '—'}</span></div>
          </div>
        )}

        {/* A signature here is optional and the record is not. Plenty of jobs
            finish with a handshake in a car park, and a screen that demands a
            signature gets one typed by the PM. */}
        <p className="fxhint">
          A signature is not asked for here. Plenty of jobs finish with a handshake in a car
          park, and a screen that demands one gets it typed by whoever is standing at the
          keyboard — which is worse than a sentence saying who was there.
        </p>
      </section>

      {/* 5 ------------------------------------------------------------------ */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2><b className="fxn">{read.photos.length > 0 ? 5 : 4}</b>Hand it over</h2>
          <p>The last thing the person who ran the job writes, and the first thing
            accounting reads.</p>
        </div></div>

        <div className="cotally">
          <div className="fxtally__r"><b>Signed at</b>
            <span>{sold.price == null ? '—' : money(sold.price)}</span>
            <small>{sold.on ? `${day(sold.on)} · ${ft(read.soldFt)}` : ft(read.soldFt)}</small></div>
          <div className="fxtally__r"><b>Built</b>
            <span>{read.anyBuilt ? ft(read.builtFt) : '—'}</span>
            <small>{short === 0 ? 'as sold'
              : `${ft(Math.abs(short))} ${short < 0 ? 'short' : 'over'}`}</small></div>
          <div className="fxtally__r is-total"><b>To bill</b>
            <span>{toBill == null ? '—' : money(toBill)}</span>
            <small>{short < 0
              ? held == null ? 'not decided yet'
                : held ? 'price held — the customer agreed on site'
                : 'credited for what was not built'
              : 'the signed price'}</small></div>
        </div>

        {read.closeout?.note && (
          <p className="conote">{read.closeout.note}</p>
        )}

        {mayEdit && (
          <div className="scbook">
            <ActionForm action={closeOut} label="Close it out and release to billing">
              <input type="hidden" name="job_id" value={job.id} />
              <p className="fxhint">
                {open.length > 0
                  ? `${open.length === 1 ? 'One step is' : `${open.length} steps are`} still `
                    + 'open on the walk. Closing anyway records that.'
                  : 'Everything on the walk is ticked.'}
              </p>
            </ActionForm>
          </div>
        )}
        {closed && (
          <p className="note">
            <FenceMark kind="done">Closed out</FenceMark>{' '}
            {day(read.closeout!.closed_at)} — it is{' '}
            <Link href={`/fence/${job.id}/billing`}>billing&rsquo;s</Link> now.
          </p>
        )}
      </section>
    </>
  )
}
