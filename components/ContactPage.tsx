'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import Toggle from '@/components/Toggle'
import CrumbTail from '@/components/CrumbTail'
import { saveContact } from '@/app/actions/desk'
import { TicketList, History, mark, LONG, type Tick } from '@/components/ContactBits'
import type { ContactRow, CompanyRow } from '@/lib/deskdata'

/**
 * One person, and everything they have ever raised.
 *
 * The whole point of the page is the pattern: four of the last six on the same
 * address, three invoice queries in a month. None of that is visible one ticket
 * at a time, which is why the list is the page and the details are a panel
 * beside it rather than the other way round.
 */
export default function ContactPage({ contact, company, companies, tickets, queues, kinds }: {
  contact: ContactRow; company: { id: string; name: string; domain: string | null } | null
  companies: CompanyRow[]; tickets: Tick[]
  queues: { id: string; name: string }[]; kinds: { id: string; name: string }[]
}) {
  const [cut, setCut] = useState<'all' | 'open' | 'done'>('all')
  const [editing, setEditing] = useState(false)

  const live = tickets.filter((t) => t.status === 'open' || t.status === 'waiting')
  const done = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed')
  const shown = cut === 'open' ? live : cut === 'done' ? done : tickets

  return (
    <div className="pjcol dkcol">
      {/* The layout already draws the trail. A second one under it was two
          breadcrumbs saying nearly the same thing; this hands the real one the
          name it could not know, because the page lives at a uuid. */}
      <CrumbTail>{contact.name || contact.email}</CrumbTail>

      <div className="chead">
        <span className="cav" data-none={contact.name ? undefined : ''}>
          {contact.name ? mark(contact.name) : '?'}</span>
        <div className="chead__n">
          <h1>{contact.name || contact.email}</h1>
          <p>
            {company && <span><Link href={`/desk/companies/${company.id}` as any}>{company.name}</Link></span>}
            <span><a href={`mailto:${contact.email}`}>{contact.email}</a></span>
            {contact.phone && <span>{contact.phone}</span>}
            <span>first here {LONG.format(new Date(contact.created_at))}</span>
            {!contact.active && <span className="cwarn">Not in use</span>}
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
        <div className="cedit">
          <Edit contact={contact} companies={companies} onSaved={() => setEditing(false)} />
        </div>
      )}

      <History rows={tickets} />

      {contact.note && <p className="cnote"><b>Note.</b> {contact.note}</p>}

      <div className="dkfil noprint">
        <Chip on={cut === 'all'} go={() => setCut('all')} label="Everything" n={tickets.length} />
        <Chip on={cut === 'open'} go={() => setCut('open')} label="Open" n={live.length} />
        <Chip on={cut === 'done'} go={() => setCut('done')} label="Resolved" n={done.length} />
      </div>

      <div className="printonly printhead">
        <p className="printhead__m">Hopper · Desk</p>
        <h2>{contact.name || contact.email}</h2>
        <p className="printhead__l">
          {company && <span>{company.name}</span>}
          <span>{contact.email}</span>
          {contact.phone && <span>{contact.phone}</span>}
          <span>{tickets.length} tickets</span>
        </p>
      </div>

      <TicketList rows={shown} queues={queues} />
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

function Edit({ contact, companies, onSaved }: {
  contact: ContactRow; companies: CompanyRow[]; onSaved: () => void
}) {
  const [state, action] = useFormState(saveContact, null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onSaved() }, [state])
  const mine = companies.filter((c) => c.active || c.id === contact.company_id)

  return (
    <form action={action} className="dkform">
      <input type="hidden" name="id" value={contact.id} />
      <input type="hidden" name="entity_id" value={contact.entity_id} />
      <input type="hidden" name="email" value={contact.email} />

      <div className="formrow">
        <div>
          <label htmlFor="ce-n">Their name</label>
          <input className="field" id="ce-n" name="name" maxLength={120} autoFocus
                 defaultValue={contact.name ?? ''} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ce-p">Phone</label>
          <input className="field" id="ce-p" name="phone" maxLength={40}
                 defaultValue={contact.phone ?? ''} autoComplete="off" />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="ce-c">Company</label>
          <Choice id="ce-c" name="company_id" defaultValue={contact.company_id ?? ''}
                  placeholder="On their own"
                  options={[{ value: '', label: 'On their own' },
                            ...mine.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="ce-note">Anything worth knowing</label>
          <textarea className="field" id="ce-note" name="note" rows={3}
                    defaultValue={contact.note ?? ''} />
        </div>
      </div>
      <div className="dktogs">
        <Toggle name="active" label="Still someone you deal with" defaultChecked={contact.active} />
      </div>
      <p className="fine">
        The address is the identity, so it is not editable — a different address is a
        different contact. Two that turn out to be the same person is a merge, which
        Hopper does not do yet.
      </p>
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
