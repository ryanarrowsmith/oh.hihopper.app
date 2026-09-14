'use client'
import { useContext, useEffect } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import type { Result } from '@/app/actions/admin'
import { Drawer } from './Drawer'

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}

export default function ActionForm({
  action, children, label = 'Save', busy = 'Saving…', className = 'formgrid',
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  children: React.ReactNode; label?: string; busy?: string; className?: string
}) {
  const [state, run] = useFormState(action, null)

  /* A SAVED FORM SHUTS, AND SAYS NOTHING. Ryan's rule, system wide, said again
     on 14 Sep looking at a drawer still standing open under a green line.
     Closing IS the confirmation -- the row behind it is already showing the new
     answer -- and a sentence saying the same thing is one more thing to read
     and one more thing to dismiss. A failure still speaks, and still stays put,
     because that is the one case where the form has something you need back.
     A form NOT in a drawer has nothing to shut, so it keeps its note. */
  const drawer = useContext(Drawer)
  useEffect(() => { if (state?.ok && drawer) drawer.close() }, [state, drawer])
  const say = state && (!state.ok || !drawer)

  return (
    <form action={run} className={className}>
      {children}
      {say && <p className={state.ok ? 'note note--ok' : 'note note--err'}>{state.message}</p>}
      <div className="formgrid__go"><Submit label={label} busy={busy} /></div>
    </form>
  )
}
