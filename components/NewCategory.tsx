'use client'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import { addCategory } from '@/app/actions/wiki'
import { MARKS } from '@/components/WikiBits'

const NAMES: Record<string, string> = {
  book: 'Book', shield: 'Shield', tool: 'Spanner', cart: 'Trolley',
  users: 'People', page: 'Page',
}

/** Categories in the same add-popover every other list in Hopper uses. */
export default function NewCategory() {
  const [open, setOpen] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement
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
      <button className="btn btn--sm" type="button" ref={btn} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Add a category
      </button>
      {open && (
        <div className="addpop" ref={pop} role="dialog" aria-label="Add a category">
          <div className="addpop__h">
            <b>Add a category</b>
            <button className="addpop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </div>
          <div className="addpop__body"><Form onDone={() => setOpen(false)} /></div>
        </div>
      )}
    </span>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Adding…' : 'Add it'}</button>
}

function Form({ onDone }: { onDone: () => void }) {
  const [state, action] = useFormState(addCategory, null)
  if (state?.ok) onDone()
  return (
    <form action={action}>
      <div className="formrow formrow--one">
        <div>
          <label htmlFor="nc-name">What it is called</label>
          <input className="field" id="nc-name" name="name" required maxLength={80}
                 placeholder="Safety and compliance" autoFocus autoComplete="off" />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="nc-blurb">In a line</label>
          <input className="field" id="nc-blurb" name="blurb" maxLength={140}
                 placeholder="Inspections, incident reporting, what the law wants."
                 autoComplete="off" />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="nc-mark">Its mark</label>
          <Choice id="nc-mark" name="mark" defaultValue="page" filterFrom={99}
                  options={Object.keys(MARKS).map((k) => ({ value: k, label: NAMES[k] ?? k }))} />
        </div>
      </div>
      <div className="rowacts"><Go />
        <button className="btn" type="button" onClick={onDone}>Cancel</button></div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}
