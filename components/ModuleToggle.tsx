'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { setModule } from '@/app/actions/admin'

/**
 * A module is live for everyone the moment it is switched, so the switch asks
 * before it does anything. The confirmation is a paper popover anchored to the
 * toggle that raised it rather than a dialog thrown into the middle of the
 * screen -- you can still see the thing you are about to change.
 */
export default function ModuleToggle({
  entityId, moduleKey, label, orgName, enabled,
}: {
  entityId: string; moduleKey: string; label: string; orgName: string; enabled: boolean
}) {
  const [on, setOn] = useState(enabled)
  const [ask, setAsk] = useState<null | boolean>(null)   // the state being proposed
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  // The drawer clips itself so it can animate to a height nobody knows in
  // advance, and that clip will happily eat this popover. Let it out for
  // exactly as long as the popover is up.
  useEffect(() => {
    const clip = box.current?.closest('.rrec__clip') as HTMLElement | null
    if (!clip) return
    clip.style.overflow = ask === null ? '' : 'visible'
    return () => { clip.style.overflow = '' }
  }, [ask])

  useEffect(() => {
    if (ask === null) return
    const off = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    const out = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) cancel()
    }
    document.addEventListener('keydown', off)
    document.addEventListener('click', out)
    return () => { document.removeEventListener('keydown', off); document.removeEventListener('click', out) }
  })

  function propose(next: boolean) { setErr(null); setOn(next); setAsk(next) }
  function cancel() { if (ask !== null) { setOn(!ask); setAsk(null) } }

  function confirm() {
    const next = ask as boolean
    setAsk(null)
    const form = new FormData()
    form.set('entity_id', entityId)
    form.set('module_key', moduleKey)
    form.set('enabled', String(next))
    start(async () => {
      const r = await setModule(null, form)
      // The database is the one that decides. If it refused, put the switch
      // back where it was rather than leaving a lie on the screen.
      if (!r.ok) { setOn(!next); setErr(r.message) }
    })
  }

  return (
    <div className="togline" ref={box}>
      <span className="tog">
        <input type="checkbox" checked={on} disabled={pending}
               aria-label={`${label} on or off`}
               onChange={(e) => propose(e.target.checked)} />
        <span className="tog__track" /><span className="tog__knob" />
      </span>
      <span className="togstate">{on ? 'On' : 'Off'}</span>
      <span className="togsay">
        {err ? <span style={{ color: 'var(--bad)', fontWeight: 700 }}>{err}</span>
             : pending ? 'Saving…'
             : on ? `${label} is running for ${orgName}.`
                  : `Nobody here sees ${label.toLowerCase()} at the moment.`}
      </span>

      {ask !== null && (
        <div className="confpop" role="dialog" aria-label="Confirm this change">
          <div className="confpop__h">Confirm</div>
          <div className="confpop__q">
            Turn {label} {ask ? 'on' : 'off'} for {orgName}?
          </div>
          <p className="confpop__p">
            {ask
              ? `Everyone who can see this organization gets ${label} from this moment.`
              : `${label} disappears for everyone here. Nothing is deleted — turn it back on and it is where you left it.`}
          </p>
          <div className="confpop__now">This takes effect immediately.</div>
          <div className="confpop__acts">
            <button className="btn btn--amber" type="button" onClick={confirm}>
              Yes, turn it {ask ? 'on' : 'off'}
            </button>
            <button className="btn" type="button" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
