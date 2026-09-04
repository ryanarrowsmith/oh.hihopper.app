'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import Toggle from '@/components/Toggle'
import { saveCompany } from '@/app/actions/desk'
import { TicketList, History, mark, ago, type Tick } from '@/components/ContactBits'
import type { CompanyRow } from '@/lib/deskdata'

type Person = { id: string; email: string; name: string | null; phone: string | null; active: boolean }

/**
 * A company: every ticket from everyone who works there.
 *
 * This is the page a contact page cannot be. Three people at Acme Brick raising
 * the same complaint about the same route is a pattern that is invisible one
 * person at a time, and it is the reason a company is a record here rather than
 * a line of text on a contact.
 */
export default function CompanyPage({ company, people, tickets, queues }: {
  company: CompanyRow; people: Person[]; tickets: Tick[]
  queues: { id: string; name: string }[]
}) {
  const [cut, setCut] = useState<'all' | 'open' | 'done'>('all')
  const [who, setWho] = useState('')
  const [editing, setEditing] = useState(false)

  const nameOf = useMemo(
    () => new Map(people.map((p) => [p.id, p.name || p.email])), [people])
  const lastOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tickets) {
      if (!t.contact_id) continue
      const cur = m.get(t.contact_id)
      if (!cur || t.opened_at > cur) m.set(t.contact_id, t.opened_at)
    }
    return m
  }, [tickets])

  const live = tickets.filter((t) => t.status === 'open' || t.status === 'waiting')
  const done = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed')
  const byCut = cut === 'open' ? live : cut === 'done' ? done : tickets
  const shown = who ? byCut.filter((t) => t.contact_id === who) : byCut

  return (
    <div className="pjcol dkcol">
      <p className="tkt__up noprint">
        <Link href="/desk">Desk</Link>
        <Link href="/desk/contacts">Contacts</Link>
      </p>

      <div className="chead">
        <span className="cav cav--co">{mark(company.name)}</span>
        <div className="chead__n">
          <h1>{company.name}</h1>
          <p>
            <span>{people.filter((p) => p.active).length}
              {people.filter((p) => p.active).length === 1 ? ' person writes in' : ' people write in'}</span>
            {company.domain && <span>{company.domain}</span>}
            <span>{tickets.length} tickets all time</span>
            {!company.active && <span className="cwarn">Not in use</span>}
          </p>
        </div>
        <div className="chead__a noprint">
          <button className="btn btn--icon" type="button" data-tip="Print this"
                  aria-label="Print this" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="8" rx="1.5" />
              <path d="M7 14h10v7H7z" />
            </svg><span className="btn__w">Print</span>
          </button>
          <button className="btn" type="button" onClick={() => setEditing(!editing)}
                  aria-expanded={editing}>{editing ? 'Never mind' : 'Edit'}</button>
        </div>
      </div>

      {editing && (
        <div className="cedit"><Edit company={company} onSaved={() => setEditing(false)} /></div>
      )}

      <History rows={tickets} />

      {company.note && <p className="cnote"><b>Note.</b> {company.note}</p>}

      <h2 className="csub">Who writes in from here</h2>
      <div className="cpeople">
        {people.map((p) => (
          <div className={`cperson${who === p.id ? ' on' : ''}${p.active ? '' : ' off'}`} key={p.id}>
            <button type="button" className="cperson__b" aria-pressed={who === p.id}
                    onClick={() => setWho(who === p.id ? '' : p.id)}>
              <span className="dkav" data-none={p.name ? undefined : ''}>
                {p.name ? mark(p.name) : '?'}</span>
              <span className="cperson__t">
                <b>{p.name || p.email}</b>
                <span>{tickets.filter((t) => t.contact_id === p.id).length} tickets ·
                  {' '}last {ago(lastOf.get(p.id) ?? null)}</span>
              </span>
            </button>
            <Link className="lnk cperson__go" href={`/desk/contacts/${p.id}` as any}>Open</Link>
          </div>
        ))}
        {people.length === 0 &&
          <p className="empty">Nobody is filed under this company yet.</p>}
      </div>

      <div className="dkfil noprint">
        <Chip on={cut === 'all'} go={() => setCut('all')} label="Everything" n={tickets.length} />
        <Chip on={cut === 'open'} go={() => setCut('open')} label="Open" n={live.length} />
        <Chip on={cut === 'done'} go={() => setCut('done')} label="Resolved" n={done.length} />
        {who && (
          <button className="dkchip on" type="button" onClick={() => setWho('')}>
            Only {nameOf.get(who)} <span className="c">&times;</span>
          </button>
        )}
      </div>

      <div className="printonly printhead">
        <p className="printhead__m">Hopper · Desk</p>
        <h2>{company.name}</h2>
        <p className="printhead__l">
          <span>{people.length} people</span><span>{tickets.length} tickets</span>
          {company.domain && <span>{company.domain}</span>}
        </p>
      </div>

      <TicketList rows={shown} queues={queues} who={nameOf} />
    </div>
  )
}

function Chip({ on, go, label, n }: { on: boolean; go: () => void; label: string; n: number }) {
  return (
    <button className={`dkchip${on ? ' on' : ''}`} type="button" onClick={go} aria-pressed={on}>
      {label}<span className="c tnum">{n}</span>
    </button>
  )
}

function Edit({ company, onSaved }: { company: CompanyRow; onSaved: () => void }) {
  const [state, action] = useFormState(saveCompany, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onSaved() }, [state])

  return (
    <form action={action} className="dkform">
      <input type="hidden" name="id" value={company.id} />
      <input type="hidden" name="entity_id" value={company.entity_id} />
      <div className="formrow">
        <div>
          <label htmlFor="co-n">What they are called</label>
          <input className="field" id="co-n" name="name" required maxLength={160} autoFocus
                 defaultValue={company.name} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="co-d">Their email domain</label>
          <input className="field" id="co-d" name="domain" maxLength={120}
                 defaultValue={company.domain ?? ''} placeholder="acmebrick.com" autoComplete="off" />
          <p className="fine">
            Anybody new writing in from this domain is filed here without anybody deciding
            to. Leave it blank for a company whose people use their own addresses.
          </p>
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="co-note">Anything worth knowing</label>
          <textarea className="field" id="co-note" name="note" rows={3}
                    defaultValue={company.note ?? ''} />
        </div>
      </div>
      <div className="dktogs">
        <Toggle name="active" label="Still a customer" defaultChecked={company.active} />
      </div>
      <div className="rowacts"><Go /></div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Saving…' : 'Save'}
  </button>
}
