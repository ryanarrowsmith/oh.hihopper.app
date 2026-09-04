'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import Toggle from '@/components/Toggle'
import { saveContact, saveCompany, importContacts } from '@/app/actions/desk'
import { mark, ago } from '@/components/ContactBits'
import type { ContactRow, CompanyRow } from '@/lib/deskdata'

type Count = { open: number; all: number; last: string | null }

/**
 * Everyone who writes in.
 *
 * Most of these rows made themselves, the first time an address sent something
 * in — so this screen is mostly for looking somebody up, and only occasionally
 * for adding one. Which is why the counts are the loud part of a row and the
 * Add button is not.
 */
export default function Contacts({ contacts, companies, counts, orgs }: {
  contacts: ContactRow[]; companies: CompanyRow[]
  counts: Record<string, Count>; orgs: { id: string; name: string }[]
}) {
  const [cut, setCut] = useState<'all' | 'open' | 'quiet' | 'never' | 'off'>('all')
  const [q, setQ] = useState('')
  const [org, setOrg] = useState('')

  const coOf = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies])
  const now = Date.now()
  const at = (id: string) => counts[id] ?? { open: 0, all: 0, last: null }
  const quiet = (id: string) => {
    const l = at(id).last
    return !l || now - Date.parse(l) > 90 * 86400000
  }

  const myOrgs = useMemo(() => {
    const seen = new Set(contacts.map((c) => c.entity_id))
    return orgs.filter((o) => seen.has(o.id))
  }, [contacts, orgs])

  const count = {
    all: contacts.filter((c) => c.active).length,
    open: contacts.filter((c) => c.active && at(c.id).open > 0).length,
    quiet: contacts.filter((c) => c.active && at(c.id).all > 0 && quiet(c.id)).length,
    never: contacts.filter((c) => c.active && at(c.id).all === 0).length,
    off: contacts.filter((c) => !c.active).length,
  }

  const term = q.trim().toLowerCase()
  const shown = contacts.filter((c) => {
    if (org && c.entity_id !== org) return false
    if (cut === 'off') { if (c.active) return false } else if (!c.active) return false
    if (cut === 'open' && at(c.id).open === 0) return false
    if (cut === 'quiet' && !(at(c.id).all > 0 && quiet(c.id))) return false
    if (cut === 'never' && at(c.id).all > 0) return false
    if (term) {
      const co = c.company_id ? coOf.get(c.company_id)?.name ?? '' : ''
      if (!`${c.name ?? ''} ${c.email} ${co}`.toLowerCase().includes(term)) return false
    }
    return true
  }).sort((a, b) => (at(b.id).last ?? '').localeCompare(at(a.id).last ?? ''))

  return (
    <div className="pjcol dkcol">
      <div className="pj__h noprint">
        <div className="pj__id">
          <h1>Contacts</h1>
          <p className="pjline">
            <span>{count.all} {count.all === 1 ? 'person' : 'people'}</span>
            {count.open > 0 && <span>{count.open} with something open</span>}
            {companies.filter((c) => c.active).length > 0 &&
              <span>{companies.filter((c) => c.active).length} companies</span>}
          </p>
        </div>
        <div className="pj__go">
          <div className="dkacts">
            <button className="btn btn--icon" type="button" data-tip="Print this list"
                    aria-label="Print this list" onClick={() => window.print()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 8V3h10v5" /><rect x="3" y="8" width="18" height="8" rx="1.5" />
                <path d="M7 14h10v7H7z" />
              </svg><span className="btn__w">Print</span>
            </button>
            <Bring orgs={orgs} />
            <Adding orgs={orgs} companies={companies} />
          </div>
        </div>
      </div>

      <div className="printonly printhead">
        <p className="printhead__m">Hopper · Desk</p>
        <h2>Contacts</h2>
        <p className="printhead__l"><span>{shown.length} of {contacts.length}</span></p>
      </div>

      <div className="dkfil">
        <input className="field cfind" value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Find a name, an address, a company" aria-label="Find a contact" />
        <Chip on={cut === 'all'} go={() => setCut('all')} label="Everyone" n={count.all} />
        <Chip on={cut === 'open'} go={() => setCut('open')} label="Something open" n={count.open} />
        <Chip on={cut === 'quiet'} go={() => setCut('quiet')} label="Quiet 90 days" n={count.quiet} />
        <Chip on={cut === 'never'} go={() => setCut('never')} label="Never written" n={count.never} />
        {count.off > 0 &&
          <Chip on={cut === 'off'} go={() => setCut('off')} label="Not in use" n={count.off} />}
        {myOrgs.length > 1 && (
          <span className="dkfil__pick">
            <Choice name="c_org" defaultValue="" onPick={setOrg} placeholder="Every organization"
                    options={[{ value: '', label: 'Every organization' },
                              ...myOrgs.map((o) => ({ value: o.id, label: o.name }))]} />
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty">
          {contacts.length === 0
            ? 'Nobody yet. A contact makes itself the first time an address writes in — or bring a list over with Import.'
            : 'Nobody matches that.'}
        </p>
      ) : (
        <div className="clist">
          <div className="crow crow--hd" aria-hidden="true">
            <span>Who</span><span>Company</span><span>Open</span><span>All time</span><span>Last heard</span>
          </div>
          {shown.map((c) => {
            const n = at(c.id)
            const co = c.company_id ? coOf.get(c.company_id) : null
            return (
              <Link href={`/desk/contacts/${c.id}` as any} className="crow" key={c.id}>
                <span className="cwho">
                  <span className="dkav" data-none={c.name ? undefined : ''}>
                    {c.name ? mark(c.name) : '?'}</span>
                  <span className="cwho__t">
                    <b>{c.name || c.email}</b>
                    <span>{c.name ? c.email : 'No name yet — came in by email'}
                      {c.phone ? ` · ${c.phone}` : ''}</span>
                  </span>
                </span>
                <span className="cco">{co
                  ? co.name
                  : <em>—</em>}</span>
                <span className={`cnum${n.open ? '' : ' cnum--none'}`}>
                  {n.open ? <b>{n.open}</b> : 0}</span>
                <span className="cnum">{n.all}</span>
                <span className="cnum">{ago(n.last, now)}</span>
              </Link>
            )
          })}
        </div>
      )}
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

/* ------------------------------------------------------------- adding one */

function Adding({ orgs, companies }: { orgs: { id: string; name: string }[]; companies: CompanyRow[] }) {
  const [open, setOpen] = useState(false)
  const pop = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useAway(open, () => setOpen(false), pop, btn)

  return (
    <span className="sec__a">
      <button className="btn btn--amber" type="button" ref={btn} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>New contact
      </button>
      {open && (
        <div className="addpop" ref={pop} role="dialog" aria-label="New contact">
          <div className="addpop__h">
            <b>New contact</b>
            <button className="addpop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </div>
          <div className="addpop__body">
            <ContactForm orgs={orgs} companies={companies} onSaved={() => setOpen(false)} />
          </div>
        </div>
      )}
    </span>
  )
}

function ContactForm({ orgs, companies, onSaved }: {
  orgs: { id: string; name: string }[]; companies: CompanyRow[]; onSaved: () => void
}) {
  const [state, action] = useFormState(saveContact, null)
  const [org, setOrg] = useState(orgs[0]?.id ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onSaved() }, [state])
  const mine = companies.filter((c) => c.active && c.entity_id === org)

  return (
    <form action={action}>
      <div className="formrow formrow--one">
        <div>
          <label htmlFor="nc-e">Their email address</label>
          <input className="field" id="nc-e" name="email" type="email" required maxLength={200}
                 autoFocus placeholder="pat@acmebrick.com" autoComplete="off" />
        </div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="nc-n">Their name</label>
          <input className="field" id="nc-n" name="name" maxLength={120}
                 placeholder="Optional — you can fill it in later" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="nc-p">Phone</label>
          <input className="field" id="nc-p" name="phone" maxLength={40}
                 placeholder="Optional" autoComplete="off" />
        </div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="nc-o">Whose contact</label>
          <Choice id="nc-o" name="entity_id" required defaultValue={org} onPick={setOrg}
                  options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
        </div>
        <div>
          <label htmlFor="nc-c">Company</label>
          <Choice id="nc-c" name="company_id" defaultValue="" placeholder="On their own"
                  options={[{ value: '', label: 'On their own' },
                            ...mine.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
      </div>
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="nc-note">Anything worth knowing</label>
          <textarea className="field" id="nc-note" name="note" rows={2}
                    placeholder="Gate code is on every work order — do not ask again." />
        </div>
      </div>
      <div className="rowacts"><Go label="Add them" /></div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/* ---------------------------------------------------- bringing a list over */

function Bring({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  const [state, action] = useFormState(importContacts, null)
  const pop = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useAway(open, () => setOpen(false), pop, btn)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])

  return (
    <span className="sec__a">
      <button className="btn" type="button" ref={btn} aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M4 19h16" />
        </svg>Import
      </button>
      {open && (
        <div className="addpop addpop--wide" ref={pop} role="dialog" aria-label="Import contacts">
          <div className="addpop__h">
            <b>Bring a list over</b>
            <button className="addpop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </div>
          <div className="addpop__body">
            <form action={action}>
              <div className="formrow formrow--one">
                <div>
                  <label htmlFor="im-o">Whose contacts these are</label>
                  <Choice id="im-o" name="entity_id" required defaultValue={orgs[0]?.id ?? ''}
                          options={orgs.map((o) => ({ value: o.id, label: o.name }))} />
                </div>
              </div>
              <div className="formrow formrow--one" style={{ marginTop: 12 }}>
                <div>
                  <label htmlFor="im-r">Paste them here</label>
                  <textarea className="field" id="im-r" name="rows" rows={8} required
                            style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
                            placeholder={'email, name, company, phone\npat@acmebrick.com, Pat Crowder, Acme Brick, (918) 555-0142'} />
                  <p className="fine">
                    Straight out of a spreadsheet — commas or tabs, header row optional. The
                    address is the only column that has to be there. Anybody already on file
                    is left exactly as they are, so an import can never overwrite something
                    somebody has since corrected by hand.
                  </p>
                </div>
              </div>
              <div className="rowacts"><Go label="Bring them in" /></div>
              {state && !state.ok && <p className="swhy">{state.message}</p>}
            </form>
          </div>
        </div>
      )}
    </span>
  )
}

/* ----------------------------------------------------------------- shared */

export function useAway(
  open: boolean, close: () => void,
  pop: React.RefObject<HTMLElement>, btn: React.RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // A Choice renders its list into <body>; clicking one is not clicking away.
      if (t.closest?.('.choicepop')) return
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Saving…' : label}
  </button>
}
