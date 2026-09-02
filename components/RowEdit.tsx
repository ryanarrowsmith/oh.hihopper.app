'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { Result } from '@/app/actions/admin'
import { Pencil, Plus } from './Icons'

/* A drawer tells whatever form is inside it how to close. The form is the only
   thing that knows whether the save worked, and the drawer is the only thing
   that can shut -- so one passes the handle to the other. */
const Drawer = createContext<{ close: () => void }>({ close: () => {} })

/** Nothing inside a shut drawer should be reachable by tab. The drawer is
 *  clipped, not removed, so the browser needs telling. */
function useInert(open: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.toggleAttribute('inert', !open) }, [open])
  return ref
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}

/**
 * The form inside a drawer. It closes itself when the save actually worked and
 * stays open, with the reason, when it did not -- which is the whole point of
 * editing in place: the row you were looking at is still under your eye.
 */
export function RowForm({
  action, children, label = 'Save', busy = 'Saving…', danger,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  children: React.ReactNode; label?: string; busy?: string
  danger?: React.ReactNode
}) {
  const { close } = useContext(Drawer)
  const [state, run] = useFormState(action, null)
  useEffect(() => { if (state?.ok) close() }, [state, close])
  return (
    <form action={run}>
      {children}
      {state && !state.ok && <p className="note note--err">{state.message}</p>}
      <div className="rowacts">
        <Submit label={label} busy={busy} />
        <button className="lnk" type="button" onClick={close}>Cancel</button>
        {danger}
      </div>
    </form>
  )
}

/** A quiet destructive action, sharing the drawer so it can close too. */
export function RowDanger({
  action, label, children,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  label: string; children: React.ReactNode
}) {
  const { close } = useContext(Drawer)
  const [state, run] = useFormState(action, null)
  useEffect(() => { if (state?.ok) close() }, [state, close])
  return (
    <form action={run} className="lnk--go" style={{ marginLeft: 'auto' }}>
      {children}
      <button className="lnk lnk--go" type="submit" style={{ marginLeft: 0 }}>{label}</button>
    </form>
  )
}

/**
 * One record in a list: the row you read, and the same row opened downward to
 * edit. The rows below slide apart rather than the page jumping, so you never
 * lose your place.
 */
export function RecordRow({
  face, children, editLabel = 'Edit',
}: { face: React.ReactNode; children: React.ReactNode; editLabel?: string }) {
  const [open, setOpen] = useState(false)
  const clip = useInert(open)
  return (
    <div className={`rrec${open ? ' is-open' : ''}`}>
      <div className="rrec__face">
        {face}
        <button className="rpen" type="button" aria-expanded={open}
                title={editLabel} aria-label={editLabel}
                onClick={() => setOpen((o) => !o)}><Pencil /></button>
      </div>
      <div className="rrec__drawer">
        <div className="rrec__clip" ref={clip}>
          <div className="rrec__form">
            <Drawer.Provider value={{ close: () => setOpen(false) }}>{children}</Drawer.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A section whose actions sit at the end of its own title. Whatever this
 * section lets you do is at the right-hand end of its heading -- one rule, so
 * no section has to invent a place to put its controls.
 *
 * `addForm` opens above the list; `editForm` opens below whatever the section
 * shows, because there the thing being edited is the card itself.
 */
export function EditableSection({
  title, blurb, actions, addForm, editForm, addLabel = 'Add', editLabel = 'Edit', children,
}: {
  title: string; blurb?: string
  actions?: React.ReactNode
  addForm?: React.ReactNode; editForm?: React.ReactNode
  addLabel?: string; editLabel?: string
  children: React.ReactNode
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const addClip = useInert(adding)
  const editClip = useInert(editing)

  return (
    <section className="sec">
      <div className="sec__h">
        <div className="sec__t">
          <h2>{title}</h2>
          {blurb && <p>{blurb}</p>}
        </div>
        {(actions || addForm || editForm) && (
          <div className="sec__a">
            {actions}
            {editForm && (
              <button className={`cbub cbub--pen${editing ? ' is-open' : ''}`} type="button"
                      aria-expanded={editing} title={editLabel} aria-label={editLabel}
                      onClick={() => setEditing((o) => !o)}><Pencil /></button>
            )}
            {addForm && (
              <button className={`cbub cbub--plus${adding ? ' is-open' : ''}`} type="button"
                      aria-expanded={adding} title={addLabel} aria-label={addLabel}
                      onClick={() => setAdding((o) => !o)}><Plus /></button>
            )}
          </div>
        )}
      </div>

      {addForm && (
        <div className={`adrawer${adding ? ' is-open' : ''}`}>
          <div className="rrec__clip" ref={addClip}>
            <div className="addbox">
              <Drawer.Provider value={{ close: () => setAdding(false) }}>{addForm}</Drawer.Provider>
            </div>
          </div>
        </div>
      )}

      {children}

      {editForm && (
        <div className={`locard__drawer${editing ? ' is-open' : ''}`}>
          <div className="rrec__clip" ref={editClip}>
            <div className="locard__editin">
              <Drawer.Provider value={{ close: () => setEditing(false) }}>{editForm}</Drawer.Provider>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
