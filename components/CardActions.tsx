'use client'
import { useFormState, useFormStatus } from 'react-dom'
import type { Result } from '@/app/actions/admin'

function Bubble({ on, label }: { on: boolean; label: string }) {
  const { pending } = useFormStatus()
  return (
    <button className={`cbub${on ? ' is-on' : ''}`} type="submit"
            disabled={pending} aria-pressed={on} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z" />
      </svg>
    </button>
  )
}

/** The heart. A form, so it works without JavaScript and cannot get out of
 *  step with what the database actually holds. */
export default function FavoriteButton({
  action, object, objectId, back, on,
}: {
  action: (prev: Result | null, form: FormData) => Promise<Result>
  object: string; objectId: string; back: string; on: boolean
}) {
  const [, run] = useFormState(action, null)
  return (
    <form action={run}>
      <input type="hidden" name="object" value={object} />
      <input type="hidden" name="object_id" value={objectId} />
      <input type="hidden" name="back" value={back} />
      <Bubble on={on} label={on ? 'Remove from your favourites' : 'Add to your favourites'} />
    </form>
  )
}
