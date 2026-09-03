'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * Set a new password.
 *
 * You get here only from a link that has already been traded for a session at
 * /auth/callback, so this page checks there is one rather than checking a
 * token. That is the whole of its security and it is Supabase's: a recovery
 * session can change a password and nothing else.
 *
 * Two rules on the field itself, and only two. Length, because it is the one
 * requirement that reliably helps. And a second box, because a password you
 * cannot see is a password you can mistype into a lock you then cannot open.
 * No character classes: they push people towards Passw0rd! and away from the
 * long ordinary phrase that is actually stronger.
 */
const MIN = 10

export default function Reset() {
  const router = useRouter()
  const [ready, setReady] = useState<boolean | null>(null)
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState<string | null>(null)

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setReady(!!data.user))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw.length < MIN) { setWhy(`${MIN} characters or more. A short phrase beats a clever word.`); return }
    if (pw !== again) { setWhy('The two do not match.'); return }
    setBusy(true); setWhy(null)
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setWhy(error.message); return }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="signin">
      <div className="signin__box">
        <div className="signin__head">
          <span className="mark mark--sm">hopper<span className="pd">.</span></span>
          <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(251,249,245,.72)' }}>
            A new password, and you&rsquo;re in.
          </p>
        </div>

        {ready === null ? (
          <div className="signin__body"><p className="muted">One moment…</p></div>
        ) : !ready ? (
          <div className="signin__body">
            <p className="err">
              That link has expired or been used already. Both are ordinary — ask
              for another and it will be waiting.
            </p>
            <Link className="btn btn--amber" href="/forgot">Send me a new one</Link>
          </div>
        ) : (
          <form className="signin__body" onSubmit={submit}>
            {why && <p className="err">{why}</p>}
            <label htmlFor="pw">New password</label>
            <input id="pw" className="field" type={show ? 'text' : 'password'}
                   autoComplete="new-password" required minLength={MIN}
                   value={pw} onChange={(e) => setPw(e.target.value)} />
            <label htmlFor="pw2">And again</label>
            <input id="pw2" className="field" type={show ? 'text' : 'password'}
                   autoComplete="new-password" required minLength={MIN}
                   value={again} onChange={(e) => setAgain(e.target.value)} />
            {/* Showing it is the safer option far more often than not: the
                threat here is a typo, not somebody reading over your shoulder. */}
            <label className="showpw">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show it
            </label>
            <button className="btn btn--amber" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Set it and sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
