'use client'
import { useRef, useState } from 'react'
import { support } from '@/lib/support'

/**
 * A one-box support request, for the places that have nothing else to offer.
 *
 * The same beebee.open_request as the Support page, with the subject already
 * written and the kind fixed to feedback -- everything a form can decide for
 * somebody is one fewer reason to close the tab instead. The account comes from
 * the page, and the reporter comes from the token, as always.
 */
export default function Ask({ subject, accountId }: { subject: string; accountId?: string }) {
  const client = useRef(accountId ? support(accountId) : null)
  const token = useRef<string | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [why, setWhy] = useState<string | null>(null)

  if (!client.current) {
    return (
      <p className="fine">
        Sign in to ask for this — a request without somebody attached to it is a
        request nobody can answer.
      </p>
    )
  }
  if (!token.current) token.current = client.current.newSubmitToken()

  async function send() {
    if (!body.trim() || !client.current) return
    setBusy(true); setWhy(null)
    const { request, error } = await client.current.open({
      subject, body: body.trim(), kind: 'feedback', urgency: 'whenever',
      idempotencyKey: token.current!,
    })
    setBusy(false)
    if (error || !request) { setWhy(error ?? 'It did not send.'); return }
    setSent(request.ref)
    setBody('')
    token.current = client.current.newSubmitToken()
  }

  if (sent) {
    return (
      <p className="sok sok--thin"><b>{sent}</b> Noted — thank you. It is on your
        <a href="/support"> Support</a> page.</p>
    )
  }

  return (
    <>
      <textarea className="field sform__t" rows={4} value={body}
                placeholder="We would use this for…"
                onChange={(e) => setBody(e.target.value)} />
      <div className="rowacts">
        <button className="btn btn--amber" type="button" onClick={send} disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send it'}
        </button>
      </div>
      {why && <p className="swhy">{why}</p>}
    </>
  )
}
