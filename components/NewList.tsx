'use client'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import { createList } from '@/app/actions/todo'

/**
 * Starting one, in the popover every other add in Hopper uses.
 *
 * Five questions and no more: what it is called, whose it is, who is
 * accountable, when it is meant to be done, and what to file it under. The
 * tasks come afterwards, on the list's own page, because a form that asks for
 * the whole plan before it will take a name is a form people close.
 */
export default function NewList({ orgs, people }: {
  orgs: { id: string; name: string }[]
  people: { id: string; full_name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // A Choice renders its list into <body>; clicking one is not clicking away.
      if (t.closest?.('.choicepop')) return
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [open])

  return (
    <span className="sec__a">
      <button className="btn btn--amber" type="button" ref={btn} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        New list
      </button>
      {open && (
        <div className="addpop" ref={pop} role="dialog" aria-label="New list">
          <div className="addpop__h">
            <b>New list</b>
            <button className="addpop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </div>
          <div className="addpop__body">
            <Form orgs={orgs} people={people} />
          </div>
        </div>
      )}
    </span>
  )
}

function Form({ orgs, people }: {
  orgs: { id: string; name: string }[]
  people: { id: string; full_name: string }[]
}) {
  const [state, action] = useFormState(createList, null)
  return (
    <form action={action}>
      <div className="formrow formrow--one">
        <div>
          <label htmlFor="np-name">What is it called</label>
          <input className="field" id="np-name" name="name" required maxLength={160}
                 placeholder="New Car" autoFocus autoComplete="off" />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="np-sum">In a line</label>
          <input className="field" id="np-sum" name="summary" maxLength={200}
                 placeholder="Optional" autoComplete="off" />
        </div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="np-org">Whose it is</label>
          <Choice id="np-org" name="entity_id" required placeholder="Choose one"
                  defaultValue={orgs[0]?.id ?? ''}
                  options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
        </div>
        <div>
          <label htmlFor="np-own">Who is accountable</label>
          <Choice id="np-own" name="owner_id" placeholder="You"
                  options={people.map((p) => ({ value: p.id, label: p.full_name }))} />
        </div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="np-from">Started</label>
          <input className="field" id="np-from" name="started_on" type="date" />
        </div>
        <div>
          <label htmlFor="np-to">Due</label>
          <input className="field" id="np-to" name="due_on" type="date" />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="np-tags">Tags</label>
          <input className="field" id="np-tags" name="tags" maxLength={120}
                 placeholder="Car, Personal — separated by commas" autoComplete="off" />
        </div>
      </div>
      <div className="rowacts">
        <Go />
        <button className="btn" type="reset">Clear</button>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Starting…' : 'Start it'}
    </button>
  )
}
