'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import Toggle from '@/components/Toggle'
import TicketJobs from '@/components/TicketJobs'
import { sendMessage, updateTicket, findWiki, type Found } from '@/app/actions/desk'
import {
  slaOf, STATUS_WORD, PRIORITY_WORD, SOURCE_WORD, openJobs,
  type Status, type Priority, type FieldKind, type Job,
} from '@/lib/desk'

type Msg = {
  id: string; kind: 'in' | 'out' | 'note'; body: string
  author_person_id: string | null; author_name: string | null; author_email: string | null
  at: string; task_id: string | null
}
type Trail = {
  seq: number; occurred_at: string; action: string; summary: string
  before: any; after: any; actor_name: string | null
}
type Field = {
  id: string; key: string; label: string; kind: FieldKind
  required: boolean; options: string[]; hint: string | null; sort_order: number
}
type Snippet = { id: string; title: string; body: string }
type Named = { id: string; name: string }

const WHEN = new Intl.DateTimeFormat('en-US',
  { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * A ticket.
 *
 * The conversation runs down the page and everything about the ticket sits
 * beside it, editable where it is written. Two things are deliberately not
 * separated: what was SAID (ticket_message) and what was DONE (the platform's
 * ledger, read through hopper.ticket_trail) are one timeline, because the
 * moment a ticket was reassigned matters most when read between the message
 * before it and the message after.
 */
export default function TicketPage({
  ticket, messages, trail, jobs, fields, snippets, contact, siblings,
  queues, people, kinds, groups, orgs, mePersonId,
}: {
  ticket: any; messages: Msg[]; trail: Trail[]; jobs: Job[]
  fields: Field[]; snippets: Snippet[]
  contact: { id: string; name: string | null; email: string; company: string | null; phone: string | null } | null
  siblings: { id: string; ref: string; subject: string; status: Status }[]
  queues: (Named & { entity_id: string })[]; people: { id: string; full_name: string }[]
  kinds: Named[]; groups: (Named & { reason: string })[]; orgs: Named[]
  mePersonId: string | null
}) {
  const s = slaOf(ticket)
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people])
  const queueName = queues.find((q) => q.id === ticket.queue_id)?.name ?? 'Queue'
  const orgName = orgs.find((o) => o.id === ticket.entity_id)?.name

  const feed = useMemo(() => {
    const said = messages.map((m) => ({
      t: Date.parse(m.at), msg: m as Msg, act: null as Trail | null, job: null as Line | null,
    }))

    /* Asked and finished are DERIVED, not stored: created_at with created_by is
       the ask, done_at with assignee_id is the finish. Writing marker rows for
       either would be a second copy of what the task row already says. */
    const handed: { t: number; msg: null; act: null; job: Line }[] = []
    for (const j of jobs) {
      handed.push({ t: Date.parse(j.created_at), msg: null, act: null, job: {
        who: j.created_by ? nameOf.get(j.created_by) ?? 'Somebody' : 'Somebody',
        did: 'asked', other: j.assignee_id ? nameOf.get(j.assignee_id) ?? 'somebody' : 'somebody',
        what: j.name, at: j.created_at,
      } })
      if (j.done_at) {
        handed.push({ t: Date.parse(j.done_at), msg: null, act: null, job: {
          who: j.assignee_id ? nameOf.get(j.assignee_id) ?? 'Somebody' : 'Somebody',
          did: 'finished', other: null, what: j.name, at: j.done_at,
        } })
      }
    }
    // Row-level noise is not a timeline. The ledger records every column that
    // moved; only the ones a person would say out loud are worth a line here.
    const did = trail
      .filter((a) => told(a))
      .map((a) => ({ t: Date.parse(a.occurred_at), msg: null as Msg | null, act: a, job: null as Line | null }))
    return [...said, ...did, ...handed].sort((a, b) => a.t - b.t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, trail, jobs])

  const who = ticket.assignee_id ? nameOf.get(ticket.assignee_id) : null

  return (
    <div className="tkt">
      <div className="pj__h">
        <div className="pj__id">
          <p className="tkt__up">
            <Link href="/desk">Desk</Link>
            <span>{queueName}</span>
            {orgName && <span>{orgName}</span>}
          </p>
          <h1><span className="tkt__ref tnum">{ticket.ref}</span> {ticket.subject}</h1>
          <p className="pjline">
            <span className={`dkpill dkpill--${ticket.status}`}>{STATUS_WORD[ticket.status as Status]}</span>
            {s.text && <span className={`dksla dksla--${s.tone}`}><i />{s.text}</span>}
            <span>{SOURCE_WORD[ticket.source] ?? 'raised here'}</span>
            <span>opened {WHEN.format(new Date(ticket.opened_at))}</span>
          </p>
        </div>
        <div className="pj__go">
          <Quick id={ticket.id} status={ticket.status} mine={ticket.assignee_id === mePersonId}
                 mePersonId={mePersonId} />
        </div>
      </div>

      {siblings.length > 0 && (
        <div className="dkband">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" />
          </svg>
          <span><b>{groups.find((g) => g.id === ticket.group_id)?.name ?? 'Grouped'}.</b>
            {' '}{siblings.length} other {siblings.length === 1 ? 'ticket is' : 'tickets are'} on this.</span>
        </div>
      )}

      <div className="tkt__cols">
        <section className="tkt__talk">
          {feed.map((f, i) => f.msg
            ? <Said key={f.msg.id} m={f.msg} nameOf={nameOf} />
            : f.job
            ? <Handed key={`j${i}`} l={f.job} />
            : <Did key={`a${f.act!.seq}`} a={f.act!} />)}
          {feed.length === 0 && <p className="empty">Nothing said yet.</p>}

          <Composer ticketId={ticket.id} snippets={snippets} status={ticket.status} />
        </section>

        <aside className="tkt__side">
          <TicketJobs ticketId={ticket.id} jobs={jobs} people={people} mePersonId={mePersonId} />
          <Facts ticket={ticket} queues={queues} people={people} kinds={kinds} groups={groups}
                 fields={fields} contact={contact} who={who} />
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the feed */

function Said({ m, nameOf }: { m: Msg; nameOf: Map<string, string> }) {
  const name = m.author_person_id ? nameOf.get(m.author_person_id) ?? 'Somebody'
    : m.author_name || m.author_email || 'They'
  return (
    <article className={`tmsg tmsg--${m.kind}`}>
      <header>
        <span className="dkav">{mark(name)}</span>
        <b>{name}</b>
        <span className="tmsg__k">
          {m.kind === 'in' ? 'wrote in' : m.kind === 'out' ? 'replied' : 'left a note'}
        </span>
        {m.task_id && <span className="tmsg__from">from the to-do</span>}
        <time dateTime={m.at}>{WHEN.format(new Date(m.at))}</time>
      </header>
      <div className="tmsg__b">{m.body.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)}</div>
    </article>
  )
}

/** What the ledger says, in a sentence rather than a row diff. */
function told(a: Trail): boolean {
  if (!a.after || typeof a.after !== 'object') return a.action.endsWith('.created')
  const keys = Object.keys(a.after)
  return keys.some((k) => WATCHED.has(k)) || a.action.endsWith('.created')
}
const WATCHED = new Set(['status', 'assignee_id', 'queue_id', 'priority', 'kind_id', 'group_id'])

function Did({ a }: { a: Trail }) {
  const said = a.action.endsWith('.created')
    ? 'opened it'
    : Object.keys(a.after ?? {}).filter((k) => WATCHED.has(k)).map((k) => MOVED[k] ?? k).join(' and ')
  return (
    <p className="tdid">
      <i aria-hidden="true" />
      <b>{a.actor_name ?? 'Hopper'}</b> {said || 'changed it'}
      <time dateTime={a.occurred_at}>{WHEN.format(new Date(a.occurred_at))}</time>
    </p>
  )
}
type Line = { who: string; did: 'asked' | 'finished'; other: string | null; what: string; at: string }

function Handed({ l }: { l: Line }) {
  return (
    <p className="tdid tdid--job">
      <i aria-hidden="true" />
      <b>{l.who}</b>{' '}
      {l.did === 'asked' ? <>asked {l.other} to <b>{l.what}</b></> : <>finished <b>{l.what}</b></>}
      <time dateTime={l.at}>{WHEN.format(new Date(l.at))}</time>
    </p>
  )
}

const MOVED: Record<string, string> = {
  status: 'moved it on', assignee_id: 'handed it over', queue_id: 'moved it to another queue',
  priority: 'changed how urgent it is', kind_id: 'changed what kind it is',
  group_id: 'filed it under a group',
}

/* ---------------------------------------------------------- the composer */

function Composer({ ticketId, snippets, status }: {
  ticketId: string; snippets: Snippet[]; status: Status
}) {
  const [state, action] = useFormState(sendMessage, null)
  const [kind, setKind] = useState<'out' | 'note'>('out')
  const [body, setBody] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) setBody('') }, [state])

  return (
    <form className="tcomp" action={action}>
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="tcomp__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={kind === 'out'}
                className={kind === 'out' ? 'on' : ''} onClick={() => setKind('out')}>
          Reply to them
        </button>
        <button type="button" role="tab" aria-selected={kind === 'note'}
                className={kind === 'note' ? 'on' : ''} onClick={() => setKind('note')}>
          Note for us
        </button>
        <span className="tcomp__tools">
          {snippets.length > 0 && (
            <Snip snippets={snippets} onPick={(t) => {
              setBody((b) => (b ? `${b}\n\n${t}` : t))
              box.current?.focus()
            }} />
          )}
          <Wiki />
        </span>
      </div>

      <textarea className="field tcomp__box" name="body" ref={box} rows={5}
                value={body} onChange={(e) => setBody(e.target.value)}
                placeholder={kind === 'out'
                  ? 'What you are telling them.'
                  : 'Only the desk sees this. Nothing here is sent.'} />

      <div className="tcomp__go">
        <Send kind={kind} />
        {kind === 'out' && status !== 'waiting' && (
          <Toggle name="then_wait" label="and wait on them" small />
        )}
        {kind === 'out' && status !== 'resolved' && (
          <Toggle name="then_resolve" label="and resolve it" small />
        )}
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Send({ kind }: { kind: 'out' | 'note' }) {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Sending…' : kind === 'out' ? 'Send the reply' : 'Add the note'}
    </button>
  )
}

