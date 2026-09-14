'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { crewNote } from '@/app/actions/crew'

type Labels = {
  title: string; hint: string; placeholder: string
  photo: string; send: string; sending: string; sent: string
}

/**
 * The note a crew sends from the yard.
 *
 * This is the only writable thing on the ticket, and it is deliberately one
 * box: type what happened, add a photograph if there is one to add, send. A
 * crew standing in a hole is not going to fill in a form, and the office does
 * not need the note categorized — the log is a stream in the order things
 * happened, and the section is already known because it came off a ticket.
 *
 * THE CAMERA, NOT THE FILE PICKER. `capture="environment"` opens the back
 * camera straight away on a phone, which is what a photograph of a fence line
 * is. It falls back to the picker everywhere it is not understood.
 *
 * The button goes disabled the moment it is pressed. A note that saved but
 * looked like it had not is a note somebody sends twice, and both copies land.
 */
export default function CrewNote({ token, labels }: { token: string; labels: Labels }) {
  const router = useRouter()
  const pick = useRef<HTMLInputElement>(null)
  const [body, setBody] = useState('')
  const [shot, setShot] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; message: string } | null>(null)

  const go = async () => {
    if (busy || (!body.trim() && !shot)) return
    setBusy(true); setSaid(null)
    const form = new FormData()
    form.set('body', body)
    if (shot) form.set('file', shot)
    const r = await crewNote(token, form)
    setSaid(r)
    setBusy(false)
    if (r.ok) {
      setBody(''); setShot(null)
      if (pick.current) pick.current.value = ''
      router.refresh()
    }
  }

  return (
    <section className="cknote">
      <h3>{labels.title}</h3>
      <p className="ck__hint">{labels.hint}</p>

      <textarea className="cknote__box" rows={4} value={body} inputMode="text"
                placeholder={labels.placeholder}
                onChange={(e) => setBody(e.target.value)} />

      <input ref={pick} type="file" accept="image/*" capture="environment"
             className="cknote__file" id="cknote-shot"
             onChange={(e) => setShot(e.target.files?.[0] ?? null)} />

      <div className="cknote__row">
        <label className="cknote__pick" htmlFor="cknote-shot">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
               aria-hidden="true">
            <path d="M2.5 6.5h3l1.2-2h6.6l1.2 2h3v10h-15z" strokeLinejoin="round" />
            <circle cx="10" cy="11" r="3.2" />
          </svg>
          <span>{shot ? shot.name : labels.photo}</span>
        </label>

        <button type="button" className="cknote__send" onClick={go}
                disabled={busy || (!body.trim() && !shot)}>
          {busy ? labels.sending : labels.send}
        </button>
      </div>

      {said && (
        <p className={said.ok ? 'cknote__ok' : 'cknote__bad'}>{said.message}</p>
      )}
    </section>
  )
}
