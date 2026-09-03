import { NextResponse } from 'next/server'
import { liveToken } from '@/lib/supabase/token'

export const dynamic = 'force-dynamic'

/**
 * What tabs are in this sheet.
 *
 * A proxy and nothing more, the same shape as peek: the reading happens in the
 * read-report edge function, because a second implementation of "what tabs are
 * there" is a second thing that can be right about a different workbook.
 */
export async function POST(req: Request) {
  const token = await liveToken()
  if (!token) return NextResponse.json({ ok: false, failure: 'Sign in again.' }, { status: 401 })

  const { url } = await req.json().catch(() => ({ url: null }))
  if (!url) return NextResponse.json({ ok: false, failure: 'Where does the sheet live?' })

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/read-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tabs: { url } }),
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
