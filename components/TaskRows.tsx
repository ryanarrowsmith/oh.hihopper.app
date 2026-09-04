'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import Log from '@/components/Log'
import type { Task } from '@/lib/todo'
import {
  addNote, addTask, assignTask, attachFile, blockTask, closeTask, dateTask,
  renameTask, repeatTask, tagTask,
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
export const PLUS = '<path d="M12 5v14M5 12h14"/>'
export const CYCLE = '<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 5v6h-6"/>'
export const CLIP = '<path d="M21.4 11.1 12.3 20a5 5 0 0 1-7-7l9-8.9a3.3 3.3 0 0 1 4.7 4.7l-9 8.9a1.7 1.7 0 0 1-2.4-2.4l8.4-8.3"/>'
/* The mark that says "this one belongs to the task above it". The same elbow
   the menu uses for a child item, so the shape means the same thing twice. */
export const ELBOW = '<path d="M4 3v7h7"/><path d="M8.5 6.5 12 10l-3.5 3.5"/>'

export const day = (d: string | null) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  : null
export const today = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export type Person = { id: string; full_name: string }
export type Named = { id: string; name: string }

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

/* ─────────────────────────────────────────────────────────────── the rows */

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
        </div>
      ))}
    </div>
  )
}

/**
 * One to-do.
 *
 * A row on paper: no card, no border, no stripe. Clicking the name opens it in
 * place -- its dates and its people across the top, then everything that has
 * happened to it underneath. Ryan: "You shouldn't need to go anywhere else to
 * add or view them. If you click on them, then you can see the log with notes
 * and date changes and attachments."
 */
