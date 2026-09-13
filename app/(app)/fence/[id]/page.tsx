import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import {
  loadJob, fenceStance, howToDraw, PHASES, SECTIONS, ROLE_WORD,
  type Section,
} from '@/lib/fence'
import { FenceMark } from '@/components/FenceMark'

export const dynamic = 'force-dynamic'

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

  const { job, tasks, seals } = loaded
  const { jobRole } = await fenceStance(session.accountId)
  const sealed = new Set<Section>(seals.map((s) => s.section))

  const done = tasks.filter((t) => t.done).length
  const entered = SECTIONS.findIndex((s) => s.key === job.entered_at)

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
              const how = howToDraw(sec, jobRole, sealed)
              const word = SECTIONS.find((s) => s.key === sec)!
              const secTasks = phaseTasks.filter((t) => t.section === sec)
              return (
                <div className={`fjsec fjsec--${how}`} key={sec}>
                  <div className="fjsec__h">
                    <h3>{word.en}</h3>
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
                    <ul className="fjtasks">
                      {secTasks.map((t) => (
                        <li key={t.id} className={t.done ? 'fjtask fjtask--done' : 'fjtask'}>
                          <span className="fjtask__box" aria-hidden="true" />
                          <span className="fjtask__t">
                            <b>{t.en}</b>
                            {t.due_on && <em>Due {t.due_on}</em>}
                          </span>
                        </li>
                      ))}
                    </ul>
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
      </p>
    </>
  )
}