function Snip({ snippets, onPick }: { snippets: Snippet[]; onPick: (body: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="tpop">
      <button className="lnk" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Quick responses
      </button>
      {open && (
        <div className="tpop__p" role="dialog" aria-label="Quick responses">
          {snippets.map((s) => (
            <button key={s.id} type="button" className="tpop__i"
                    onClick={() => { onPick(s.body); setOpen(false) }}>
              <b>{s.title}</b><span>{s.body.slice(0, 90)}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

/** The handbook, without leaving the reply box. */
function Wiki() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Found[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const r = await findWiki(q)
      if (alive) { setHits(r); setBusy(false) }
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [q, open])

  return (
    <span className="tpop">
      <button className="lnk" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Look it up
      </button>
      {open && (
        <div className="tpop__p" role="dialog" aria-label="Search the wiki">
          <input className="field" value={q} autoFocus placeholder="How do we…"
                 onChange={(e) => setQ(e.target.value)} />
          {busy && <p className="fine">Looking…</p>}
          {!busy && q.trim().length >= 2 && hits.length === 0 &&
            <p className="fine">Nothing in the handbook says that yet.</p>}
          {hits.map((h) => (
            <a key={h.id} className="tpop__i" href={`/wiki/${h.slug}`} target="_blank" rel="noreferrer">
              <b>{h.title}</b>{h.summary && <span>{h.summary}</span>}
            </a>
          ))}
        </div>
      )}
    </span>
  )
}

/* --------------------------------------------------------------- actions */

function Quick({ id, status, mine, mePersonId }: {
  id: string; status: Status; mine: boolean; mePersonId: string | null
}) {
  const [state, action] = useFormState(updateTicket, null)
  return (
    <div className="tkt__acts">
      {!mine && mePersonId && (
        <form action={action}>
          <input type="hidden" name="ticket_id" value={id} />
          <input type="hidden" name="assignee_id" value={mePersonId} />
          <button className="btn" type="submit">Take it</button>
        </form>
      )}
      <form action={action}>
        <input type="hidden" name="ticket_id" value={id} />
        <input type="hidden" name="status" value={status === 'resolved' || status === 'closed' ? 'open' : 'resolved'} />
        <button className="btn btn--amber" type="submit">
          {status === 'resolved' || status === 'closed' ? 'Reopen it' : 'Resolve it'}
        </button>
      </form>
      {state && !state.ok && <p className="tkt__no">{state.message}</p>}
    </div>
  )
}

/* ----------------------------------------------------------- the facts */

function Facts({ ticket, queues, people, kinds, groups, fields, contact, who }: {
  ticket: any; queues: Named[]; people: { id: string; full_name: string }[]
  kinds: Named[]; groups: (Named & { reason: string })[]; fields: Field[]
  contact: { name: string | null; email: string; company: string | null; phone: string | null } | null
  who: string | undefined | null
}) {
  const [state, action] = useFormState(updateTicket, null)
  const [answers, setAnswers] = useState<Record<string, any>>(ticket.fields ?? {})

  return (
    <form className="tfacts" action={action}>
      <input type="hidden" name="ticket_id" value={ticket.id} />
      <input type="hidden" name="fields" value={JSON.stringify(answers)} />

      <h2>This ticket</h2>

      <label htmlFor="tf-q">Queue</label>
      <Choice id="tf-q" name="queue_id" defaultValue={ticket.queue_id}
              options={queues.map((q) => ({ value: q.id, label: q.name }))} />

      <label htmlFor="tf-a">Who has it</label>
      <Choice id="tf-a" name="assignee_id" defaultValue={ticket.assignee_id ?? ''}
              placeholder="Nobody yet"
              options={[{ value: '', label: 'Nobody yet' },
                        ...people.map((p) => ({ value: p.id, label: p.full_name }))]} />

      <label htmlFor="tf-s">Where it is</label>
      <Choice id="tf-s" name="status" defaultValue={ticket.status}
              options={Object.entries(STATUS_WORD).map(([v, l]) => ({ value: v, label: l }))} />

      <label htmlFor="tf-p">How urgent</label>
      <Choice id="tf-p" name="priority" defaultValue={ticket.priority}
              options={Object.entries(PRIORITY_WORD).map(([v, l]) => ({ value: v, label: l }))} />

      <label htmlFor="tf-k">What kind</label>
      <Choice id="tf-k" name="kind_id" defaultValue={ticket.kind_id ?? ''} placeholder="Not set"
              options={[{ value: '', label: 'Not set' },
                        ...kinds.map((k) => ({ value: k.id, label: k.name }))]} />

      {groups.length > 0 && (
        <>
          <label htmlFor="tf-g">Filed under</label>
          <Choice id="tf-g" name="group_id" defaultValue={ticket.group_id ?? ''} placeholder="On its own"
                  options={[{ value: '', label: 'On its own' },
                            ...groups.map((g) => ({ value: g.id, label: g.name, hint: g.reason }))]} />
        </>
      )}

      {fields.length > 0 && (
        <>
          <h2>{kinds.find((k) => k.id === ticket.kind_id)?.name ?? 'Details'}</h2>
          {fields.map((f) => (
            <FieldBit key={f.id} f={f} value={answers[f.key]}
                      set={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
          ))}
        </>
      )}

      <h2>Who is asking</h2>
      <p className="tfacts__who">
        <b>{contact?.name || ticket.requester_name || contact?.email || ticket.requester_email || 'Somebody inside'}</b>
        {(contact?.email || ticket.requester_email) &&
          <span>{contact?.email ?? ticket.requester_email}</span>}
        {contact?.company && <span>{contact.company}</span>}
        {contact?.phone && <span>{contact.phone}</span>}
      </p>

      <div className="rowacts">
        <Save />
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function FieldBit({ f, value, set }: { f: Field; value: any; set: (v: any) => void }) {
  const id = `tfx-${f.key}`
  if (f.kind === 'toggle') {
    return (
      <div className="tfacts__tog">
        <Toggle label={f.label} checked={!!value} onChange={set} />
      </div>
    )
  }
  return (
    <>
      <label htmlFor={id}>{f.label}{f.required && <em> · needed</em>}</label>
      {f.kind === 'choice' ? (
        <Choice id={id} name={`x_${f.key}`} defaultValue={value ?? ''} placeholder="Choose one"
                onPick={set} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
      ) : f.kind === 'long' ? (
        <textarea className="field" id={id} rows={3} value={value ?? ''}
                  onChange={(e) => set(e.target.value)} placeholder={f.hint ?? ''} />
      ) : (
        <input className="field" id={id}
               type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
               value={value ?? ''} onChange={(e) => set(e.target.value)} placeholder={f.hint ?? ''} />
      )}
    </>
  )
}

function Save() {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Saving…' : 'Save'}
  </button>
}

function mark(name: string) {
  const p = name.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}
