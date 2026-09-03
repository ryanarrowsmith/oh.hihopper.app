'use client'
import { useState, useTransition } from 'react'
import { setSignIn } from '@/app/actions/access'

/**
 * Whether one person may sign in.
 *
 * It sits in the Sign-in column because that cell is the answer to "can they
 * get in", and until now it was a label about a thing nobody could change.
 * Making somebody inactive takes this with it; this switch is how you suspend
 * an account without retiring the person, and how you hand it back afterwards.
 *
 * No confirmation. ModuleToggle asks before it fires because switching a
 * module changes what everybody in an organization sees; this changes one
 * person, is undone by the same click, and says plainly what it did. A dialog
 * in front of a reversible one-person change is a dialog people learn to
 * dismiss without reading.
 *
 * Optimistic, and honest about it: the switch moves at once, and if the
 * database refuses it goes back where it was with the reason on the tip. A
 * switch that stays where you put it while the server disagrees is a lie on
 * the screen.
 */
export default function SignInToggle({ id, name, on, mine }: {
  id: string; name: string; on: boolean; mine: boolean
}) {
  const [is, setIs] = useState(on)
  const [why, setWhy] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // You cannot take your own away -- revoke_app refuses it, and a switch that
  // only ever fails is not a switch.
  if (mine) {
    return (
      <span className="sign sign--in" data-tip="You cannot take your own access away">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
             strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
        Signs in
      </span>
    )
  }

  function flip(next: boolean) {
    setWhy(null)
    setIs(next)
    const form = new FormData()
    form.set('id', id)
    form.set('allow', String(next))
    start(async () => {
      const r = await setSignIn(null, form)
      if (!r.ok) { setIs(!next); setWhy(r.message) }
    })
  }

  return (
    <span className={`signtog${why ? ' is-bad' : ''}`}
          data-tip={why ?? (is
            ? `${name.split(' ')[0]} can open Hopper. Switch off and they cannot — the account is kept.`
            : `${name.split(' ')[0]} cannot open Hopper. Switch on and they are back in.`)}>
      <span className="tog tog--sm">
        <input type="checkbox" checked={is} disabled={pending}
               aria-label={`${name} may sign in`}
               onChange={(e) => flip(e.target.checked)} />
        <span className="tog__track" /><span className="tog__knob" />
      </span>
      <b>{pending ? 'Saving…' : is ? 'Signs in' : 'Signed out'}</b>
    </span>
  )
}
