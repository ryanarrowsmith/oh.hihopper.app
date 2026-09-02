'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

function SignInForm() {
  const router = useRouter()
  const next = useSearchParams().get('next') || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setBusy(false); return }
    router.push(next as any); router.refresh()
  }

  return (
    <main className="signin">
      <div className="signin__box">
        <div className="signin__head">
          <span className="mark mark--sm">hopper<span className="pd">.</span></span>
          <p style={{ marginTop: 8, fontSize: 14, color: 'rgba(251,249,245,.72)' }}>
            The home to your loose bits.
          </p>
        </div>
        <form className="signin__body" onSubmit={submit}>
          {error && <p className="err">{error}</p>}
          <label htmlFor="email">Email</label>
          <input id="email" className="field" type="email" autoComplete="email" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="pw">Password</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn--amber" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="fine" style={{ marginTop: 14, textAlign: 'center' }}>
            No account yet? <a href={process.env.NEXT_PUBLIC_SITE_URL || 'https://hihopper.app'}>hihopper.app</a>
          </p>
        </form>
      </div>
    </main>
  )
}

export default function SignIn() {
  // useSearchParams needs a boundary: the shell prerenders, the form fills in.
  return (
    <Suspense fallback={
      <main className="signin">
        <div className="signin__box">
          <div className="signin__head">
            <span className="mark mark--sm">hopper<span className="pd">.</span></span>
          </div>
          <div className="signin__body"><p className="muted">Loading…</p></div>
        </div>
      </main>
    }>
      <SignInForm />
    </Suspense>
  )
}
