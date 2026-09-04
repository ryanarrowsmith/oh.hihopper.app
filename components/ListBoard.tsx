'use client'
import { useEffect, useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import Choice from '@/components/Choice'
import CrumbTail from '@/components/CrumbTail'
import Log from '@/components/Log'
import { WORD } from '@/components/ListBits'
import { Tasks, Go, I, PLUS, REPEATS, day, type Person } from '@/components/TaskRows'
import type { ListHead, Task, LogEntry, LStatus } from '@/lib/todo'
import { addNote, addTask, setListDate, setListStatus } from '@/app/actions/todo'

const MAIL = '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>'
const PRINT = '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'

/**
 * One list.
 *
 * Things has almost no boxes. What separates one thing from the next is space
 * and, at most, one hairline -- never a border round everything. So there is no
 * status card, no progress bar and no rail down the side: what they carried is
 * one quiet line under the title, and the tasks start immediately.
 */
export default function ListBoard({ list, tasks, every, log, people, mayEdit, mePersonId }: {
  list: ListHead; tasks: Task[]; every: { id: string; name: string }[]
  log: LogEntry[]; people: Person[]; mayEdit: boolean; mePersonId: string | null
}) {
  const [status, setStatus] = useState<LStatus>(list.status)
  const [dating, setDating] = useState(false)
  const [, go] = useTransition()
  const [said, setSaid] = useState<string | null>(null)

  return (
    <>
      <CrumbTail>{list.name}</CrumbTail>

      <div className="pjcol">
        <div className="pj__h">
          <div className="pj__id">
            <h1>{list.name}</h1>
            <p className="pjline">
              {/* The one number worth keeping, as a ring. A bar with 0% written
                  inside it is three ways of saying nothing. */}
              <Ring done={list.done} total={list.total} status={status} />
              {mayEdit ? (
                <span className="pjstat">
                  <Choice name="status" defaultValue={status} filterFrom={99}
                          options={(['on_track', 'at_risk', 'blocked', 'complete'] as LStatus[])
                            .map((k) => ({ value: k, label: WORD[k] }))}
                          onPick={(k) => {
                            const was = status
                            setStatus(k as LStatus); setSaid(null)
                            go(async () => {
                              const r = await setListStatus(list.id, k)
                              if (!r.ok) { setStatus(was); setSaid(r.message) }
                            })
                          }} />
                </span>
              ) : <b>{WORD[status]}</b>}
              {[list.total === 0 ? 'No tasks yet' : `${list.done} of ${list.total} done`,
                list.late > 0 ? `${list.late} late` : null,
                list.blocked > 0 ? `${list.blocked} waiting` : null,
                list.entity, list.owner,
                list.dueOn ? `due ${day(list.dueOn)}` : null]
                .filter(Boolean).map((bit, i) => (
                  <span key={i}>{bit}</span>
                ))}
              {list.tags.map((g) => (
                <span className="td__tag" key={g}>{g}</span>
              ))}
              {mayEdit && (
                <span>
                  <button className="lnk" type="button" onClick={() => setDating(!dating)}>
                    {list.dueOn ? 'Move the date' : 'Give it a date'}
                  </button>
                </span>
              )}
            </p>
          </div>
          <div className="pj__go">
            {/* Email goes through the same outbox as everything else. Print is a
                print stylesheet, so the PDF is the browser's job rather than a
                library's. The words go to font-size:0 on a phone, so the tip is
                what a finger gets and the accessible name is untouched. */}
            <button className="btn" type="button" disabled title="Not built yet">
              {I(MAIL, '1.8')}Email
            </button>
            <button className="btn" type="button" data-tip="Print this page"
                    onClick={() => window.print()}>
              {I(PRINT, '1.8')}Print
            </button>
          </div>
        </div>
        {said && <p className="swhy">{said}</p>}
        {dating && <ListDate list={list} onDone={() => setDating(false)} />}
        {list.summary && <p className="hd__s">{list.summary}</p>}
        {list.blockedByName && (
          <p className="hd__s hd__s--block">
            This whole list waits on <b>{list.blockedByName}</b>.
          </p>
        )}

        {/* The same card the calendar wears: a tinted bar with the controls on
            it, and the work underneath on paper. The add button lives on the
            bar rather than up beside Print, for the same reason the calendar's
            plus does -- it belongs to the thing it adds to. */}
        <section className="tdcard">
          <div className="tdcard__bar">
            <b>Tasks</b>
            <span className="tdcard__sub">
              {list.total === 0 ? 'Nothing yet'
                : `${list.total - list.done} open of ${list.total}`}
            </span>
            {mayEdit && (
              <span className="tdcard__go">
                <AddTask list={list.id} people={people} every={every} />
              </span>
            )}
          </div>
          <div className="tdcard__body">
            {tasks.length === 0 ? (
              <p className="pjnone pjnone--tight">
                Nothing on it yet. A task is a thing one person does; a subtask is one of
                the steps inside it.
              </p>
            ) : (
              <Tasks rows={tasks} every={every} people={people} list={list.id}
                     mayEdit={mayEdit} mePersonId={mePersonId} />
            )}
          </div>
        </section>

        <section className="tdcard">
          <div className="tdcard__bar">
            <b>The log</b>
            <span className="tdcard__sub">
              {log.length === 0 ? 'Nothing yet'
                : `${log.length} ${log.length === 1 ? 'entry' : 'entries'}`}
            </span>
            <span className="tdcard__go"><AddNote list={list.id} /></span>
          </div>
          <div className="tdcard__body">
            <Log entries={log} />
          </div>
        </section>
      </div>
    </>
  )
}

/* ────────────────────────────────────────────────────────────────── the ring */

/**
 * How much is done, as a ring.
 *
 * It replaces a full-width bar that carried the same number twice -- once as a
 * width, once as "0%" printed inside it -- above a line that had already said
 * "0 of 1 tasks done". Things puts this on the title and nowhere else, at about
 * the size of a letter, and that turns out to be all the room the fact needs.
 */
const RING: Record<LStatus, string> = {
  on_track: 'var(--steel)', at_risk: 'var(--amber)',
  blocked: 'var(--bad)', complete: 'var(--good)',
}
export function Ring({ done, total, status }: { done: number; total: number; status: LStatus }) {
  const pct = total > 0 ? done / total : 0
  const C = 2 * Math.PI * 8
  return (
    <svg className="pjring" viewBox="0 0 20 20" aria-hidden="true"
         data-tip={total === 0 ? 'No tasks yet' : `${Math.round(pct * 100)}% done`}>
      <circle className="t" cx="10" cy="10" r="8" />
      <circle className="v" cx="10" cy="10" r="8" stroke={RING[status]}
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
    </svg>
  )
}

function ListDate({ list, onDone }: { list: ListHead; onDone: () => void }) {
  const [state, action] = useFormState(setListDate, null)
  // Only the result is a dependency. onDone is a fresh closure every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])
  return (
    <form className="tdedit" action={action}>
      <input type="hidden" name="id" value={list.id} />
      <div className="formrow formrow--lean">
        <div>
          <label htmlFor="ld">Due</label>
          <input className="field" id="ld" name="due_on" type="date"
                 defaultValue={list.dueOn ?? ''} autoFocus />
        </div>
      </div>
      <div className="rowacts">
        <Go label="Save it" busy="Saving…" />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
        <span className="fine">It lands in the log either way.</span>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/* ────────────────────────────────────────────────────────────── the adders */

function AddTask({ list, people, every }: {
  list: string; people: Person[]; every: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(addTask, null)
  // Closes because the save worked, never during a render. useFormState keeps
  // its last result for good, so setting state here would shut the popover on
  // the very next render, for ever.
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])
  return (
    <span className="pjaddtask">
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
              <input type="hidden" name="list_id" value={list} />
              <div className="formrow formrow--one">
                <div><label htmlFor="tk-n">What has to be done</label>
                  <input className="field" id="tk-n" name="name" required maxLength={240}
                         placeholder="Go to the dealership" autoFocus autoComplete="off" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="tk-a">Who does it</label>
                  <Choice id="tk-a" name="assignee_id" placeholder="Nobody yet"
                          options={people.map((p) => ({ value: p.id, label: p.full_name }))} /></div>
                <div><label htmlFor="tk-d">By when</label>
                  <input className="field" id="tk-d" name="due_on" type="date" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="tk-b">Waits on</label>
                  <Choice id="tk-b" name="blocked_by" placeholder="Nothing" filterFrom={8}
                          options={[{ value: '', label: 'Nothing' },
                            ...every.map((t) => ({ value: t.id, label: t.name }))]} /></div>
                <div><label htmlFor="tk-t">Tags</label>
                  <input className="field" id="tk-t" name="tags" maxLength={120}
                         placeholder="Car, Money" autoComplete="off" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="tk-r">Repeats</label>
                  {/* Needs a date to count from, which the database enforces --
                      so the hint says so before the save does. */}
                  <Choice id="tk-r" name="repeat" placeholder="Does not repeat"
                          options={REPEATS} />
                  <p className="fine">Give it a date above if it repeats.</p></div>
                <div />
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

function AddNote({ list }: { list: string }) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(addNote, null)
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])
  return (
    <>
      <button className="lnk lnk--add" type="button" onClick={() => setOpen(!open)}>
        {I(PLUS, '2.4')}Add a note
      </button>
      {open && (
        <div className="addpop" role="dialog" aria-label="Add a note">
          <div className="addpop__h"><b>Add a note</b>
            <button className="addpop__x" type="button" onClick={() => setOpen(false)}>&times;</button></div>
          <div className="addpop__body">
            <form action={action}>
              <input type="hidden" name="list_id" value={list} />
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
