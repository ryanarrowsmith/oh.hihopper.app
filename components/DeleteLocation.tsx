'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { deleteLocation } from '@/app/actions/admin'

/**
 * Removing an office.
 *
 * Behind a confirmation, in the same paper-and-rule popover the module switch
 * uses, because this is the one action on the page that cannot be undone by
 * doing it again. The popover says what will happen in the words of the thing
 * happening -- the office's own name -- rather than "are you sure", which is a
 * question nobody has ever answered thoughtfully.
 *
 * A refusal comes back and stays on the screen. The commonest one is not a
 * failure at all: people are still based here, and they have to be moved first.
 * That is an instruction, not an error, and it reads like one.
 */
export default function DeleteLocation({ id, name }: { id: string; name: string }) {
  const [ask, setAsk] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ask) return
    const off = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsk(false) }
    const out = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setAsk(false)
    }
    document.addEventListener('keydown', off)
    document.addEventListener('click', out)
    return () => {
      document.removeEventListener('keydown', off)
      document.removeEventListener('click', out)
    }
  }, [ask])

  return (
    <div className="delloc" ref={box}>
      <button className="lnk lnk--go" type="button" disabled={pending}
              onClick={(e) => { e.stopPropagation(); setErr(null); setAsk(!ask) }}>
        {pending ? 'Removing…' : 'Remove this office'}
      </button>

      {err && <p className="swhy">{err}</p>}

      {ask && (
        <div className="confpop" role="dialog" aria-label="Remove this office">
          <div className="confpop__h">Confirm</div>
          <div className="confpop__q">Remove {name}?</div>
          <p className="confpop__p">
            The office and its address go. Nothing that happened at it is touched —
            reports, notes and the ledger all stay where they are.
          </p>
          <div className="confpop__now">This cannot be undone.</div>
          <div className="confpop__acts">
            <button className="btn btn--bad" type="button" disabled={pending}
                    onClick={() => {
                      setAsk(false)
                      const f = new FormData(); f.set('id', id)
                      start(async () => {
                        // On success this redirects and never returns; a result
                        // coming back at all means it was refused.
                        const r = await deleteLocation(null, f)
                        if (r && !r.ok) setErr(r.message)
                      })
                    }}>
              Yes, remove it
            </button>
            <button className="btn" type="button" onClick={() => setAsk(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
