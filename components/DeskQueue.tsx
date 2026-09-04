'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { slaOf, STATUS_WORD, SOURCE_WORD, type Row, type Status } from '@/lib/desk'
import RaiseTicket from '@/components/RaiseTicket'
import Choice from '@/components/Choice'

type Named = { id: string; name: string }
type Who = { id: string; full_name: string }
export type Grp = { id: string; name: string; reason: string; entity_id: string }

/**
 * The queue.
 *
 * What you open in the morning, sorted by what is closest to breaching rather
 * than by what is newest -- newest-first is a list that buries the ticket that
 * has been quietly going late since Tuesday.
 *
 * It lands on EVERYTHING YOU'RE ON. Ryan: "I just don't want them to come in
 * already filtered and miss a ticket." So there is no organization chosen for
 * you; there is a filter you can reach for, and it is not drawn at all when
 * this person only works one organization -- a control that cannot change
 * anything is a control that teaches people the wrong thing about the screen.
 */
export default function DeskQueue({
  title, blurb, rows, queues, people, orgs, kinds, groups, contacts, outstanding,
  mePersonId, canRaise,
}: {
  title: string; blurb?: string
  rows: Row[]
  queues: (Named & { entity_id: string; facing: string })[]
  people: Who[]; orgs: Named[]; kinds: (Named & { entity_id: string })[]
  groups: Grp[]
  contacts: { id: string; name: string | null; email: string }[]
  /** ticket id → how many to-dos it is still waiting on. */
  outstanding: Record<string, number>
  mePersonId: string | null
  canRaise: boolean
}) {
  const [cut, setCut] =
    useState<'all' | 'open' | 'waiting' | 'breach' | 'unassigned' | 'mine' | 'out' | 'done'>('all')
  const [org, setOrg] = useState('')
  const [queue, setQueue] = useState('')

  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people])
  const queueOf = useMemo(() => new Map(queues.map((q) => [q.id, q.name])), [queues])
  const orgOf = useMemo(() => new Map(orgs.map((o) => [o.id, o.name])), [orgs])

  const now = Date.now()
  const late = (r: Row) => slaOf(r, now).tone === 'late'

  const count = {
    all: rows.length,
    open: rows.filter((r) => r.status === 'open').length,
    waiting: rows.filter((r) => r.status === 'waiting').length,
    breach: rows.filter(late).length,
    unassigned: rows.filter((r) => !r.assignee_id && r.status !== 'closed').length,
    mine: rows.filter((r) => r.assignee_id && r.assignee_id === mePersonId).length,
    out: rows.filter((r) => (outstanding[r.id] ?? 0) > 0).length,
    done: rows.filter((r) => r.status === 'resolved' || r.status === 'closed').length,
  }

  const shown = rows.filter((r) => {
    if (org && r.entity_id !== org) return false
    if (queue && r.queue_id !== queue) return false
    if (cut === 'open') return r.status === 'open'
    if (cut === 'waiting') return r.status === 'waiting'
    if (cut === 'breach') return late(r)
    if (cut === 'unassigned') return !r.assignee_id && r.status !== 'closed'
    if (cut === 'mine') return r.assignee_id === mePersonId
    if (cut === 'out') return (outstanding[r.id] ?? 0) > 0
    if (cut === 'done') return r.status === 'resolved' || r.status === 'closed'
    return true
  })

  // A queue chip narrows to what this person is actually on, and the picker is
  // only worth drawing when there is more than one thing to pick.
  const myQueues = useMemo(() => {
    const seen = new Set(rows.map((r) => r.queue_id))
    return queues.filter((q) => seen.has(q.id))
  }, [rows, queues])
  const myOrgs = useMemo(() => {
    const seen = new Set(rows.map((r) => r.entity_id))
    return orgs.filter((o) => seen.has(o.id))
  }, [rows, orgs])

  const live = rows.filter((r) => r.status === 'open' || r.status === 'waiting')
  const bands = groups.filter((g) => rows.some((r) => r.group_id === g.id))

  return (
    <div className="pjcol">
      <div className="pj__h">
        <div className="pj__id">
          <h1>{title}</h1>
          <p className="pjline">
            <span>{live.length === 0 ? 'Nothing open' : `${live.length} open`}</span>
            {myQueues.length > 1 && <span>across {myQueues.length} queues</span>}
            {count.breach > 0 && <span className="pjline__bad">{count.breach} past SLA</span>}
            {count.unassigned > 0 && <span>{count.unassigned} unassigned</span>}
          </p>
          {blurb && <p className="pjnote">{blurb}</p>}
        </div>
        {canRaise && (
          <div className="pj__go">
            <RaiseTicket queues={queues} people={people} kinds={kinds} contacts={contacts} />
          </div>
        )}
      </div>

      <div className="dkfil">
        <Chip on={cut === 'all'} go={() => setCut('all')} label="Everything" n={count.all} />
        <Chip on={cut === 'open'} go={() => setCut('open')} label="Open" n={count.open} />
        <Chip on={cut === 'waiting'} go={() => setCut('waiting')} label="Waiting on them" n={count.waiting} />
        <Chip on={cut === 'breach'} go={() => setCut('breach')} label="Breaching" n={count.breach} tone="bad" />
        <Chip on={cut === 'unassigned'} go={() => setCut('unassigned')} label="Unassigned" n={count.unassigned} />
        {mePersonId && <Chip on={cut === 'mine'} go={() => setCut('mine')} label="On me" n={count.mine} />}
        {/* Only when there is something to see. A supervisor wants to know how
            much of the queue is really stuck in another department. */}
        {count.out > 0 &&
          <Chip on={cut === 'out'} go={() => setCut('out')} label="Out with someone" n={count.out} />}
        <Chip on={cut === 'done'} go={() => setCut('done')} label="Resolved" n={count.done} />

        {/* Hidden when it cannot narrow anything. Ryan: "hide the org picker
            when it's not functional so users understand they can't narrow." */}
        {myOrgs.length > 1 && (
          <span className="dkfil__pick">
            <Choice name="org_filter" defaultValue="" onPick={setOrg}
                    placeholder="Every organization"
                    options={[{ value: '', label: 'Every organization' },
                              ...myOrgs.map((o) => ({ value: o.id, label: o.name }))]} />
          </span>
        )}
        {myQueues.length > 1 && (
          <span className="dkfil__pick">
            <Choice name="queue_filter" defaultValue="" onPick={setQueue}
                    placeholder="Every queue"
                    options={[{ value: '', label: 'Every queue' },
                              ...myQueues.map((q) => ({ value: q.id, label: q.name }))]} />
          </span>
        )}
      </div>

      {bands.map((g) => {
        const n = rows.filter((r) => r.group_id === g.id).length
        return (
          <div className="dkband" key={g.id}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" />
            </svg>
            <span><b>{g.name}.</b> {n} {n === 1 ? 'ticket' : 'tickets'} grouped.
              {' '}One reply answers all of them.</span>
            <button className="lnk" type="button" onClick={() => { setCut('all'); setQueue('') }}>
              {g.reason === 'outage' ? 'Outage' : g.reason === 'duplicate' ? 'Duplicates' : 'Theme'}
            </button>
          </div>
        )
      })}

      {shown.length === 0 ? (
        <p className="empty">
          {rows.length === 0
            ? 'Nothing here yet. When somebody writes in, their ticket lands in this list.'
            : 'Nothing matches that. Try a wider filter.'}
        </p>
      ) : (
        <div className="dktix">
          <div className="dktix__r dktix__hd" aria-hidden="true">
            <span>Ref</span><span>Subject</span><span>Assigned</span>
            <span>Status</span><span>Due</span><span />
          </div>
          {shown.map((r) => {
            const s = slaOf(r, now)
            const who = r.assignee_id ? nameOf.get(r.assignee_id) : null
            const grouped = r.group_id ? rows.filter((x) => x.group_id === r.group_id).length : 0
            return (
              <Link href={`/desk/${r.id}` as any} className="dktix__r" key={r.id}>
                <span className="dktix__ref tnum">{r.ref}</span>
                <span className="dktix__s">
                  <b>{r.subject}</b>
                  <span>
                    {[queueOf.get(r.queue_id),
                      myOrgs.length > 1 ? orgOf.get(r.entity_id) : null,
                      r.requester_name || r.requester_email,
                      SOURCE_WORD[r.source] ?? null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="dktix__w">
                  <span className="dkav" data-none={who ? undefined : ''}>{who ? mark(who) : '—'}</span>
                  <span>{who ?? 'Unassigned'}</span>
                </span>
                <span>
                  {(outstanding[r.id] ?? 0) > 0
                    ? <span className="dkpill dkpill--out"
                            title={`Waiting on ${outstanding[r.id]} to-do${outstanding[r.id] > 1 ? 's' : ''}`}>
                        Out · {outstanding[r.id]}
                      </span>
                    : <span className={`dkpill dkpill--${r.status}`}>{STATUS_WORD[r.status as Status]}</span>}
                </span>
                <span className={`dksla dksla--${s.tone}`}>{s.text && <i />}{s.text}</span>
                <span>{grouped > 1 && <span className="dkgrp" title="Grouped with others">{grouped}</span>}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chip({ on, go, label, n, tone }: {
  on: boolean; go: () => void; label: string; n: number; tone?: 'bad'
}) {
  return (
    <button className={`dkchip${on ? ' on' : ''}${tone === 'bad' && n > 0 ? ' dkchip--bad' : ''}`}
            type="button" onClick={go} aria-pressed={on}>
      {label}<span className="c tnum">{n}</span>
    </button>
  )
}

function mark(name: string) {
  const p = name.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}
