import { NextResponse } from 'next/server'
import { liveToken } from '@/lib/supabase/token'

export const dynamic = 'force-dynamic'

/**
 * Look at a source before registering it.
 *
 * This is a proxy and nothing more: the read happens in the read-report edge
 * function, through the same parser the scheduled look uses. A preview drawn by
 * a second implementation is a preview that can disagree with what actually
 * gets stored, and then the form has lied about what came back.
 *
 * The person's own token goes along, so the function can refuse anyone who is
 * not signed in.
 */
export async function POST(req: Request) {
  const token = await liveToken()
  if (!token) return NextResponse.json({ ok: false, failure: 'Sign in again.' }, { status: 401 })

  const { url, tab, kind } = await req.json().catch(() => ({ url: null, tab: null, kind: null }))
  if (!url) return NextResponse.json({ ok: false, failure: 'Where does the data live?' })

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/read-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ peek: { url, tab: tab || null, kind: kind || null } }),
      cache: 'no-store',
    })
    // Whatever comes back, it comes back saying something. The function answers
    // some refusals with `error` rather than `failure`, and the form only reads
    // `failure` -- so those arrived as a blank, and a blank became the generic
    // "Hopper could not read that." for a problem that had nothing to do with
    // the sheet. Every reply now carries a sentence.
    const out = await res.json()
    if (out?.ok) return NextResponse.json(out)
    return NextResponse.json({ ok: false, failure: out?.failure ?? out?.error ?? `The reader answered ${res.status}.` })
  } catch {
    return NextResponse.json({ ok: false, failure: 'Hopper could not reach the reader.' })
  }
}
