import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Hopper as an .ics feed.
 *
 * Signed in to nothing, because a calendar client is: Google, Apple and Outlook
 * fetch this with no header, no cookie and no way to prove who they are. The
 * secret in the path is therefore the whole of the authentication, which is why
 * a wrong token answers with an EMPTY calendar rather than a 404 -- a reply
 * that differs is a way to test tokens.
 *
 * Always 200, always a calendar. A client that gets an error usually
 * unsubscribes itself, and the person finds out weeks later.
 */
const fold = (line: string) => {
  // RFC 5545: no line over 75 octets. Longer ones continue with a leading
  // space, and a client that meets an over-long line usually drops the event
  // rather than the line.
  const out: string[] = []
  let s = line
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74) }
  out.push(s)
  return out.join('\r\n')
}
const esc = (s: string) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dayOf = (iso: string) => iso.replace(/-/g, '')

export async function GET(req: Request, { params }: { params: { token: string; file: string } }) {
  const base = new URL(req.url).origin
  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hopper//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Hopper',
    // How often a client is willing to come back. Most ignore it; the ones that
    // honour it stop hammering this every five minutes.
    'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  try {
    const { data } = await supabaseServer().schema('hopper')
      .rpc('calendar_feed_for', { p_token: params.token })

    for (const e of (data ?? []) as any[]) {
      const uid = `${e.uid}@oh.hihopper.app`
      lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(new Date())}`)
      if (e.all_day && e.starts_on) {
        const end = new Date(`${e.starts_on}T00:00:00`); end.setDate(end.getDate() + 1)
        lines.push(`DTSTART;VALUE=DATE:${dayOf(e.starts_on)}`)
        lines.push(`DTEND;VALUE=DATE:${dayOf(end.toISOString().slice(0, 10))}`)
      } else if (e.at) {
        lines.push(`DTSTART:${stamp(new Date(e.at))}`)
        if (e.ends_at) lines.push(`DTEND:${stamp(new Date(e.ends_at))}`)
      } else continue
      lines.push(fold(`SUMMARY:${esc(e.title)}`))
      if (e.url) lines.push(fold(`URL:${base}${e.url}`))
      lines.push('END:VEVENT')
    }
  } catch { /* an empty calendar, never an error */ }

  lines.push('END:VCALENDAR')
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${params.file.replace(/[^\w.-]/g, '') || 'hopper.ics'}"`,
      // Never cached by anything in between: this is one person's calendar
      // behind a secret path, and a shared cache holding it is that secret
      // becoming somebody else's.
      'Cache-Control': 'private, no-store',
    },
  })
}
