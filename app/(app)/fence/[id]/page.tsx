import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import {
  loadJob, fenceStance, howToDraw, loadRights, PHASES, SECTIONS, ROLE_WORD,
  type Section,
} from '@/lib/fence'
import { FenceMark } from '@/components/FenceMark'
import FenceTasks from '@/components/FenceTasks'
import { handToPm } from '@/app/actions/fence'

export const dynamic = 'force-dynamic'

/**
 * The sections with a screen behind them, and what it is called.
 *
 * A heading that is not a link is a heading with nothing to open yet rather than
 * a dead one, which is why this is a map and not a guess at a URL.
 */
const HAS_SCREEN: Partial<Record<Section, string>> = {
  estimate: 'estimate',
  sow: 'sow',
  billing: 'billing',
}

/**
 * One job, as a project manager's plan.
 *
 * Five phases, each carrying its sections, each section marked with how it may
 * be touched: yours to edit, theirs to read and note on, or sealed. The marks
 * are the point — a padlock reads before the word does.
 *
 * Nothing here asks permission before rendering a control and then hopes. A
 * section drawn read-only is drawn read-only because the database would refuse
 * the write, and the note composer is offered on every one of them because
 * noting is what read-and-note means.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { id } = await params
  const loaded = await loadJob(session.accountId, id)
  if (!loaded) notFound()

  const { job, tasks, seals, place } = loaded
  const [{ jobRole }, rights, { data: options }] = await Promise.all([
    fenceStance(session.accountId),
    loadRights(session.accountId),
    /* The quotes, because sending the job forward has to say WHICH ONE was sold.
       After the seal nobody can — `hopper_fence_edits` checks the seal before it
       checks anything else, administrator included — so the question is asked
       here, at the last moment it can still be answered. */
    supabaseServer().schema('hopper').from('fence_option')
      .select('id, label, price, accepted')
      .eq('account_id', session.accountId).eq('job_id', id)
      .order('priced_at', { ascending: false }),
  ])
  const quotes = (options ?? []) as { id: string; label: string; price: number | null; accepted: boolean }[]
  const soldOne = quotes.find((q) => q.accepted) ?? null
  const sealed = new Set<Section>(seals.map((s) => s.section))

  const done = tasks.filter((t) => t.done).length
  const entered = SECTIONS.findIndex((s) => s.key === job.reached)

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{job.name}</h1>
        <p className="scopeline">
          <span>
            {job.ref}
            {job.customer ? ` · ${job.customer}` : ''}
            {job.site_address ? ` · ${job.site_address}` : ''}
          </span>
        </p>
      </div>
      <div className="fjact">
        <span className="fjwho">
          {jobRole ? ROLE_WORD[jobRole] : 'Reading only'}
        </span>
      </div></div>

      <section className="sec">
        <div className="fjbar" role="img"
             aria-label={`${done} of ${tasks.length} tasks done`}>
          <i style={{ width: tasks.length ? `${Math.round((done / tasks.length) * 100)}%` : '0%' }} />
        </div>
        <p className="fjprog">
          {tasks.length === 0
            ? 'No tasks on the plan yet.'
            : `${Math.round((done / tasks.length) * 100)}% · ${done} / ${tasks.length} tasks`}
        </p>
      </section>

      {PHASES.map((phase, pi) => {
        const rows = phase.sections
        const phaseTasks = tasks.filter((t) => rows.includes(t.section))
        const phaseDone = phaseTasks.filter((t) => t.done).length
        /* A job that entered at the survey never had a sales phase. Those steps
           read as NOT USED rather than sitting unfinished forever. */
        const skipped = rows.every((s) => SECTIONS.findIndex((x) => x.key === s) < entered)

        return (
          <section className="sec fjphase" key={phase.title}>
            <header className="fjphase__h">
              <h2>{phase.title}</h2>
              <span className="fjcount">
                {skipped ? 'Not used' : `${phaseDone} / ${phaseTasks.length}`}
              </span>
            </header>

            {rows.map((sec) => {
              const how = howToDraw(sec, jobRole, sealed, rights.mayManage)
              const word = SECTIONS.find((s) => s.key === sec)!
              const secTasks = phaseTasks.filter((t) => t.section === sec)
              return (
                <div className={`fjsec fjsec--${how}`} key={sec}>
                  <div className="fjsec__h">
                    {/* A section with a screen behind it says so on its own name.
                        The estimate is the first; the others follow as they are
                        built, and a heading that is not a link is a heading with
                        nothing to open yet rather than a dead one. */}
                    <h3>{HAS_SCREEN[sec]
                      ? <a className="fjsec__go" href={`/fence/${job.id}/${HAS_SCREEN[sec]}`}>
                          {word.en}</a>
                      : word.en}</h3>
                    {how === 'sealed' && (
                      <FenceMark kind="sealed" title="Sealed at handoff — a revision supersedes it">
                        Sealed · read only
                      </FenceMark>
                    )}
                    {how === 'edit' && <FenceMark kind="edit">Yours · edit</FenceMark>}
                    {how === 'read' && (
                      <FenceMark kind="read" title={`${ROLE_WORD[word.owner]} owns this section`}>
                        Theirs · read and note
                      </FenceMark>
                    )}
                  </div>

                  {secTasks.length > 0 && (
                    <FenceTasks jobId={job.id} tasks={secTasks} mayEdit={how === 'edit'}
                                navusoft={place?.navusoft_account ?? null}
                                hasPlace={!!place} />
                  )}

                  {/* Sales sends it forward from the section it owns. The seal
                      and the project manager's task list are one act, so they are
                      one button. */}
                  {sec === 'estimate' && how === 'edit' && !sealed.has('estimate') && (
                    quotes.length === 0 ? (
                      <p className="fjwhy">
                        Nothing is on the quote yet, so there is nothing to hand over.{' '}
                        <a href={`/fence/${job.id}/estimate`}>Measure the line</a> first.
                      </p>
                    ) : (
                      <form className="fjhand" action={async (f: FormData) => {
                        'use server'
                        await handToPm(null, f)
                      }}>
                        <input type="hidden" name="job_id" value={job.id} />
                        <label className="fjhand__pick" htmlFor="fj-sold">
                          Which option did the customer buy?
                        </label>
                        <select className="field" id="fj-sold" name="option_id"
                                defaultValue={soldOne?.id ?? quotes[0].id}>
                          {quotes.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.label} — ${Number(q.price ?? 0).toLocaleString('en-US')}
                              {q.accepted ? ' (marked sold)' : ''}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn--amber" type="submit">
                          Send it to the project manager
                        </button>
                        <small>
                          Marks that option sold, seals the estimate — nothing changes it
                          afterwards, not even an administrator — and opens the project
                          manager&rsquo;s tasks, starting with the Navusoft account.
                        </small>
                      </form>
                    )
                  )}

                  {how === 'sealed' && (
                    <p className="fjwhy">
                      A printout of what was sold. Moving the material here would move
                      the price with nobody told — a change goes through a revision on
                      the survey, which leaves this quote in the record.
                    </p>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}

      <p className="fjfoot">
        <Link href={'/fence' as any}>Back to jobs</Link>
        {' · '}
        <a href={`/fence/${job.id}/record`} target="_blank" rel="noreferrer">
          The whole job, as a document
        </a>
      </p>
    </>
  )
}
