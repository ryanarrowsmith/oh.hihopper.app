'use client'
import { useState, useTransition } from 'react'
import { markChecked } from '@/app/actions/wiki'
import { checkState } from '@/lib/wiki-check'

/**
 * "I have read this and it is still true."
 *
 * The only thing that makes a handbook trustworthy is somebody putting their
 * name to a date, so this is a single press and it records who.
 */
export default function CheckedButton({ id, at }: { id: string; at: string | null }) {
  const [done, setDone] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const [, go] = useTransition()
  const fresh = checkState(at) === 'ok'

  return (
    <>
      <button className={`btn${!fresh && !done ? ' btn--amber' : ''}`} type="button"
              disabled={done}
              onClick={() => go(async () => {
                const r = await markChecked(id)
                if (r.ok) setDone(true); else setWhy(r.message)
              })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5" /></svg>
        {done ? 'Checked' : 'Still right'}
      </button>
      {why && <span className="swhy">{why}</span>}
    </>
  )
}
