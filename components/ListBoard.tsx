'use client'
import { useEffect, useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import Choice from '@/components/Choice'
import CrumbTail from '@/components/CrumbTail'
import Log from '@/components/Log'
import { WORD } from '@/components/ListBits'
import { AddTaskInline, Tasks, Go, I, day, type Person } from '@/components/TaskRows'
import type { ListHead, Task, LogEntry, LStatus } from '@/lib/todo'
import { setListDate, setListStatus } from '@/app/actions/todo'

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
export default function ListBoard({ list, tasks, every, log, taskName, people,
                                    mayEdit, mePersonId }: {
  list: ListHead; tasks: Task[]; every: { id: string; name: string }[]
  log: LogEntry[]; taskName: Map<string, string>
  people: Person[]; mayEdit: boolean; mePersonId: string | null
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

          </div>
          <div className="tdcard__body">
            {tasks.length > 0 && (
              <Tasks rows={tasks} every={every} people={people} list={list.id}
                     mayEdit={mayEdit} mePersonId={mePersonId} />
            )}
            {mayEdit
              ? <AddTaskInline list={list.id} />
              : tasks.length === 0 &&
                  <p className="pjnone pjnone--tight">Nothing on it yet.</p>}
          </div>
        </section>

        <section className="tdcard">
          <div className="tdcard__bar">
            <b>The log</b>
            <span className="tdcard__sub">
              {log.length === 0 ? 'Nothing yet'
                : `${log.length} ${log.length === 1 ? 'entry' : 'entries'}`}
            </span>
          </div>
          <div className="tdcard__body">
            {/* Everything that happened on this list, its own dates included.
                A to-do's history also shows under the to-do itself on the To Do
                screen -- there it is read under the row, so the name is not in
                the sentence; here it is, because here the entries are about
                many different things. */}
            <Log entries={log} names={taskName} />
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

