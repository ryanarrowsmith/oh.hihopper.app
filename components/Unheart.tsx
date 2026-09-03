'use client'
import { useFormState, useFormStatus } from 'react-dom'
import { toggleFavorite } from '@/app/actions/admin'

/**
 * Take it back out, from the page that lists it.
 *
 * The same toggle the heart on a card uses, so there is one write and one rule
 * about whose favourite it is. Here it can only ever be removing one -- you
 * cannot be looking at this row unless it is already hearted -- so it says so
 * rather than being a toggle that happens to be on.
 */
export default function Unheart({ object, objectId }: { object: string; objectId: string }) {
  const [, action] = useFormState(toggleFavorite, null)
  return (
    <form action={action}>
      <input type="hidden" name="object" value={object} />
      <input type="hidden" name="object_id" value={objectId} />
      <input type="hidden" name="back" value="/favorites" />
      <Go />
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return (
    <button className="fav__x" type="submit" disabled={pending}
            aria-label="Take out of favorites" title="Take out of favorites">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z" />
      </svg>
    </button>
  )
}
