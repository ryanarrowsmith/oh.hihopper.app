'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Ask for a way back in.
 *
 * It says the same thing whether or not the address is one Hopper knows.
 * "No account with that email" is a free tool for working out who banks
 * somewhere, and the honest version costs the person nothing: if the address
 * is real the mail arrives, and if it is not, no mail was ever going to.
 *
 * The mail itself is the platform's -- rendered by beebee's send-email hook in
 * Hopper's colours, from Hopper's address. Nothing here writes an email, which
 * is the point: an app that keeps its own auth templates is an app whose
 * branding drifts from the product the day somebody changes one.
 */
export default function Forgot() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [why, setWhy] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setWhy(null)
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
    })
    setBusy(false)
    // A rate limit is worth saying; "we have never heard of you" is not.
    if (error && /rate|too many/i.test(error.message)) { setWhy(error.message); return }
    setSent(true)
  }

  return (
    <main className="signin">
      <div className="signin__box">
        <div className="signin__head">
          <span className="mark mark--sm">hopper<span className="pd">.</span></span>
          <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(251,249,245,.72)' }}>
            Let&rsquo;s get you back in.
          </p>
        </div>

        {sent ? (
          <div className="signin__body">
            <p className="ok">
              If <b>{email.trim()}</b> has a Hopper account, a link is on its way. It
              works once and it expires — ask for another if it goes stale.
            </p>
            <Link className="btn" href="/sign-in">Back to sign in</Link>
          </div>
        ) : (
          <form className="signin__body" onSubmit={submit}>
            {why && <p className="err">{why}</p>}
            <label htmlFor="email">Your email</label>
            <input id="email" className="field" type="email" autoComplete="email" required
                   value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn--amber" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send me a link'}
            </button>
            <p className="fine" style={{ marginTop: 14, textAlign: 'center' }}>
              Remembered it? <Link href="/sign-in">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
