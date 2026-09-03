'use client'
import { useEffect, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import CrumbTail from '@/components/CrumbTail'
import { StatusKey, WORD, PROGRESS } from '@/components/ProjectBits'
import type { Milestone, Task, LogEntry, PStatus } from '@/lib/projects'
import {
  addMilestone, addNote, addTask, blockTask, closeMilestone, closeTask,
  moveMilestone, setProjectStatus,
} from '@/app/actions/projects'

const I = (d: string, w = '1.9') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const LOCK = '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>'
const TICK = '<path d="M4 12.5l5 5L20 6.5"/>'
const PLUS = '<path d="M12 5v14M5 12h14"/>'
const MAIL = '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>'
const PRINT = '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'

const day = (d: string | null) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  : null
const today = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

type Person = { id: string; full_name: string }

export default function ProjectBoard({ project, milestones, loose, log, people, mayEdit, mePersonId }: {
  project: any; milestones: Milestone[]; loose: Task[]; log: LogEntry[]
  people: Person[]; mayEdit: boolean; mePersonId: string | null
}) {
  const [status, setStatus] = useState<PStatus>(project.status)
  const [, go] = useTransition()
  const [said, setSaid] = useState<string | null>(null)

  // Everything on the board, so a task can be told to wait on another one.
  const everyTask = [...milestones.flatMap((m) => m.tasks), ...loose]

  return (
    <>
      <CrumbTail>{project.name}</CrumbTail>

      <div className="hi">
        <div className="hi__t">
          <h1>{project.name}</h1>
          <p className="scopeline"><span>
            {[project.entity, project.owner, project.startedOn ? `started ${day(project.startedOn)}` : null]
              .filter(Boolean).join(' · ')}
          </span></p>
        </div>
        <div className="hi__go">
          {/* Email goes through the same outbox as everything else. Print is a
              print stylesheet, so the PDF is the browser's job rather than a
              library's. */}
          <button className="btn" type="button" disabled title="Not built yet">
            {I(MAIL, '1.8')}Email
          </button>
          <button className="btn" type="button" onClick={() => window.print()}>
            {I(PRINT, '1.8')}Print
          </button>
          {mayEdit && <AddTask project={project.id} milestones={milestones}
                               people={people} tasks={everyTask} />}
        </div>
      </div>

      {/* Where it stands, in one line, before anything else. */}
      <div className="came pstate" style={{ marginTop: 16 }}>
        <div className="came__h">
          {mayEdit ? (
            <span className="pstate__pick">
              <StatusKey status={status} />
              <Choice name="status" defaultValue={status} filterFrom={99}
                      options={(['on_track', 'at_risk', 'blocked', 'complete'] as PStatus[])
                        .map((k) => ({ value: k, label: WORD[k] }))}
                      onPick={(k) => {
                        const was = status
                        setStatus(k as PStatus); setSaid(null)
                        go(async () => {
                          const r = await setProjectStatus(project.id, k)
                          if (!r.ok) { setStatus(was); setSaid(r.message) }
                        })
                      }} />
            </span>
          ) : <><StatusKey status={status} /><b style={{ marginLeft: 8 }}>{WORD[status]}</b></>}
          <span>
            {project.total === 0 ? 'No tasks yet'
              : `${project.done} of ${project.total} tasks done`}
            {project.next && <> · next milestone <b>{project.next.name}</b>
              {project.next.dueOn ? `, ${day(project.next.dueOn)}` : ''}</>}
            {project.blocked > 0 && <> · {project.blocked} blocked</>}
          </span>
        </div>
        <PROGRESS done={project.done} total={project.total} status={status} />
      </div>
      {said && <p className="swhy">{said}</p>}

      <section className="sec" style={{ marginTop: 22 }}>
        <div className="sec__h">
          <div className="sec__t">
            <h2>Milestones</h2>
            <p>What has to be true, by when. Every date move is kept, with the reason.</p>
          </div>
          {mayEdit && <div className="sec__a"><AddMilestone project={project.id} /></div>}
        </div>

        {milestones.length === 0 && loose.length === 0 ? (
          <p className="empty">
            Nothing yet. A milestone is what has to be TRUE by a date; a task is a thing one
            person does to make it true.
          </p>
        ) : milestones.map((m) => (
          <Mile key={m.id} m={m} people={people} tasks={everyTask}
                mayEdit={mayEdit} mePersonId={mePersonId} project={project.id} />
        ))}

        {loose.length > 0 && (
          <div className="mile mile--loose">
            <span className="mile__k" />
            <div className="mile__h"><span className="mile__t">Not under a milestone</span></div>
            <Tasks rows={loose} tasks={everyTask} mayEdit={mayEdit} mePersonId={mePersonId} />
          </div>
        )}
      </section>

      <section className="sec">
        <div className="sec__h">
          <div className="sec__t">
            <h2>The log</h2>
            <p>Every date that moved, every task that closed, and why — in the words of
              whoever did it.</p>
          </div>
          <div className="sec__a"><AddNote project={project.id} /></div>
        </div>
        {log.length === 0
          ? <p className="empty">Nothing has happened yet.</p>
          : <div className="log">
              {log.map((e) => (
                <div className="log__e" key={e.id}>
                  <p className="log__m">
                    <b>{e.author ?? 'Hopper'}</b>
                    <span>{new Date(e.at).toLocaleString('en-US',
                      { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  </p>
                  <p className="log__b">{e.body}</p>
                </div>
              ))}
            </div>}
      </section>
    </>
  )
}

/* ─────────────────────────────────────────────────────────── one milestone */

function Mile({ m, people, tasks, mayEdit, mePersonId, project }: {
  m: Milestone; people: Person[]; tasks: Task[]
  mayEdit: boolean; mePersonId: string | null; project: string
}) {
  const [moving, setMoving] = useState(false)
  const [, go] = useTransition()
  const late = !m.doneAt && m.dueOn && m.dueOn < today()
  const cls = m.doneAt ? ' mile--done' : m.blockedBy ? ' mile--block' : late ? ' mile--late' : ' mile--now'

  return (
    <div className={`mile${cls}`}>
      <span className="mile__k" />
      <div className="mile__h">
        <span className="mile__t">{m.name}</span>
        {m.dueOn && <span className="mile__d">{m.doneAt ? '' : 'due '}<b>{day(m.dueOn)}</b></span>}
        {/* Total drift, not the last hop: a date that went out ten days and came
            back three has moved seven, and seven is the number anybody arguing
            about the schedule wants. */}
        {m.moves > 0 && (
          <span className="mile__moved" data-tip={`${m.slipDays > 0 ? '+' : ''}${m.slipDays} days in total`}>
            moved {m.moves === 1 ? 'once' : m.moves === 2 ? 'twice' : `${m.moves} times`}
          </span>
        )}
        {mayEdit && (
          <span className="mile__a">
            <button className="lnk" type="button" onClick={() => setMoving(!moving)}>
              {m.dueOn ? 'Move the date' : 'Give it a date'}
            </button>
            <button className="lnk" type="button"
                    onClick={() => go(async () => { await closeMilestone(m.id, !m.doneAt) })}>
              {m.doneAt ? 'Reopen' : 'Close it'}
            </button>
          </span>
        )}
      </div>

      {m.detail && <p className="mile__s">{m.detail}</p>}
      {m.blockedByName && (
        <p className="mile__s mile__s--block">
          Waiting on <b>{m.blockedByName}</b>. Nothing under this can start until that closes.
        </p>
      )}

      {moving && <MoveDate m={m} onDone={() => setMoving(false)} />}

      {m.tasks.length > 0 && (
        <Tasks rows={m.tasks} tasks={tasks} mayEdit={mayEdit} mePersonId={mePersonId} />
      )}
    </div>
  )
}

function MoveDate({ m, onDone }: { m: Milestone; onDone: () => void }) {
  const [state, action] = useFormState(moveMilestone, null)
  // Same bug as the three adders: closing is a change to the milestone above,
  // so it happens after the render that learned the save worked, not during it.
  // Only the result is a dependency. onDone is a fresh closure on every render
  // of the milestone above, so listing it would run this after every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])
  return (
    <form className="movebox" action={action}>
      <input type="hidden" name="id" value={m.id} />
      <div className="formrow formrow--lean">
        <div>
          <label htmlFor={`mv-${m.id}`}>New date</label>
          <input className="field" id={`mv-${m.id}`} name="due_on" type="date"
                 defaultValue={m.dueOn ?? ''} required />
        </div>
        <div>
          <label htmlFor={`wy-${m.id}`}>Why it moved</label>
          <input className="field" id={`wy-${m.id}`} name="why" required maxLength={2000}
                 placeholder="The readings landed a week late." autoFocus autoComplete="off" />
        </div>
      </div>
      <div className="rowacts">
        <Go label="Move it" busy="Moving…" />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
        <span className="fine">Required, and kept forever. This is the only moment anybody
          knows why.</span>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/* ─────────────────────────────────────────────────────────────── the tasks */

function Tasks({ rows, tasks, mayEdit, mePersonId }: {
  rows: Task[]; tasks: Task[]; mayEdit: boolean; mePersonId: string | null
}) {
  return (
    <div className="tks">
      {rows.map((t) => (
        <Row key={t.id} t={t} tasks={tasks} mayEdit={mayEdit} mePersonId={mePersonId} />
      ))}
    </div>
  )
}

function Row({ t, tasks, mayEdit, mePersonId }: {
  t: Task; tasks: Task[]; mayEdit: boolean; mePersonId: string | null
}) {
  const [done, setDone] = useState(!!t.doneAt)
  const [why, setWhy] = useState<string | null>(null)
  const [, go] = useTransition()
  const mine = t.assigneeId && t.assigneeId === mePersonId
  const blocked = !!t.blockedBy && !done
  // Ticking is doing your job; adding and moving is running the project. So the
  // box is live for the person it is on, whether or not they run anything.
  const canTick = (mayEdit || mine) && !blocked
  const late = !done && t.dueOn && t.dueOn < today()

  return (
    <div className={`tk${done ? ' tk--done' : ''}${blocked ? ' tk--block' : ''}`}>
      <button className="tkbox" type="button" disabled={!canTick}
              aria-pressed={done} aria-label={done ? `Reopen ${t.name}` : `Close ${t.name}`}
              title={blocked ? 'It is blocked. Clear what is holding it first.'
                : canTick ? undefined : 'This one is not yours to tick.'}
              onClick={() => {
                const next = !done
                setDone(next); setWhy(null)
                go(async () => {
                  const r = await closeTask(t.id, next)
                  if (!r.ok) { setDone(!next); setWhy(r.message) }
                })
              }}>
        {done && I(TICK, '3')}
      </button>

      <span className="tkt">
        {t.name}
        {blocked && <small>{I(LOCK, '2')}Blocked by <b>{t.blockedByName}</b></small>}
        {why && <small className="tkt__why">{why}</small>}
      </span>

      {t.tags.map((g) => <span className="tktag" key={g}>{g}</span>)}
      {t.initials && <span className="pwho"><span className="pav" title={t.assignee ?? ''}>{t.initials}</span></span>}
      {t.dueOn && <span className={`tkdue${late ? ' is-late' : ''}`}>{day(t.dueOn)}</span>}

      {mayEdit && (
        <span className={`tkhold${t.blockedBy ? ' tkhold--set' : ''}`}>
          <Choice name={`blk-${t.id}`} defaultValue={t.blockedBy ?? ''} placeholder="Waits on…"
                  filterFrom={8}
                  options={[{ value: '', label: 'Nothing' },
                    ...tasks.filter((x) => x.id !== t.id)
                      .map((x) => ({ value: x.id, label: x.name }))]}
                  onPick={(v) => go(async () => { await blockTask(t.id, v || null) })} />
        </span>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────── the adders */

function AddMilestone({ project }: { project: string }) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(addMilestone, null)
  // Closes because the save worked, never during a render. useFormState keeps
  // the last result for good: setting state here meant that once ONE milestone
  // had been added, every later click opened the popover and the very next
  // render shut it again. Ryan: "Milestone button doesn't work after adding
  // one."
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])
  return (
    <>
      <button className="btn btn--sm" type="button" onClick={() => setOpen(!open)}>
        {I(PLUS, '2.2')}Add a milestone
      </button>
      {open && (
        <div className="addpop" role="dialog" aria-label="New milestone">
          <div className="addpop__h"><b>New milestone</b>
            <button className="addpop__x" type="button" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="addpop__body">
            <form action={action}>
              <input type="hidden" name="project_id" value={project} />
              <div className="formrow formrow--one">
                <div><label htmlFor="ms-n">What has to be true</label>
                  <input className="field" id="ms-n" name="name" required maxLength={160}
                         placeholder="Pilot live" autoFocus autoComplete="off" /></div>
              </div>
              <div className="formrow formrow--one" style={{ marginTop: 12 }}>
                <div><label htmlFor="ms-d">In a line</label>
                  <textarea className="field" id="ms-d" name="detail" rows={2} maxLength={2000}
                            placeholder="Optional" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="ms-w">By when</label>
                  <input className="field" id="ms-w" name="due_on" type="date" /></div>
                <div />
              </div>
              <div className="rowacts"><Go label="Add it" busy="Adding…" />
                <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
              {state && !state.ok && <p className="swhy">{state.message}</p>}
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function AddTask({ project, milestones, people, tasks }: {
  project: string; milestones: Milestone[]; people: Person[]; tasks: Task[]
}) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(addTask, null)
  // Closes because the save worked, never during a render. useFormState keeps
  // the last result for good: setting state here meant that once ONE milestone
  // had been added, every later click opened the popover and the very next
  // render shut it again. Ryan: "Milestone button doesn't work after adding
  // one."
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])
  return (
    <span className="sec__a">
      <button className="btn btn--amber" type="button" aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        {I(PLUS, '2.2')}Add a task
      </button>
      {open && (
        <div className="addpop" role="dialog" aria-label="New task">
          <div className="addpop__h"><b>New task</b>
            <button className="addpop__x" type="button" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="addpop__body">
            <form action={action}>
              <input type="hidden" name="project_id" value={project} />
              <div className="formrow formrow--one">
                <div><label htmlFor="tk-n">What has to be done</label>
                  <input className="field" id="tk-n" name="name" required maxLength={240}
                         placeholder="Load the first month of readings" autoFocus autoComplete="off" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="tk-m">Under which milestone</label>
                  <Choice id="tk-m" name="milestone_id" placeholder="None"
                          options={[{ value: '', label: 'None' },
                            ...milestones.map((m) => ({ value: m.id, label: m.name }))]} /></div>
                <div><label htmlFor="tk-a">Who does it</label>
                  <Choice id="tk-a" name="assignee_id" placeholder="Nobody yet"
                          options={people.map((p) => ({ value: p.id, label: p.full_name }))} /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="tk-d">By when</label>
                  <input className="field" id="tk-d" name="due_on" type="date" /></div>
                <div><label htmlFor="tk-b">Waits on</label>
                  <Choice id="tk-b" name="blocked_by" placeholder="Nothing" filterFrom={8}
                          options={[{ value: '', label: 'Nothing' },
                            ...tasks.map((t) => ({ value: t.id, label: t.name }))]} /></div>
              </div>
              <div className="formrow formrow--one" style={{ marginTop: 12 }}>
                <div><label htmlFor="tk-t">Tags</label>
                  <input className="field" id="tk-t" name="tags" maxLength={120}
                         placeholder="Scope, Comms — separated by commas" autoComplete="off" /></div>
              </div>
              <div className="rowacts"><Go label="Add it" busy="Adding…" />
                <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
              {state && !state.ok && <p className="swhy">{state.message}</p>}
            </form>
          </div>
        </div>
      )}
    </span>
  )
}

function AddNote({ project }: { project: string }) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(addNote, null)
  // Closes because the save worked, never during a render. useFormState keeps
  // the last result for good: setting state here meant that once ONE milestone
  // had been added, every later click opened the popover and the very next
  // render shut it again. Ryan: "Milestone button doesn't work after adding
  // one."
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])
  return (
    <>
      <button className="btn btn--sm" type="button" onClick={() => setOpen(!open)}>
        {I(PLUS, '2.2')}Add a note
      </button>
      {open && (
        <div className="addpop" role="dialog" aria-label="Add a note">
          <div className="addpop__h"><b>Add a note</b>
            <button className="addpop__x" type="button" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="addpop__body">
            <form action={action}>
              <input type="hidden" name="project_id" value={project} />
              <textarea className="field" name="body" rows={3} required maxLength={4000}
                        placeholder="What happened, and what it means." autoFocus />
              <div className="rowacts"><Go label="Save it" busy="Saving…" />
                <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
              {state && !state.ok && <p className="swhy">{state.message}</p>}
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Go({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}
