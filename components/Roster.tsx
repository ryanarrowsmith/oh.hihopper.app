'use client'
import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { importPeople, removePeople, type Landed } from '@/app/actions/roster'

export type Row = {
  id: string; name: string; email: string | null; role: string | null; phone: string | null
  entity: string | null; department: string | null; location: string | null
  manager: string | null; canSignIn: boolean; active: boolean
}

export default function Roster({ people, mayEdit }: { people: Row[]; mayEdit: boolean }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [landed, land] = useFormState(importPeople, null)
  const [removed, remove] = useFormState(removePeople, null)
  const [paste, setPaste] = useState('')
  const [open, setOpen] = useState(false)

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return people
    return people.filter((p) => [p.name, p.email, p.role, p.department, p.entity, p.location]
      .some((v) => v?.toLowerCase().includes(t)))
  }, [people, q])

  return (
    <>
      {mayEdit && (
        <section className="sec">
          <div className="sec__h">
            <div className="sec__t">
              <h2>Add people in bulk</h2>
              <p>
                Paste rows straight out of a spreadsheet, or drop a CSV in. Every column but the
                name is optional — a file with only names and emails imports fine, and anything
                missing is simply left empty.
              </p>
            </div>
            <div className="sec__a">
              <a className="btn" href="/admin/people/template" download>Download the template</a>
              <button className="btn btn--amber" type="button" onClick={() => setOpen((o) => !o)}>
                {open ? 'Close' : 'Import'}
              </button>
            </div>
          </div>

          {open && (
            <form action={land} className="card" style={{ padding: 16 }}>
              <label htmlFor="rs-rows">The rows</label>
              <textarea className="field" id="rs-rows" name="rows" rows={9} value={paste}
                        onChange={(e) => setPaste(e.target.value)}
                        placeholder={'Name,Email,Role,Department,Organization,Phone,Manager,Location\nDana Whitfield,dana@example.com,Dispatcher,Dispatch,On Call Services and Rentals,,Tom Vickers,Tulsa Yard'} />
              <p className="hint">
                Headers are matched loosely — <b>Email</b>, <b>Email Address</b> and <b>e-mail</b> are
                the same column, and any column Hopper does not recognise is ignored rather than
                refused. Somebody already on the roster is matched by email, then by name, and
                updated rather than duplicated.
              </p>

              <div style={{ marginTop: 12 }}>
                <label htmlFor="rs-file">…or a file</label>
                {/* Read in the browser and dropped into the same box: one path
                    through the parser, so a pasted roster and an uploaded one
                    cannot behave differently. */}
                <input className="field" id="rs-file" type="file" accept=".csv,.tsv,.txt,text/csv"
                       onChange={async (e) => {
                         const f = e.target.files?.[0]
                         if (f) setPaste(await f.text())
                       }} />
              </div>

              <div className="formgrid__go" style={{ marginTop: 14 }}><Go label="Import them" /></div>

              {landed && <Report landed={landed} />}
            </form>
          )}
        </section>
      )}

      <section className="sec">
        <div className="sec__h">
          <div className="sec__t">
            <h2>The roster</h2>
            <p>{people.length} {people.length === 1 ? 'person' : 'people'}.
              Somebody who can sign in is marked, and is removed under Users rather than here.</p>
          </div>
          <div className="sec__a">
            <input className="field" style={{ width: 200 }} value={q} placeholder="Find somebody"
                   onChange={(e) => setQ(e.target.value)} aria-label="Find somebody" />
          </div>
        </div>

        {shown.length === 0 ? <p className="empty">Nobody matches.</p> : (
          <form action={remove}>
            <div className={`rlist2 rlist--roster${mayEdit ? ' rlist--pick' : ''}`}>
              <div className="rhead">
                <span />
                <span>Name</span><span>Role</span><span>Department</span>
                <span>Organization</span><span>Manager</span><span>Contact</span>
              </div>
              {shown.map((p) => (
                <label className="rrow" key={p.id}>
                  <span>
                    {mayEdit && !p.canSignIn && (
                      <input type="checkbox" name="id" value={p.id}
                             checked={picked.has(p.id)}
                             onChange={() => setPicked((s) => {
                               const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n
                             })} aria-label={`Choose ${p.name}`} />
                    )}
                  </span>
                  <span className="rrow__n">{p.name}
                    {p.canSignIn && <em className="pill" style={{ marginLeft: 7 }}>Can sign in</em>}
                  </span>
                  <span>{p.role ?? '—'}</span>
                  <span>{p.department ?? '—'}</span>
                  <span>{p.entity ?? '—'}</span>
                  <span>{p.manager ?? '—'}</span>
                  <span className="rcell--thin">{p.email ?? p.phone ?? '—'}</span>
                </label>
              ))}
            </div>

            {mayEdit && picked.size > 0 && (
              <div className="pickfloat" role="region" aria-label="Chosen people">
                <b>{picked.size}</b> chosen
                <button className="lnk" type="button" onClick={() => setPicked(new Set())}>Clear</button>
                <button className="btn btn--danger" type="submit">Remove them</button>
              </div>
            )}
            {removed && <Report landed={removed} />}
          </form>
        )}
      </section>
    </>
  )
}

/**
 * What happened, per row.
 *
 * An import that says only "12 added" is an import nobody can trust: the
 * question is always which ones did not land, and why. Refusals are named
 * individually; the softer misses -- a department Hopper could not find -- are
 * gathered once rather than repeated on forty rows.
 */
function Report({ landed }: { landed: Landed }) {
  return (
    <div style={{ marginTop: 14 }}>
      <p className={`note ${landed.ok ? 'note--ok' : 'note--err'}`}>{landed.message}</p>
      {landed.notes && landed.notes.length > 0 && (
        <ul className="fine" style={{ margin: '10px 0 0 18px' }}>
          {landed.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      {landed.refused && landed.refused.length > 0 && (
        <div className="rlist2" style={{ marginTop: 10 }}>
          {landed.refused.map((r, i) => (
            <div className="rrow" key={i}>
              <span className="rrow__c">{r.line ? `Row ${r.line}` : '—'}</span>
              <span className="rrow__n">{r.who}</span>
              <span className="rrow__f">{r.why}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Reading…' : label}
  </button>
}
