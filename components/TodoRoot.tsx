'use client'
import { useState } from 'react'
import Link from 'next/link'
import NewList from '@/components/NewList'
import { Tasks, day, today, type Person } from '@/components/TaskRows'
import type { ListHead, Task } from '@/lib/todo'

type Group = { list: ListHead; tasks: Task[] }

/**
 * To Do.
 *
 * One column, one screen, everything on it. The lists are headings rather than
 * rows in a table, because a heading is a thing you read past on the way to the
 * tasks -- which is what you came for -- and a table row is a thing you have to
 * click before you see anything.
 *
 * Done tasks are folded away by default. They are not deleted and they are one
 * click from view, but a list that shows its finished work at full weight
 * grows heavier the more you get through, which is exactly backwards.
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
              .filter(Boolean).map((bit, i) => (
                <span key={i}>{bit}</span>
              ))}
            {doneCount > 0 && (
              <span>
                <button className="lnk" type="button" onClick={() => setShowDone(!showDone)}>
                  {showDone ? 'Hide' : 'Show'} {doneCount} done
                </button>
              </span>
            )}
          </p>
        </div>
        {mayAdd && (
          <div className="pj__go">
            <NewList orgs={orgs} people={people} />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="empty" style={{ marginTop: 20 }}>
          Nothing here yet. A list is a piece of work with an end; a task is a thing one
          person does; a subtask is one of the steps inside a task.
        </p>
      ) : shown.map((g) => (
        <section key={g.list.id}>
          <div className="hd">
            <h3><Link href={`/todo/${g.list.id}` as any}>{g.list.name}</Link></h3>
            <span className="hd__d">
              {[g.list.entity, g.list.dueOn ? `due ${day(g.list.dueOn)}` : null]
                .filter(Boolean).join(' · ')}
            </span>
            <span className="hd__a">
              <Link className="lnk" href={`/todo/${g.list.id}` as any}>Open the list</Link>
            </span>
          </div>
          <div className="hd__r" />
          {g.tasks.length === 0
            ? <p className="pjnone">Nothing open on this one.</p>
            : <Tasks rows={g.tasks} people={people} list={g.list.id}
                     every={[...g.tasks, ...g.tasks.flatMap((t) => t.subs)]
                       .map((t) => ({ id: t.id, name: t.name }))}
                     mayEdit={g.list.mayEdit} mePersonId={mePersonId} />}
        </section>
      ))}
    </div>
  )
}
