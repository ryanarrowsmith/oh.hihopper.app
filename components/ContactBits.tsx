'use client'
import Link from 'next/link'
import { slaOf, STATUS_WORD, SOURCE_WORD, type Status } from '@/lib/desk'

export type Tick = {
  id: string; ref: string; subject: string; status: Status; source: string
  queue_id: string; contact_id?: string | null; opened_at: string
  first_reply_due: string | null; first_reply_at: string | null
  resolve_due: string | null; resolved_at: string | null
}

export const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
export const LONG = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

export function mark(name: string) {
  const p = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** How long ago, in the largest unit that still says something. */
export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return 'never'
  const d = Math.floor((now - Date.parse(iso)) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 31) return `${d} days`
  if (d < 365) return `${Math.round(d / 30)} months`
  return `${Math.round(d / 365)} years`
}

/**
 * Somebody's tickets, in the shape the queue already uses.
 *
 * Deliberately the same two-line row rather than a tidier table of its own: a
 * ticket should look like a ticket wherever you meet it, and the queue's row
 * has already been through mobile, print and the ellipsis argument.
 */
export function TicketList({ rows, queues, who }: {
  rows: Tick[]; queues: { id: string; name: string }[]
  /** contact id → name, when the list spans more than one person. */
  who?: Map<string, string>
}) {
  const queueOf = new Map(queues.map((q) => [q.id, q.name]))
  const now = Date.now()
  if (rows.length === 0) {
    return <p className="empty">Nothing yet — nobody here has raised a ticket.</p>
  }
  return (
    <div className="dktix">
      {rows.map((t) => {
        const s = slaOf(t, now)
        return (
          <Link href={`/desk/${t.id}` as any} className="dktix__r dktix__r--c" key={t.id}>
            <span className="dktix__ref tnum">{t.ref}</span>
            <span className="dktix__s">
              <b>{t.subject}</b>
              <span>{[queueOf.get(t.queue_id),
                      who && t.contact_id ? who.get(t.contact_id) : null,
                      SOURCE_WORD[t.source] ?? null].filter(Boolean).join(' · ')}</span>
            </span>
            <span><span className={`dkpill dkpill--${t.status}`}>{STATUS_WORD[t.status]}</span></span>
            <span className={`dksla dksla--${s.tone}`}>{s.text && <i />}{s.text}</span>
            <span className="dktix__when">{DAY.format(new Date(t.opened_at))}</span>
          </Link>
        )
      })}
    </div>
  )
}

/** The numbers worth knowing about somebody before you answer them. */
export function History({ rows }: { rows: Tick[] }) {
  const live = rows.filter((t) => t.status === 'open' || t.status === 'waiting')
  const met = rows.filter((t) => t.resolve_due && t.resolved_at)
  const late = met.filter((t) => Date.parse(t.resolved_at!) > Date.parse(t.resolve_due!)).length

  // Median, not mean: one ticket that sat over a weekend should not be allowed
  // to describe every other conversation this person has had with us.
  const replies = rows
    .filter((t) => t.first_reply_at)
    .map((t) => Date.parse(t.first_reply_at!) - Date.parse(t.opened_at))
    .sort((a, b) => a - b)
  const median = replies.length
    ? replies[Math.floor(replies.length / 2)]
    : null

  return (
    <dl className="cstats">
      <div className="cstat"><dt>Open now</dt><dd className="tnum">{live.length}</dd></div>
      <div className="cstat"><dt>All time</dt><dd className="tnum">{rows.length}</dd></div>
      <div className="cstat"><dt>We answer in</dt>
        <dd className="cstat--sm">{median === null ? '—' : span(median)}
          <small>{median === null ? 'no reply yet' : 'median first reply'}</small></dd></div>
      <div className="cstat"><dt>Late on them</dt>
        <dd className="cstat--sm tnum">{late}<small>of {met.length} with a clock</small></dd></div>
      <div className="cstat"><dt>Last heard</dt>
        <dd className="cstat--sm">{ago(rows[0]?.opened_at ?? null)}</dd></div>
    </dl>
  )
}

function span(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)}d`
}
