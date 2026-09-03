'use client'
import { useState } from 'react'

/**
 * A section you can put away.
 *
 * For a page that is long because it is thorough rather than because it is
 * badly organised: the chart builder asks four separate questions and all four
 * have to be askable, but only one of them is being answered at a time. Folding
 * the other three is what keeps the thing you are deciding ABOUT -- the preview
 * above -- on the same screen as the thing you are deciding WITH.
 *
 * Open by default, because a form that arrives closed is a form that hides what
 * it wants from you.
 */
export default function Fold({ title, note, children, open: initial = true }: {
  title: string
  /** What is in it, said once, so a folded section still tells you what it is. */
  note?: string
  children: React.ReactNode
  open?: boolean
}) {
  const [open, setOpen] = useState(initial)
  return (
    <section className={`fold${open ? ' is-open' : ''}`}>
      <button className="fold__h" type="button" aria-expanded={open}
              onClick={() => setOpen(!open)}>
        <svg className="fold__c" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <b>{title}</b>
        {note && <em>{note}</em>}
      </button>
      {open && <div className="fold__b">{children}</div>}
    </section>
  )
}
