'use client'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import { askForHelp, callOffTask, nudgeTask } from '@/app/actions/desk'
import { openJobs, type Job } from '@/lib/desk'

type Who = { id: string; full_name: string }

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/**
 * Out with somebody.
 *
 * The panel on the ticket that says which parts of it are somebody else's
 * problem right now. Everything here is one of two acts: asking, and calling
 * it off. The WORK happens in To Do, where the person doing it already lives —
 * this is the desk's window onto it, not a second place to do it.
 */
export default function TicketJobs({ ticketId, jobs, people, mePersonId }: {
  ticketId: string; jobs: Job[]; people: Who[]; mePersonId: string | null
}) {
  const [asking, setAsking] = useState(false)
  const open = openJobs(jobs)
  const nameOf = new Map(people.map((p) => [p.id, p.full_name]))

  return (
    <div className="jobs">
      <div className="jobs__h">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m4 12.5 3.5 3.5L20 5" />
        </svg>
        <b>{open.length === 0
          ? jobs.length === 0 ? 'Nobody else is on this' : 'All done'
          : `${open.length} to-do${open.length > 1 ? 's' : ''} open`}</b>
        {jobs.length > 0 && <span className="n tnum">{jobs.length - open.length} / {jobs.length}</span>}
      </div>

      {jobs.map((j) => (
        <JobRow key={j.id} job={j} who={j.assignee_id ? nameOf.get(j.assignee_id) : null}
                mePersonId={mePersonId} />
      ))}

      {asking ? (
        <div className="jobs__ask">
          <Ask ticketId={ticketId} people={people} onDone={() => setAsking(false)} />
        </div>
      ) : (
        <button className="jobs__f" type="button" onClick={() => setAsking(true)}>
          + Ask someone {jobs.length > 0 ? 'else' : 'for help'}
        </button>
      )}
    </div>
  )
}

function JobRow({ job, who, mePersonId }: { job: Job; who: string | null | undefined; mePersonId: string | null }) {
  const [openIt, setOpenIt] = useState(false)
  const done = !!job.done_at
  return (
    <div className={`job${done ? ' job--done' : ''}`}>
      <b>{job.name}</b>
      <div className="job__m">
        <span className="dkav" data-none={who ? undefined : ''}>{who ? mark(who) : '—'}</span>
        <span>{who ?? 'Nobody'}</span>
        {done
          ? <span className="job__ok">finished {DAY.format(new Date(job.done_at!))}</span>
          : job.due_on && <span className="due">due {DAY.format(new Date(`${job.due_on}T12:00:00`))}</span>}
        {!done && (
          <button className="lnk job__more" type="button" onClick={() => setOpenIt(!openIt)}
                  aria-expanded={openIt}>
            {openIt ? 'Never mind' : 'Chase it'}
          </button>
        )}
      </div>
      {openIt && !done && <Chase job={job} onDone={() => setOpenIt(false)} />}
    </div>
  )
}

/** Two things you can do to a job you did not take on yourself. */
function Chase({ job, onDone }: { job: Job; onDone: () => void }) {
  const [nudge, nudgeAction] = useFormState(nudgeTask, null)
  const [off, offAction] = useFormState(callOffTask, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (nudge?.ok || off?.ok) onDone() }, [nudge, off])

  return (
    <div className="job__chase">
      <form action={nudgeAction}>
        <input type="hidden" name="task_id" value={job.id} />
        <textarea className="field" name="body" rows={2}
                  placeholder="Any word on this? Goes onto their to-do." />
        <div className="rowacts"><Go label="Send it" /></div>
      </form>
      <form action={offAction} className="job__off">
        <input type="hidden" name="task_id" value={job.id} />
        <input className="field" name="why" maxLength={200}
               placeholder="Why it is no longer needed" autoComplete="off" />
        <button className="btn btn--tiny" type="submit">Call it off</button>
      </form>
      {(nudge && !nudge.ok) && <p className="swhy">{nudge.message}</p>}
      {(off && !off.ok) && <p className="swhy">{off.message}</p>}
    </div>
  )
}

function Ask({ ticketId, people, onDone }: {
  ticketId: string; people: Who[]; onDone: () => void
}) {
  const [state, action] = useFormState(askForHelp, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])

  return (
    <form action={action}>
      <input type="hidden" name="ticket_id" value={ticketId} />

      <label htmlFor="ask-n">What needs doing</label>
      <input className="field" id="ask-n" name="name" required maxLength={200} autoFocus
             placeholder="Confirm route 12 ran Tuesday" autoComplete="off" />

      <label htmlFor="ask-d">What they need to know</label>
      <textarea className="field" id="ask-d" name="detail" rows={3}
                placeholder="Only this crosses over. The customer's details stay here." />

      <label htmlFor="ask-w">Who</label>
      <Choice id="ask-w" name="assignee_id" required placeholder="Choose somebody"
              options={people.map((p) => ({ value: p.id, label: p.full_name }))} />

      <label htmlFor="ask-b">By when</label>
      <input className="field" id="ask-b" name="due_on" type="date" />

      <div className="rowacts"><Go label="Ask them" /></div>
      <p className="fine">They get it in To&nbsp;Do, with a notification and an email.
      They do not need Desk.</p>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Saving…' : label}
  </button>
}

function mark(name: string) {
  const p = name.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}
