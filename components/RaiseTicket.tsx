'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import { raiseTicket } from '@/app/actions/desk'
import { PRIORITY_WORD, FACING_WORD } from '@/lib/desk'

type Q = { id: string; name: string; entity_id: string; facing: string }
type P = { id: string; full_name: string }
type K = { id: string; name: string; entity_id: string }
type C = { id: string; name: string | null; email: string }

/**
 * Raising one from inside.
 *
 * Somebody phones, or a colleague asks for something at the counter. The queue
 * is the first question because everything else follows from it -- the
 * organization, the SLA and who it goes to are all the queue's answers, so
 * asking for them again would be asking somebody to agree with a decision they
 * have already made.
 */
export default function RaiseTicket({ queues, people, kinds, contacts }: {
  queues: Q[]; people: P[]; kinds: K[]; contacts: C[]
}) {
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

  if (queues.length === 0) return null

  return (
    <span className="sec__a">
      <button className="btn btn--amber" type="button" ref={btn} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        New ticket
      </button>
      {open && (
        <div className="addpop addpop--wide" ref={pop} role="dialog" aria-label="Raise a ticket">
          <div className="addpop__h">
            <b>Raise a ticket</b>
            <button className="addpop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </div>
          <div className="addpop__body">
            <Form queues={queues} people={people} kinds={kinds} contacts={contacts}
                  onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </span>
  )
}

function Form({ queues, people, kinds, contacts, onDone }: {
  queues: Q[]; people: P[]; kinds: K[]; contacts: C[]; onDone: () => void
}) {
  const [state, action] = useFormState(raiseTicket, null)
  const [queue, setQueue] = useState(queues[0]?.id ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])

  const q = useMemo(() => queues.find((x) => x.id === queue), [queues, queue])
  // Only the types and contacts that belong to the organization behind the
  // chosen queue. A picker offering another business's ticket types is a
  // picker that saves something the database then refuses.
  const myKinds = kinds.filter((k) => !q || k.entity_id === q.entity_id)
  const facingIn = q?.facing === 'in'

  return (
    <form action={action}>
      <div className="formrow">
        <div>
          <label htmlFor="rt-q">Which queue</label>
          <Choice id="rt-q" name="queue_id" required placeholder="Choose one"
                  defaultValue={queue} onPick={setQueue}
                  options={queues.map((x) => ({
                    value: x.id, label: x.name, hint: FACING_WORD[x.facing as 'in' | 'out'],
                  }))} />
        </div>
        <div>
          <label htmlFor="rt-k">What kind</label>
          <Choice id="rt-k" name="kind_id" placeholder="Not set"
                  options={myKinds.map((k) => ({ value: k.id, label: k.name }))} />
        </div>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="rt-s">What is the matter</label>
          <input className="field" id="rt-s" name="subject" required maxLength={200}
                 placeholder="Dumpster not collected on Tuesday" autoFocus autoComplete="off" />
        </div>
      </div>

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="rt-b">What they told you</label>
          <textarea className="field" id="rt-b" name="body" rows={4}
                    placeholder="Kept as an internal note — it is not sent to anybody." />
        </div>
      </div>

      {!facingIn && (
        <div className="formrow" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="rt-rn">Who is asking</label>
            <input className="field" id="rt-rn" name="requester_name" maxLength={120}
                   placeholder="Their name" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="rt-re">Where to answer them</label>
            <input className="field" id="rt-re" name="requester_email" type="email" maxLength={200}
                   placeholder="name@example.com" autoComplete="off" />
          </div>
        </div>
      )}

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="rt-p">How urgent</label>
          <Choice id="rt-p" name="priority" defaultValue="normal"
                  options={Object.entries(PRIORITY_WORD).map(([v, l]) => ({ value: v, label: l }))} />
        </div>
        <div>
          <label htmlFor="rt-a">Who takes it</label>
          <Choice id="rt-a" name="assignee_id" placeholder="Let the queue decide"
                  options={people.map((p) => ({ value: p.id, label: p.full_name }))} />
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
      {pending ? 'Raising…' : 'Raise it'}
    </button>
  )
}