export function Row({ t, every, people, list, mayEdit, mePersonId }: {
  t: Task; every: Named[]; people: Person[]; list: string
  mayEdit: boolean; mePersonId: string | null
}) {
  const [done, setDone] = useState(!!t.doneAt)
  const [why, setWhy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [, go] = useTransition()
  const mine = t.assigneeId && t.assigneeId === mePersonId
  const blocked = !!t.blockedBy && !done
  // Ticking is doing your job; dating and assigning is running the list. So the
  // box is live for the person it is on, whether or not they run anything.
  const canTick = (mayEdit || mine) && !blocked
  const late = !done && t.dueOn && t.dueOn < today()
  const sub = !!t.parentId

  return (
    <>
      <div className={`td${sub ? ' td--sub' : ''}${done ? ' td--done' : ''}`
                      + `${blocked ? ' td--block' : ''}${open ? ' td--open' : ''}`}>
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

        {/* The name is the way in. A button rather than a div, so a keyboard
            reaches it and a screen reader is told it does something. */}
        <button className="td__t td__t--go" type="button" aria-expanded={open}
                onClick={() => setOpen(!open)}>{t.name}</button>

        <span className="td__m">
          {why && <span className="td__why">{why}</span>}
          {t.log.length > 0 && (
            <span className="td__n" data-tip={`${t.log.length} in its history`}>
              {t.log.filter((e) => e.file).length > 0 && I(CLIP, '2')}
              {t.log.length}
            </span>
          )}
          {blocked && !mayEdit && (
            <span className="td__hold is-set">{I(LOCK, '2')}{t.blockedByName}</span>
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

      {open && (
        <Opened t={t} every={every} people={people} list={list}
                mayEdit={mayEdit} sub={sub} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/* ─────────────────────────────────────────────────── the to-do, opened */

function Opened({ t, every, people, list, mayEdit, sub, onClose }: {
  t: Task; every: Named[]; people: Person[]; list: string
  mayEdit: boolean; sub: boolean; onClose: () => void
}) {
  const [why, setWhy] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [, go] = useTransition()

  return (
    <div className={`tdopen${sub ? ' tdopen--sub' : ''}`}>
      {mayEdit && (
        <>
          <div className="tdopen__f">
            <div>
              <label htmlFor={`nm-${t.id}`}>What it is</label>
              <Rename t={t} />
            </div>
            <div>
              <label htmlFor={`dt-${t.id}`}>Due</label>
              <DueDate t={t} />
            </div>
            <div>
              <label htmlFor={`as-${t.id}`}>Who does it</label>
              <Choice id={`as-${t.id}`} name={`as-${t.id}`} placeholder="Nobody yet"
                      defaultValue={t.assigneeId ?? ''}
                      options={[{ value: '', label: 'Nobody' },
                        ...people.map((p) => ({ value: p.id, label: p.full_name }))]}
                      onPick={(v) => go(async () => {
                        const r = await assignTask(t.id, v || null)
                        if (!r.ok) setWhy(r.message)
                      })} />
            </div>
            {!sub && (
              <div>
                <label htmlFor={`rp-${t.id}`}>Repeats</label>
                <Choice id={`rp-${t.id}`} name={`rp-${t.id}`} placeholder="Does not repeat"
                        defaultValue={t.repeat} options={REPEATS}
                        onPick={(v) => go(async () => {
                          const r = await repeatTask(t.id, v)
                          if (!r.ok) setWhy(r.message)
                        })} />
              </div>
            )}
            <div>
              <label htmlFor={`bk-${t.id}`}>Waits on</label>
              <Choice id={`bk-${t.id}`} name={`bk-${t.id}`} placeholder="Nothing" filterFrom={8}
                      defaultValue={t.blockedBy ?? ''}
                      options={[{ value: '', label: 'Nothing' },
                        ...every.filter((x) => x.id !== t.id)
                          .map((x) => ({ value: x.id, label: x.name }))]}
                      onPick={(v) => go(async () => {
                        const r = await blockTask(t.id, v || null)
                        if (!r.ok) setWhy(r.message)
                      })} />
            </div>
            <div>
              <label htmlFor={`tg-${t.id}`}>Tags</label>
              <input className="field" id={`tg-${t.id}`} defaultValue={t.tags.join(', ')}
                     maxLength={120} placeholder="Comma separated" autoComplete="off"
                     onBlur={(e) => {
                       const next = e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean)
                       if (next.join('|') === t.tags.join('|')) return
                       go(async () => {
                         const r = await tagTask(t.id, next)
                         if (!r.ok) setWhy(r.message)
                       })
                     }} />
            </div>
          </div>
          {why && <p className="swhy">{why}</p>}
        </>
      )}

      <p className="tdopen__t">Notes, changes and files</p>
      <Log entries={t.log} />

      <div className="tdopen__go">
        {mayEdit && !writing && (
          <button className="lnk lnk--add" type="button" onClick={() => setWriting(true)}>
            {I(PLUS, '2.4')}Write a note
          </button>
        )}
        {mayEdit && <Attach task={t.id} />}
        {!sub && mayEdit && <AddSub list={list} parent={t.id} />}
        <button className="lnk tdopen__x" type="button" onClick={onClose}>Close</button>
      </div>

      {writing && <WriteNote task={t.id} onDone={() => setWriting(false)} />}
    </div>
  )
}

/** The name, changed where it stands. Saved on blur, like the tags. */
function Rename({ t }: { t: Task }) {
  const [state, action] = useFormState(renameTask, null)
  const form = useRef<HTMLFormElement>(null)
  return (
    <form action={action} ref={form}>
      <input type="hidden" name="id" value={t.id} />
      <input className="field" id={`nm-${t.id}`} name="name" defaultValue={t.name}
             maxLength={240} autoComplete="off"
             onBlur={(e) => { if (e.currentTarget.value.trim() !== t.name) form.current?.requestSubmit() }}
             onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/** The date. The database logs the move and tells whoever it is on. */
function DueDate({ t }: { t: Task }) {
  const [state, action] = useFormState(dateTask, null)
  const form = useRef<HTMLFormElement>(null)
  return (
    <form action={action} ref={form}>
      <input type="hidden" name="id" value={t.id} />
      <input className="field" id={`dt-${t.id}`} name="due_on" type="date"
             defaultValue={t.dueOn ?? ''}
             onChange={() => form.current?.requestSubmit()} />
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function WriteNote({ task, onDone }: { task: string; onDone: () => void }) {
  const [state, action] = useFormState(addNote, null)
  // Closes because the save worked, never during a render. useFormState keeps
  // its last result for good; onDone is a fresh closure every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])
  return (
    <form className="tdnote" action={action}>
      <input type="hidden" name="task_id" value={task} />
      <textarea className="field" name="body" rows={2} required maxLength={4000}
                placeholder="What happened, and what it means." autoFocus />
      <div className="rowacts">
        <Go label="Save it" busy="Saving…" />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/**
 * A file.
 *
 * The input is hidden and the label is the control, because a browser's own
 * file button is the one control on the page nobody can style and every one of
 * them looks different. Choosing a file submits -- there is no second step to
 * forget.
 */
function Attach({ task }: { task: string }) {
  const [state, action] = useFormState(attachFile, null)
  const form = useRef<HTMLFormElement>(null)
  const { pending } = useFormStatus()
  return (
    <form action={action} ref={form} className="tdclip">
      <input type="hidden" name="task_id" value={task} />
      <label className="lnk lnk--add" htmlFor={`fl-${task}`}>
        {I(CLIP, '2.2')}{pending ? 'Attaching…' : 'Attach a file'}
      </label>
      <input id={`fl-${task}`} className="tdclip__in" type="file" name="file"
             onChange={() => form.current?.requestSubmit()} />
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/** A subtask, added under the task it belongs to and nowhere else. */
function AddSub({ list, parent }: { list: string; parent: string }) {
  const [state, action] = useFormState(addTask, null)
  const form = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { if (state?.ok) { setOpen(false); form.current?.reset() } }, [state])
  if (!open) {
    return (
      <button className="lnk lnk--add" type="button" onClick={() => setOpen(true)}>
        {I(PLUS, '2.4')}Add a step
      </button>
    )
  }
  return (
    <form className="tdstep" action={action} ref={form}>
      <input type="hidden" name="list_id" value={list} />
      <input type="hidden" name="parent_id" value={parent} />
      <input className="field" name="name" required maxLength={240} autoFocus
             placeholder="What is the step?" autoComplete="off" />
      <Go label="Add it" busy="Adding…" />
      <button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/**
 * Adding one, inline.
 *
 * A row shaped like the thing it makes: a dashed circle and a cursor. Type,
 * press Enter, it is on the list -- and the cursor stays where it is for the
 * next one, because nobody adds exactly one task. Ryan: "To Dos are added
 * inline. You shouldn't need to go anywhere else."
 */
export function AddTaskInline({ list }: { list: string }) {
  const [state, action] = useFormState(addTask, null)
  const form = useRef<HTMLFormElement>(null)
  const box = useRef<HTMLInputElement>(null)
  // Empty it and stay in it. Doing this during a render would clear the field
  // on every later render as well, which is the bug this codebase keeps
  // teaching.
  useEffect(() => {
    if (!state?.ok) return
    form.current?.reset()
    box.current?.focus()
  }, [state])
  return (
    <form className="tdnew" action={action} ref={form}>
      <input type="hidden" name="list_id" value={list} />
      <span className="tdnew__box" aria-hidden="true" />
      <input ref={box} name="name" required maxLength={240} autoComplete="off"
             aria-label="Add a task" placeholder="Add a task" />
      <span className="tdnew__hint" aria-hidden="true">Enter to add</span>
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
