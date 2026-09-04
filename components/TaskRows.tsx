'use client'
import { useEffect, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import type { Task } from '@/lib/todo'
import {
  addTask, assignTask, blockTask, closeTask, dateTask, repeatTask, tagTask,
} from '@/app/actions/todo'

export const I = (d: string, w = '1.9') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
export const LOCK = '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>'
/* pathLength="1" so the dash maths is 1 and 0 rather than a number somebody has
   to measure again every time the path changes. The stroke is drawn on by
   transitioning the offset -- which means unticking runs the same transition
   backwards and erases it, for free. */
export const TICK = '<path pathLength="1" d="M4.2 12.9c1.6 1 3.2 2.4 4.7 4.3C12 13 15.6 9.2 20 6.2"/>'
/* The mark that says "this one belongs to the task above it". The same elbow
   the menu uses for a child item, so the shape means the same thing twice. */
export const ELBOW = '<path d="M4 3v7h7"/><path d="M8.5 6.5 12 10l-3.5 3.5"/>'
export const PLUS = '<path d="M12 5v14M5 12h14"/>'
export const CAL = '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'
export const CYCLE = '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/>'

/**
 * How often a task comes back.
 *
 * A short list rather than a number field and a unit field: these are the ones
 * people actually mean, and two fields is two ways to get it half-right. The
 * key is what the database stores, read in one place in the action.
 */
export const REPEATS: { value: string; label: string }[] = [
  { value: '',   label: 'Does not repeat' },
  { value: '1d', label: 'Every day' },
  { value: '1w', label: 'Every week' },
  { value: '2w', label: 'Every 2 weeks' },
  { value: '1m', label: 'Every month' },
  { value: '3m', label: 'Every 3 months' },
  { value: '1y', label: 'Every year' },
]
export const repeatWord = (k: string) =>
  REPEATS.find((r) => r.value === k)?.label ?? `Every ${k}`

export const day = (d: string | null) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  : null
export const today = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export type Person = { id: string; full_name: string }
export type Named = { id: string; name: string }

export function Tasks({ rows, every, people, list, mayEdit, mePersonId }: {
  rows: Task[]; every: Named[]; people: Person[]; list: string
  mayEdit: boolean; mePersonId: string | null
}) {
  return (
    <div className="tds">
      {rows.map((t) => (
        <div key={t.id}>
          <Row t={t} every={every} people={people} list={list}
               mayEdit={mayEdit} mePersonId={mePersonId} />
          {t.subs.map((s) => (
            <Row key={s.id} t={s} every={every} people={people} list={list}
                 mayEdit={mayEdit} mePersonId={mePersonId} />
          ))}
          {mayEdit && <AddSub list={list} parent={t.id} />}
        </div>
      ))}
    </div>
  )
}

/**
 * One to-do.
 *
 * A row on paper: no card, no border, no stripe. The hover is what says it is a
 * thing you can act on, and it is where the controls live -- a list of twelve
 * tasks each wearing a permanent "Waits on…" dropdown is a list you cannot
 * read. A subtask is the same row, one step in, with a smaller circle: it holds
 * the same date, the same tags, the same person and the same dependency,
 * because it is a task that happens to sit under another one.
 */
export function Row({ t, every, people, list, mayEdit, mePersonId }: {
  t: Task; every: Named[]; people: Person[]; list: string
  mayEdit: boolean; mePersonId: string | null
}) {
  const [done, setDone] = useState(!!t.doneAt)
  const [why, setWhy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [, go] = useTransition()
  const mine = t.assigneeId && t.assigneeId === mePersonId
  const blocked = !!t.blockedBy && !done
  // Ticking is doing your job; dating and assigning is running the list. So the
  // box is live for the person it is on, whether or not they run anything.
  const canTick = (mayEdit || mine) && !blocked
  const late = !done && t.dueOn && t.dueOn < today()
  const sub = !!t.parentId

  if (editing) {
    return <RowEdit t={t} people={people} sub={sub} onDone={() => setEditing(false)} />
  }

  return (
    <div className={`td${sub ? ' td--sub' : ''}${done ? ' td--done' : ''}${blocked ? ' td--block' : ''}`}>
      {sub && <span className="td__el" aria-hidden="true">{I(ELBOW, '2.2')}</span>}
      <button className="td__box" type="button" disabled={!canTick}
              aria-pressed={done} aria-label={done ? `Reopen ${t.name}` : `Close ${t.name}`}
              title={blocked ? 'It waits on something else. Clear that first.'
                : canTick ? undefined : 'This one is not yours to tick.'}
              onClick={() => {
                const next = !done
                setDone(next); setWhy(null)
                go(async () => {
                  const r = await closeTask(t.id, next)
                  if (!r.ok) { setDone(!next); setWhy(r.message) }
                })
              }}>
        {I(TICK, '3.4')}
      </button>

      <span className="td__t">{t.name}</span>

      <span className="td__m">
        {why && <span className="td__why">{why}</span>}
        {mayEdit && (
          <button className="td__pen lnk" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {/* The words come from the ::before, the same as the editable one below. */}
        {blocked && !mayEdit && (
          <span className="td__hold is-set">{I(LOCK, '2')}{t.blockedByName}</span>
        )}
        {mayEdit && (
          <span className={`td__hold${t.blockedBy ? ' is-set' : ''}`}>
            {/* The padlock is the whole control on a phone, where an unset
                "Waits on…" on every row is a row you cannot read past. */}
            {I(LOCK, '2')}
            <Choice name={`blk-${t.id}`} defaultValue={t.blockedBy ?? ''} placeholder="Waits on…"
                    filterFrom={8}
                    options={[{ value: '', label: 'Nothing' },
                      ...every.filter((x) => x.id !== t.id)
                        .map((x) => ({ value: x.id, label: x.name }))]}
                    onPick={(v) => go(async () => { await blockTask(t.id, v || null) })} />
          </span>
        )}
        {t.repeat && (
          <span className="td__rep" role="img" aria-label={repeatWord(t.repeat)}
                data-tip={`${repeatWord(t.repeat)} — ticking it moves it on`}>
            {I(CYCLE, '2.2')}
          </span>
        )}
        {t.tags.map((g) => <span className="td__tag" key={g}>{g}</span>)}
        {t.initials && <span className="td__who" title={t.assignee ?? ''}>{t.initials}</span>}
        {t.dueOn && <span className={`td__due${late ? ' is-late' : ''}`}>{day(t.dueOn)}</span>}
      </span>
    </div>
  )
}

/**
 * The row becomes the form.
 *
 * In place, because a popover over a list of tasks hides the thing you are
 * changing it against -- and because a date only means something next to the
 * dates above and below it. Saving closes it and gives the read version back.
 */
function RowEdit({ t, people, sub, onDone }: {
  t: Task; people: Person[]; sub: boolean; onDone: () => void
}) {
  const [state, action] = useFormState(dateTask, null)
  const [why, setWhy] = useState<string | null>(null)
  const [, go] = useTransition()
  // Only the result is a dependency. onDone is a fresh closure on every render
  // of the list above, so listing it would run this after every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])

  return (
    <form className="tdedit" action={action}>
      <input type="hidden" name="id" value={t.id} />
      <div className="formrow formrow--lean">
        <div>
          <label htmlFor={`dt-${t.id}`}>Due</label>
          <input className="field" id={`dt-${t.id}`} name="due_on" type="date"
                 defaultValue={t.dueOn ?? ''} autoFocus />
        </div>
        <div>
          <label htmlFor={`as-${t.id}`}>Who does it</label>
          {/* Assigning saves on the pick and tells them, so it is not waiting
              on the date's Save button. */}
          <Choice id={`as-${t.id}`} name={`as-${t.id}`} placeholder="Nobody yet"
                  defaultValue={t.assigneeId ?? ''}
                  options={[{ value: '', label: 'Nobody' },
                    ...people.map((p) => ({ value: p.id, label: p.full_name }))]}
                  onPick={(v) => go(async () => { await assignTask(t.id, v || null) })} />
        </div>
        {!sub && (
          <div>
            <label htmlFor={`rp-${t.id}`}>Repeats</label>
            {/* Saves on the pick, like the assignee. The database rolls it
                forward when it is ticked; nothing here has to remember. */}
            <Choice id={`rp-${t.id}`} name={`rp-${t.id}`} placeholder="Does not repeat"
                    defaultValue={t.repeat} options={REPEATS}
                    onPick={(v) => go(async () => {
                      const r = await repeatTask(t.id, v)
                      if (!r.ok) setWhy(r.message)
                    })} />
          </div>
        )}
        <div>
          <label htmlFor={`tg-${t.id}`}>Tags</label>
          <input className="field" id={`tg-${t.id}`} defaultValue={t.tags.join(', ')}
                 maxLength={120} placeholder="Comma separated" autoComplete="off"
                 onBlur={(e) => {
                   const next = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean)
                   if (next.join('|') === t.tags.join('|')) return
                   go(async () => { await tagTask(t.id, next) })
                 }} />
        </div>
      </div>
      <div className="rowacts">
        <Go label="Save the date" busy="Saving…" />
        <button className="btn" type="button" onClick={onDone}>Done</button>
        <span className="fine">Every date change lands in the log.</span>
      </div>
      {why && <p className="swhy">{why}</p>}
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/** A subtask, added under the task it belongs to and nowhere else. */
function AddSub({ list, parent }: { list: string; parent: string }) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(addTask, null)
  // Closes because the save worked, never during a render. useFormState keeps
  // its last result for good, so setting state here would shut the popover on
  // the very next render, for ever.
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])

  if (!open) {
    return (
      <p className="tdsub">
        <button className="lnk lnk--add" type="button" onClick={() => setOpen(true)}>
          {I(PLUS, '2.4')}Add a subtask
        </button>
      </p>
    )
  }
  return (
    <form className="tdedit tdedit--sub" action={action}>
      <input type="hidden" name="list_id" value={list} />
      <input type="hidden" name="parent_id" value={parent} />
      <div className="formrow formrow--lean">
        <div>
          <label htmlFor={`sb-${parent}`}>What has to be done</label>
          <input className="field" id={`sb-${parent}`} name="name" required maxLength={240}
                 placeholder="Book the test drive" autoFocus autoComplete="off" />
        </div>
        <div>
          <label htmlFor={`sd-${parent}`}>By when</label>
          <input className="field" id={`sd-${parent}`} name="due_on" type="date" />
        </div>
      </div>
      <div className="rowacts">
        <Go label="Add it" busy="Adding…" />
        <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

export function Go({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}
