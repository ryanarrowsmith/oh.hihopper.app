/* ==========================================================================
   DESK
   The vocabulary a ticket is written in, in one place, because the queue, the
   ticket page, the dashboard and the admin panel all have to agree about what
   "waiting" means and what colour it is.
   ========================================================================== */

export type Status = 'open' | 'waiting' | 'resolved' | 'closed'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type Facing = 'in' | 'out' | 'both'
export type AssignMode = 'manual' | 'round_robin' | 'least_open' | 'fixed'
export type FieldKind = 'text' | 'long' | 'number' | 'date' | 'choice' | 'toggle'

/** What each word says on the screen. "Waiting on them" rather than "waiting",
 *  because the whole point of the status is WHOSE turn it is. */
export const STATUS_WORD: Record<Status, string> = {
  open: 'Open', waiting: 'Waiting on them', resolved: 'Resolved', closed: 'Closed',
}
export const PRIORITY_WORD: Record<Priority, string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
}
export const FACING_WORD: Record<Facing, string> = {
  out: 'Customers write in',
  in: 'Colleagues ask for something',
  both: 'Both — customers and colleagues',
}
export const ASSIGN_WORD: Record<AssignMode, string> = {
  manual: 'Nobody — somebody picks it up',
  round_robin: 'Round robin, in turn',
  least_open: 'Whoever has fewest open',
  fixed: 'Always the same person',
}
export const FIELD_WORD: Record<FieldKind, string> = {
  text: 'A line of text', long: 'A paragraph', number: 'A number',
  date: 'A date', choice: 'One of a list', toggle: 'Yes or no',
}
export const SOURCE_WORD: Record<string, string> = {
  email: 'by email', form: 'by the web form', agent: 'raised here',
}

/** The one place that knows a ticket is still ours. */
export const LIVE: Status[] = ['open', 'waiting']

/* ------------------------------------------------------------- the clock */

export type Sla = { tone: 'met' | 'ok' | 'soon' | 'late' | 'paused' | 'none'; text: string }

/**
 * How the SLA reads, right now.
 *
 * A pure function of the row and a moment, so the server can print it into the
 * first paint and a client component can re-run it every half minute against
 * the same rule. Passing a formatter across that boundary is what took the
 * homepage down; passing the numbers does not.
 */
export function slaOf(t: {
  status: Status; first_reply_due: string | null; first_reply_at: string | null
  resolve_due: string | null; resolved_at: string | null
}, now = Date.now()): Sla {
  if (t.status === 'resolved' || t.status === 'closed') {
    if (!t.resolve_due || !t.resolved_at) return { tone: 'none', text: '' }
    const late = Date.parse(t.resolved_at) - Date.parse(t.resolve_due)
    // Short enough to sit in a column beside five others. "met with 34 minutes
    // to spare" is a true sentence that ran off the end of the table.
    return late > 0
      ? { tone: 'late', text: `${gap(late)} over` }
      : { tone: 'met', text: `met · ${gap(-late)} spare` }
  }

  // Waiting on them is not us being late; the database is already holding the
  // clock, so the screen says so rather than counting down against nobody.
  if (t.status === 'waiting') return { tone: 'paused', text: 'paused' }

  // The first reply is the promise that has not been kept yet; once it has,
  // the resolve target is the one still running.
  const due = !t.first_reply_at && t.first_reply_due ? t.first_reply_due : t.resolve_due
  if (!due) return { tone: 'none', text: '' }

  const left = Date.parse(due) - now
  if (left < 0) return { tone: 'late', text: `${gap(-left)} late` }
  return { tone: left < 60 * 60 * 1000 ? 'soon' : 'ok', text: gap(left) }
}

/** A span, in the largest unit that still says something useful. */
export function gap(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`
}

/* ------------------------------------------------------------- one ticket */

export type Row = {
  id: string; ref: string; subject: string; status: Status; priority: Priority
  source: string; opened_at: string; last_message_at: string | null
  first_reply_due: string | null; first_reply_at: string | null
  resolve_due: string | null; resolved_at: string | null
  entity_id: string; queue_id: string; assignee_id: string | null
  group_id: string | null; kind_id: string | null
  contact_id: string | null; requester_name: string | null; requester_email: string | null
}

/* ---------------------------------------------------------- what it scored */

/**
 * A ticket with both promises already worked out, as hopper.ticket_scored
 * hands it over. The type lives HERE and not beside the loader because the
 * dashboard is a client component: a type imported out of a module that
 * imports supabaseServer drags next/headers into the browser bundle, which is
 * the same split that put loadTickets in deskdata.ts and the vocabulary here.
 *
 * Five states and not a boolean. "We have not answered yet and are still
 * inside the promise" and "we never answered and blew it" are different facts,
 * and a boolean has to pick one of them to lie about.
 */
export type State = 'none' | 'met' | 'missed' | 'late' | 'due'

export type Scored = {
  id: string; ref: string; subject: string
  status: Status; priority: string; source: string
  entity_id: string; queue_id: string; kind_id: string | null
  assignee_id: string | null; contact_id: string | null
  opened_at: string; resolved_at: string | null
  first_reply_at: string | null; last_message_at: string | null
  first_reply_due: string | null
  /** The target AS IT STANDS: while a ticket waits on them the view pushes it
   *  forward, so a weekend in Waiting is not a breach on Monday. */
  resolve_due: string | null
  reply_state: State; resolve_state: State
  reply_mins: number | null; resolve_mins: number | null
  age_mins: number | null; quiet_mins: number | null
}

/** Late means EITHER clock, per the ruling. Only the unanswered kind counts as
 *  something to act on: a reply that WAS late and has since been sent is
 *  history, and history does not belong on a list of what needs you now. */
export const isLate = (t: { reply_state: State; resolve_state: State }) =>
  t.reply_state === 'late' || t.resolve_state === 'late'

/** Whether a promise was kept, once it can be judged at all. */
export const judged = (s: State) => s === 'met' || s === 'missed'

/** The middle one, not the average. A single ticket left over a long weekend
 *  drags a mean somewhere nobody recognizes, and the number people act on has
 *  to describe the usual case. */
export function median(ns: number[]): number | null {
  if (ns.length === 0) return null
  const a = [...ns].sort((x, y) => x - y)
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2)
}

/* ------------------------------------------------------ out with somebody */

/**
 * A to-do raised out of a ticket.
 *
 * The two structural lines the thread shows -- asked, and finished -- are
 * DERIVED from this row rather than stored anywhere: created_at with created_by
 * is the ask, done_at with assignee_id is the finish. Writing marker rows for
 * them would be a second copy of a fact the row already carries, and second
 * copies are how a timeline starts disagreeing with the thing it describes.
 */
export type Job = {
  id: string; name: string; detail: string | null
  assignee_id: string | null; created_by: string | null
  due_on: string | null; done_at: string | null; created_at: string
  list_id: string
}

export const openJobs = (jobs: Job[]) => jobs.filter((j) => !j.done_at)
