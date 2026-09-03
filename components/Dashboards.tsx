'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { createDashboard } from '@/app/actions/dashboards'

/**
 * The list. Yours, then the ones people have shown you.
 *
 * Two groups rather than one list with a badge, because they are two different
 * relationships: one you can rename and delete, one you can only read. A list
 * that mixes them makes you check every row for which kind it is.
 */
export type Board = {
  id: string; title: string; name: string; owner_name: string
  is_mine: boolean; shared: boolean
  card_count: number; shared_with: number
}

export default function Dashboards({ mine, theirs }: { mine: Board[]; theirs: Board[] }) {
  const [adding, setAdding] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!adding) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdding(false) }
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setAdding(false)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [adding])

  return (
    <>
      <section className="sec">
        <div className="sec__h">
          <div className="sec__t">
            <h2>Yours</h2>
            <p>A handful of reports, in the order you watch them.</p>
          </div>
          <div className="sec__a">
            <button className="btn btn--amber" type="button" ref={btn}
                    aria-expanded={adding}
                    onClick={(e) => { e.stopPropagation(); setAdding(!adding) }}>
              New dashboard
            </button>
            {adding && (
              <div className="addpop" ref={pop} role="dialog" aria-label="New dashboard">
                <div className="addpop__h">
                  <b>New dashboard</b>
                  <button className="addpop__x" type="button" aria-label="Close"
                          onClick={() => setAdding(false)}>&times;</button>
                </div>
                <div className="addpop__body">
                  <NewBoard onDone={() => setAdding(false)} />
                </div>
              </div>
            )}
          </div>
        </div>

        {mine.length === 0 ? (
          <p className="empty">
            Nothing yet. A dashboard is the few reports you check on a Monday, kept
            together so you do not have to go and find them.
          </p>
        ) : <Grid boards={mine} mine />}
      </section>

      {theirs.length > 0 && (
        <section className="sec">
          <div className="sec__h"><div className="sec__t">
            <h2>Shared with you</h2>
            <p>Somebody else&rsquo;s, shown to you. You can read it and nothing else.</p>
          </div></div>
          <Grid boards={theirs} />
        </section>
      )}
    </>
  )
}

function Grid({ boards, mine }: { boards: Board[]; mine?: boolean }) {
  return (
    <div className="bgrid">
      {boards.map((b) => (
        <Link className="bcard" key={b.id} href={`/dashboards/${b.id}`}>
          <span className="bcard__t">{mine ? b.title : b.name}</span>
          <span className="bcard__m">
            {b.card_count === 0
              ? 'Empty'
              : `${b.card_count} report${b.card_count === 1 ? '' : 's'}`}
            {mine && b.shared && b.shared_with > 0 && (
              <> · shared with {b.shared_with}</>
            )}
            {!mine && <> · {b.owner_name}</>}
          </span>
          {/* The strip is the count made visible: an empty dashboard reads as
              empty from across the room rather than by reading the word. */}
          <span className="bcard__bars" aria-hidden="true">
            {Array.from({ length: Math.min(b.card_count, 8) }).map((_, i) => <i key={i} />)}
          </span>
        </Link>
      ))}
    </div>
  )
}

function NewBoard({ onDone }: { onDone: () => void }) {
  const [state, action] = useFormState(createDashboard, null)
  useEffect(() => { if (state?.ok) onDone() }, [state, onDone])
  return (
    <form action={action}>
      <label htmlFor="d-title">What do you call it</label>
      <input className="field" id="d-title" name="title" required maxLength={80}
             placeholder="Monday morning" autoFocus />
      <p className="fine">
        It is yours. Nobody else sees it until you choose to show them.
      </p>
      <div className="rowacts">
        <Go />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add it'}
    </button>
  )
}
