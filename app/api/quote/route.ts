import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { quoteEmail } from '@/lib/quote-email'

/**
 * Sends the quote to the signed-in person's own address.
 *
 * The recipient is taken from the session and never from the request body: an
 * endpoint that mails whatever address it is handed is an open relay wearing
 * your sending domain, and it would be found within a week of going live.
 */
export async function POST(req: Request) {
  const db = supabaseServer()
  const { data: { user } } = await db.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }

  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) {
    // Stand down rather than report a success for a message that went nowhere.
    return NextResponse.json({
      error: 'Mail is not wired up yet — RESEND_API_KEY and MAIL_FROM are not set.',
    }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const quote = typeof body?.quote === 'string' ? body.quote.slice(0, 300) : ''
  if (!quote) return NextResponse.json({ error: 'No quote to send.' }, { status: 400 })

  const { data: profile } = await db.schema('beebee')
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const mail = quoteEmail({ quote, name: profile?.full_name || 'Somebody', origin })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [user.email],
      subject: mail.subject, html: mail.html, text: mail.text,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return NextResponse.json({ error: `Resend refused it: ${detail.slice(0, 200)}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true, to: user.email })
}
