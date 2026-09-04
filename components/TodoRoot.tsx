'use client'
import { useState } from 'react'
import Link from 'next/link'
import NewList from '@/components/NewList'
import { AddTaskInline, Tasks, day, today, type Person } from '@/components/TaskRows'
import type { ListHead, Task } from '@/lib/todo'

type Group = { list: ListHead; tasks: Task[] }

/**
 * To Do.
 *
 * One container holding every list. Ryan: "One container for all Lists. To Dos
 * are added inline. You shouldn't need to go anywhere else to add or view
 * them."
 *
 * So a list is a heading with a hairline above it, not a card of its own -- a
 * card per list turned five lists into five boxes to look past on the way to
 * the work. Adding is a row shaped like a to-do at the foot of each list, and
 * everything about a to-do opens under the to-do.
 *
 * Done tasks fold away by default. They are not deleted and they are one click
 * from view, but a list that shows its finished work at full weight grows
 * heavier the more you get through, which is exactly backwards.
 */
export default function TodoRoot({ rows, orgs, people, mePersonId }: {
  rows: Group[]
  orgs: { id: string; name: string }[]
  people: Person[]
  mePersonId: string | null
}) {
  const [showDone, setShowDone] = useState(false)
  const mayAdd = orgs.length > 0

  const open = (t: Task) => !t.doneAt || showDone
  const shown = rows.map((g) => ({
    ...g,
    tasks: g.tasks
      .filter((t) => open(t) || t.subs.some(open))
      .map((t) => ({ ...t, subs: t.subs.filter(open) })),
  }))

  const all = rows.flatMap((g) => [...g.tasks, ...g.tasks.flatMap((t) => t.subs)])
  const live = all.filter((t) => !t.doneAt)
  const late = live.filter((t) => t.dueOn && t.dueOn < today()).length
  const held = live.filter((t) => t.blockedBy).length
  const mine = live.filter((t) => t.assigneeId && t.assigneeId === mePersonId).length
  const doneCount = all.length - live.length

  return (
    <div className="pjcol">
      <div className="pj__h">
        <div className="pj__id">
          <h1>To Do</h1>
          <p className="pjline">
            {[live.length === 0 ? 'Nothing open' : `${live.length} open`,
              mine > 0 ? `${mine} on you` : null,
              late > 0 ? `${late} late` : null,
              held > 0 ? `${held} waiting on something` : null]
              .filter(Boolean).map((bit, i) => <span key={i}>{bit}</span>)}
            {doneCount > 0 && (
              <span>
                <button className="lnk" type="button" onClick={() => setShowDone(!showDone)}>
                  {showDone ? 'Hide' : 'Show'} {doneCount} done
                </button>
              </span>
            )}
          </p>
        </div>
        <div className="pj__go">
          <button className="btn" type="button" data-tip="Print this page"
                  onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="8" rx="1.5" />
              <path d="M7 14h10v7H7z" />
            </svg>Print
          </button>
        </div>
      </div>

      <section className="tdcard">
        <div className="tdcard__bar">
          <b>Your lists</b>
          <span className="tdcard__sub">
            {rows.length === 0 ? 'None yet'
              : `${rows.length} ${rows.length === 1 ? 'list' : 'lists'} · ${live.length} open`}
          </span>
          {mayAdd && (
            <span className="tdcard__go">
              <NewList orgs={orgs} people={people} />
            </span>
          )}
        </div>
        <div className="tdcard__body">
          {rows.length === 0 ? (
            <p className="pjnone pjnone--tight">
              Nothing here yet. A list is a piece of work with an end; a to-do is a thing one
              person does; a step is one of the pieces inside a to-do.
            </p>
          ) : shown.map((g) => (
            <section className="lst" key={g.list.id}>
              <div className="lst__h">
                <h3>{g.list.name}</h3>
                <span className="lst__d">
                  {[g.list.entity, g.list.dueOn ? `due ${day(g.list.dueOn)}` : null,
                    g.list.total === 0 ? null
                      : `${g.list.total - g.list.done} of ${g.list.total} open`]
                    .filter(Boolean).join(' · ')}
                </span>
                {/* Its own history, printing and settings live on its page. You
                    do not need to go there to work -- only to look back at what
                    happened to the list itself. */}
                <span className="lst__a">
                  <Link className="lnk" href={`/todo/${g.list.id}` as any}>Its own page</Link>
                </span>
              </div>

              {g.tasks.length > 0 && (
                <Tasks rows={g.tasks} people={people} list={g.list.id}
                       every={[...g.tasks, ...g.tasks.flatMap((t) => t.subs)]
                         .map((t) => ({ id: t.id, name: t.name }))}
                       mayEdit={g.list.mayEdit} mePersonId={mePersonId} />
              )}
              {g.list.mayEdit
                ? <AddTaskInline list={g.list.id} />
                : g.tasks.length === 0 &&
                    <p className="pjnone pjnone--tight">Nothing open on this one.</p>}
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
