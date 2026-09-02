'use client'
import { useFormState, useFormStatus } from 'react-dom'
import type { Result } from '@/app/actions/admin'

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
  return (
    <form action={run} className={className}>
      {children}
      {/* The result is stated in the form that caused it, not in a toast that
          has floated away by the time anyone reads it. */}
      {state && <p className={state.ok ? 'note note--ok' : 'note note--err'}>{state.message}</p>}
      <div className="formgrid__go"><Submit label={label} busy={busy} /></div>
    </form>
  )
}
