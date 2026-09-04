'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import Chart from '@/components/Chart'
import { RangeControls } from '@/components/RangeBar'
import { useRange, inWindow } from '@/components/useRange'
import { gap, isLate, judged, median, type Scored } from '@/lib/desk'

type Named = { id: string; name: string }
type Who = { id: string; full_name: string }
type Agent = { queue_id: string; person_id: string; lead: boolean }
type Scope = 'mine' | 'queues' | 'all'

const PRINTED = new Intl.DateTimeFormat('en-US',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit' })
const SCOPE_WORD: Record<Scope, string> = {
  mine: 'On me', queues: 'My queues', all: 'Everything',
}

const pad = (n: number) => String(n).padStart(2, '0')
const day = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
const between = (a: string, b: string) =>
  Math.max(1, Math.round((+new Date(`${b}T00:00:00`) - +new Date(`${a}T00:00:00`)) / 86400000))

/** Attainment as a fraction, and null when there is nothing to judge -- which
 *  is not the same as zero and must never be drawn as though it were. */
function kept(rows: Scored[], which: 'reply' | 'resolve') {
  const judgeable = rows.filter((r) => judged(which === 'reply' ? r.reply_state : r.resolve_state))
  if (judgeable.length === 0) return null
  const met = judgeable.filter((r) => (which === 'reply' ? r.reply_state : r.resolve_state) === 'met')
  return { met: met.length, of: judgeable.length, pct: Math.round((met.length / judgeable.length) * 100) }
}

/**
 * How the Desk is going.
 *
 * One screen for three readers. A rep, a queue lead and an owner want
 * different numbers, and the answer is a SCOPE rather than three screens --
 * with the scopes offered being the ones this person's rights already allow.
 * Somebody who only has their own tickets is offered only their own tickets
 * and never learns a wider view existed, which is the same rule the queue
 * screen follows when it declines to draw a filter that cannot filter.
 *
 * Nothing here is stored. Every figure is worked out from hopper.ticket_scored
 * as it stands right now, so the page is never stale and never disagrees with
 * the ticket you click through to.
 */
export default function DeskDash({
  rows, agents, queues, orgs, kinds, people, mePersonId, printedBy,
}: {
  rows: Scored[]
  agents: Agent[]
  queues: (Named & { entity_id: string })[]
  orgs: Named[]
  kinds: Named[]
  people: Who[]
  mePersonId: string | null
  printedBy: string
}) {
  const { range, setRange, window: win } = useRange()

  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people])
  const queueOf = useMemo(() => new Map(queues.map((q) => [q.id, q.name])), [queues])
  const kindOf = useMemo(() => new Map(kinds.map((k) => [k.id, k.name])), [kinds])

  // Which scopes are even worth offering.
  const myQueues = useMemo(
    () => new Set(agents.filter((a) => a.person_id === mePersonId).map((a) => a.queue_id)),
    [agents, mePersonId])
  const mineRows = useMemo(
    () => rows.filter((r) => r.assignee_id && r.assignee_id === mePersonId), [rows, mePersonId])
  const queueRows = useMemo(
    () => rows.filter((r) => myQueues.has(r.queue_id)), [rows, myQueues])

  const offers = useMemo(() => {
    const out: Scope[] = ['mine']
    if (myQueues.size > 0) out.push('queues')
    const narrower = myQueues.size > 0 ? queueRows.length : mineRows.length
    if (rows.length > narrower) out.push('all')
    return out
  }, [myQueues, queueRows, mineRows, rows])

  const [scope, setScope] = useState<Scope>(
    () => (myQueues.size > 0 ? 'queues' : rows.length > mineRows.length ? 'all' : 'mine'))
  const at: Scope = offers.includes(scope) ? scope : offers[offers.length - 1]

  const scoped = at === 'mine' ? mineRows : at === 'queues' ? queueRows : rows

  /* --------------------------------------------------------- the window */

  const openedIn = useMemo(
    () => scoped.filter((r) => inWindow(day(r.opened_at), win)), [scoped, win])
  const resolvedIn = useMemo(
    () => scoped.filter((r) => r.resolved_at && inWindow(day(r.resolved_at), win)),
    [scoped, win])

  // The same length of time immediately before, so "up 6 points" means
  // something. All time has nothing behind it and gets no arrow.
  const before = useMemo(() => {
    if (!win.from || !win.to) return null
    const n = between(win.from, win.to)
    return { from: addDays(win.from, -n - 1), to: addDays(win.from, -1) }
  }, [win])

  const reply = kept(openedIn, 'reply')
  const resolve = kept(resolvedIn, 'resolve')
  const replyWas = before ? kept(scoped.filter((r) => inWindow(day(r.opened_at), before)), 'reply') : null
  const resolveWas = before
    ? kept(scoped.filter((r) => r.resolved_at && inWindow(day(r.resolved_at), before)), 'resolve')
    : null

  /* ------------------------------------------------ what needs you now */

  const now = Date.now()
  const needs = useMemo(() => {
    const live = scoped.filter((r) => r.status === 'open' || r.status === 'waiting')
    const soon = (iso: string | null) =>
      iso ? (+new Date(iso) - now) / 60000 : Infinity
    return live.map((r) => {
      const overdue = Math.max(
        r.reply_state === 'late' ? -soon(r.first_reply_due) : 0,
        r.resolve_state === 'late' ? -soon(r.resolve_due) : 0)
      const due = Math.min(
        r.reply_state === 'due' ? soon(r.first_reply_due) : Infinity,
        r.resolve_state === 'due' ? soon(r.resolve_due) : Infinity)
      if (isLate(r)) return { r, why: 'late' as const, says: `Late ${gap(overdue * 60000)}`, rank: 0, by: -overdue }
      if (due < 60) return { r, why: 'soon' as const, says: `Due ${gap(due * 60000)}`, rank: 1, by: due }
      if (!r.assignee_id) return { r, why: 'none' as const, says: 'Nobody on it', rank: 2, by: -(r.age_mins ?? 0) }
      if ((r.quiet_mins ?? 0) > 3 * 1440)
        return { r, why: 'stale' as const, says: `Quiet ${gap((r.quiet_mins ?? 0) * 60000)}`, rank: 3, by: -(r.quiet_mins ?? 0) }
      return null
    }).filter(Boolean)
      .sort((a, b) => a!.rank - b!.rank || a!.by - b!.by) as
      { r: Scored; why: 'late' | 'soon' | 'none' | 'stale'; says: string; rank: number; by: number }[]
  }, [scoped, now])

  /* ------------------------------------------------------- keeping up */

  const flow = useMemo(() => {
    const from = win.from ?? (openedIn.length
      ? day(openedIn[openedIn.length - 1].opened_at) : day(new Date().toISOString()))
    const to = win.to ?? day(new Date().toISOString())
    const span = between(from, to)
    // Past six weeks a bar a day is a picket fence. Weeks read better and the
    // question -- are we keeping up -- is answered just as well by either.
    const weekly = span > 45
    const key = (d: string) => weekly ? addDays(d, -(new Date(`${d}T00:00:00`).getDay() + 6) % 7) : d
    const o = new Map<string, number>(); const r = new Map<string, number>()
    for (let i = 0; i <= span; i++) { const k = key(addDays(from, i)); o.set(k, 0); r.set(k, 0) }
    for (const t of openedIn) { const k = key(day(t.opened_at)); if (o.has(k)) o.set(k, o.get(k)! + 1) }
    for (const t of resolvedIn) { const k = key(day(t.resolved_at!)); if (r.has(k)) r.set(k, r.get(k)! + 1) }
    const days = [...o.keys()].sort()
    return {
      weekly,
      series: [
        { measure: 'Opened', points: days.map((d) => ({ on: d, v: o.get(d) ?? 0 })) },
        { measure: 'Resolved', points: days.map((d) => ({ on: d, v: r.get(d) ?? 0 })) },
      ],
    }
  }, [openedIn, resolvedIn, win])

  const net = resolvedIn.length - openedIn.length

  /* ------------------------------------------------------- the slices */

  const byQueue = useMemo(() => cut(scoped, openedIn, resolvedIn,
    (r) => r.queue_id, (id) => queueOf.get(id) ?? 'A queue that has gone'), [scoped, openedIn, resolvedIn, queueOf])
  const byPerson = useMemo(() => cut(scoped, openedIn, resolvedIn,
    (r) => r.assignee_id ?? '', (id) => id ? (nameOf.get(id) ?? 'Somebody') : 'Nobody'),
    [scoped, openedIn, resolvedIn, nameOf])
  const byKind = useMemo(() => {
    const n = new Map<string, number>()
    for (const t of openedIn) {
      const k = t.kind_id ?? ''
      n.set(k, (n.get(k) ?? 0) + 1)
    }
    const all = [...n.entries()]
      .map(([id, count]) => ({ id, name: id ? (kindOf.get(id) ?? 'A type that has gone') : 'No type', count }))
      .sort((a, b) => b.count - a.count)
    return { all: all.slice(0, 6), top: all[0]?.count ?? 1 }
  }, [openedIn, kindOf])

  // People only matter to somebody who has people. A rep looking at their own
  // tickets is the only person in the table, and a table of one is a row.
  const showPeople = at !== 'mine' && byPerson.length > 1

  const live = scoped.filter((r) => r.status === 'open' || r.status === 'waiting')
  const lateNow = live.filter(isLate).length
  const noneNow = live.filter((r) => !r.assignee_id).length

  return (
    <div className="pjcol dkcol">
      <div className="pj__h noprint">
        <div className="pj__id">
          <h1>How it&rsquo;s going</h1>
          <p className="dksay">
            {live.length === 0 ? 'Nothing open' : <><b>{live.length} open</b></>}
            {byQueue.length > 1 && <> across {byQueue.length} queues</>}.
            {lateNow > 0 && <> <Link href="/desk">{lateNow === 1 ? 'One is late' : `${lateNow} are late`}</Link>.</>}
            {noneNow > 0 && <> <Link href="/desk/unassigned">
              {noneNow === 1 ? 'One has nobody on it' : `${noneNow} have nobody on them`}</Link>.</>}
            {resolvedIn.length > 0 && net !== 0 && <>
              {' '}You&rsquo;ve {net > 0 ? 'closed' : 'opened'} <b>{Math.abs(net)} more</b> than you&rsquo;ve
              {' '}{net > 0 ? 'opened' : 'closed'} in this window.</>}
          </p>
        </div>
      </div>

      {/* Paper carries what the chips were saying, because a printed sheet
          with no scope and no window on it is a page of numbers about
          nothing in particular. */}
      <div className="printonly printhead">
        <p className="printhead__m">Hopper &middot; Desk</p>
        <h2>How it&rsquo;s going</h2>
        <p className="printhead__l">
          <span>{SCOPE_WORD[at]}</span>
          <span>{win.from ? `${win.from} to ${win.to}` : 'All time'}</span>
          <span>{live.length} open</span>
        </p>
        <p className="printhead__w">Printed by {printedBy} &middot; {PRINTED.format(new Date())}</p>
      </div>

      <div className="dkfil dkfil--dash noprint">
        {offers.length > 1 && offers.map((s) => (
          <button key={s} type="button" className={`dkchip${at === s ? ' on' : ''}`}
                  aria-pressed={at === s} onClick={() => setScope(s)}>
            {SCOPE_WORD[s]}
          </button>
        ))}
        <span className="dkfil__pick"><RangeControls range={range} setRange={setRange} /></span>
      </div>

      {/* ------------------------------------------------- the promise */}
      <div className="dkprom">
        <Promise label="Answered in time" now={reply} was={replyWas}
                 note="Of the tickets raised in this window." />
        <Promise label="Resolved in time" now={resolve} was={resolveWas}
                 note="Of the tickets finished in this window." />
      </div>

      {/* --------------------------------------------- what needs you now */}
      <section className="dkpan">
        <div className="dkpan__h">
          <b>What needs you now</b>
          <span className="dkpan__n">{needs.length}</span>
          {needs.length > 8 && <Link className="dkpan__more" href="/desk">See all &rarr;</Link>}
        </div>
        {needs.length === 0 ? (
          <p className="empty" style={{ margin: 0, padding: '22px 15px' }}>
            Nothing is late, nothing is about to be, and everything open has somebody on it.
          </p>
        ) : needs.slice(0, 8).map(({ r, why, says }) => (
          <Link className="dkneed" key={r.id} href={`/desk/${r.id}`}>
            <span className="dkneed__ref">{r.ref}</span>
            <span className={`dkwhy dkwhy--${why}`}>{says}</span>
            <span className="dkneed__s">{r.subject}</span>
            <span className="dkneed__q">{queueOf.get(r.queue_id) ?? ''}</span>
            <span className="dkneed__w">
              {r.assignee_id ? (nameOf.get(r.assignee_id) ?? 'Somebody') : 'Nobody'}</span>
          </Link>
        ))}
      </section>

      <div className="dkduo">
        <section className="dkpan">
          <div className="dkpan__h"><b>Keeping up</b>
            <span className="dkpan__n">{flow.weekly ? 'by week' : 'by day'}</span></div>
          <div className="dkpan__b">
            {openedIn.length + resolvedIn.length === 0
              ? <p className="empty" style={{ margin: 0 }}>Nothing was raised or finished in this window.</p>
              : <Chart type="bar" series={flow.series} height={200} together />}
          </div>
        </section>

        <section className="dkpan">
          <div className="dkpan__h"><b>What they write about</b></div>
          {byKind.all.length === 0
            ? <p className="empty" style={{ margin: 0, padding: '22px 15px' }}>Nothing raised in this window.</p>
            : <table className="dktb">
                <tbody>
                  {byKind.all.map((k) => (
                    <tr key={k.id || 'none'}>
                      <td><b>{k.name}</b></td>
                      <td className="num" style={{ width: 56 }}>{k.count}</td>
                      <td style={{ width: 110 }}>
                        <span className="dkbar">
                          <em style={{ width: `${Math.round((k.count / byKind.top) * 100)}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </section>
      </div>

      <Slice title="By queue" note="Worst first." rows={byQueue} what="queue" />
      {showPeople && <Slice title="By person" note="Nobody is counted too." rows={byPerson} what="person" />}

      <p className="dkfoot">
        <b>Typical</b> is the median, not the average &mdash; one ticket left over a long weekend
        drags a mean somewhere nobody recognizes. <b>Late</b> means either clock: a first reply
        that has not gone out in time, or a resolution past its target.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------ the pieces */

function Promise({ label, now, was, note }: {
  label: string
  now: { met: number; of: number; pct: number } | null
  was: { met: number; of: number; pct: number } | null
  note: string
}) {
  const move = now && was ? now.pct - was.pct : null
  return (
    <div className="dkprom__c">
      <span className="fig__l">{label}</span>
      {now === null ? (
        <>
          <span className="dkprom__v">&mdash;</span>
          <p className="dkprom__s">Nothing in this window has a promise to keep yet.</p>
        </>
      ) : (
        <>
          <span className="dkprom__n">
            <b className="dkprom__v">{now.pct}%</b>
            {move !== null && move !== 0 && (
              <span className={`dkprom__d ${move > 0 ? 'up' : 'down'}`}>
                {Math.abs(move)} {Math.abs(move) === 1 ? 'pt' : 'pts'}
              </span>
            )}
          </span>
          <p className="dkprom__s">
            {now.met} of {now.of}
            {now.of - now.met > 0 && <> &middot; <b>{now.of - now.met} missed</b></>}
          </p>
        </>
      )}
      {now !== null && <p className="dkprom__note">{note}</p>}
    </div>
  )
}

type Cut = {
  id: string; name: string; open: number; late: number; done: number
  reply: ReturnType<typeof kept>; resolve: ReturnType<typeof kept>; typical: number | null
}

function cut(all: Scored[], openedIn: Scored[], resolvedIn: Scored[],
             by: (r: Scored) => string, name: (id: string) => string): Cut[] {
  const ids = new Set<string>()
  for (const r of all) ids.add(by(r))
  const out: Cut[] = []
  for (const id of ids) {
    const live = all.filter((r) => by(r) === id && (r.status === 'open' || r.status === 'waiting'))
    const o = openedIn.filter((r) => by(r) === id)
    const d = resolvedIn.filter((r) => by(r) === id)
    if (live.length === 0 && o.length === 0 && d.length === 0) continue
    out.push({
      id, name: name(id),
      open: live.length,
      late: live.filter(isLate).length,
      done: d.length,
      reply: kept(o, 'reply'),
      resolve: kept(d, 'resolve'),
      typical: median(o.map((r) => r.reply_mins).filter((m): m is number => m !== null)),
    })
  }
  // Worst first: whoever is late, then whoever is keeping the promise least
  // well, then whoever is carrying the most. A table sorted by name makes you
  // read every row to find the one that needs you.
  return out.sort((a, b) =>
    b.late - a.late ||
    (a.reply?.pct ?? 101) - (b.reply?.pct ?? 101) ||
    b.open - a.open)
}

function Slice({ title, note, rows, what }: {
  title: string; note: string; rows: Cut[]; what: 'queue' | 'person'
}) {
  if (rows.length === 0) return null
  return (
    <section className="dkpan">
      <div className="dkpan__h"><b>{title}</b><span className="dkpan__n">{note}</span></div>
      <table className="dktb dktb--slice">
        <thead>
          <tr>
            <th>{what === 'queue' ? 'Queue' : 'Who'}</th>
            <th className="num">{what === 'queue' ? 'Open' : 'On them'}</th>
            <th className="num">Late</th>
            <th className="num">Closed</th>
            <th className="num">Answered</th>
            <th className="num">Resolved</th>
            <th className="num">Typical reply</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id || 'nobody'}>
              <td data-l={what === 'queue' ? 'Queue' : 'Who'}><b>{r.name}</b></td>
              <td className="num" data-l={what === 'queue' ? 'Open' : 'On them'}>
                {r.open || '—'}</td>
              <td className="num" data-l="Late">
                {r.late > 0 ? <span className="dkdot">{r.late}</span> : '—'}</td>
              <td className="num" data-l="Closed">{r.done || '—'}</td>
              <td className="num" data-l="Answered"><Pct v={r.reply} /></td>
              <td className="num" data-l="Resolved"><Pct v={r.resolve} /></td>
              <td className="num" data-l="Typical reply">
                {r.typical === null ? '—' : gap(r.typical * 60000)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** A percentage with the bar it stands on. Null is an em dash and not a zero:
 *  nothing to judge is not the same as judged and failed. */
function Pct({ v }: { v: ReturnType<typeof kept> }) {
  if (!v) return <>—</>
  return (
    <span className={`dkpct${v.pct < 90 ? ' bad' : ''}`}>
      <span className="dkpct__t"><em style={{ width: `${v.pct}%` }} /></span>
      <u>{v.pct}%</u>
    </span>
  )
}
