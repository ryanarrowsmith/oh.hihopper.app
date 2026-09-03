'use client'
import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import { importPeople, movePeople, setPeopleActive, type Landed } from '@/app/actions/roster'
import { createPerson } from '@/app/actions/admin'

export type Row = {
  id: string; name: string; email: string | null; role: string | null; phone: string | null
  entity: string | null; entityId: string | null
  department: string | null; location: string | null
  manager: string | null; canSignIn: boolean; invited: boolean; active: boolean
}
type Named = { id: string; name: string }

const I = (d: string, w = '1.9') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const SEARCH = '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
const TICK   = '<path d="M4 12.5l5 5L20 6.5"/>'
const MAIL   = '<rect x="2.6" y="5" width="18.8" height="14" rx="1.6"/><path d="m3 6.4 9 6.2 9-6.2"/>'
const MINUS  = '<path d="M5 12h14"/>'
const PLUS   = '<path d="M12 5v14M5 12h14"/>'
const UP     = '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2)
  .map((w) => w[0]?.toUpperCase() ?? '').join('') || '—'

/** Roster only, invited, signs in — three states, and the difference between
 *  them is the whole reason People and Users used to be two screens. */
function Sign({ p }: { p: Row }) {
  if (p.canSignIn) return <span className="sign sign--in">{I(TICK, '2.4')}Signs in</span>
  if (p.invited) return <span className="sign sign--wait">{I(MAIL, '2')}Invited</span>
  return <span className="sign sign--no">{I(MINUS, '2.4')}Roster only</span>
}

type Filter = 'all' | 'signin' | 'never' | 'off'

/**
 * The roster, and the only screen that decides who is on it.
 *
 * People and Users used to be two screens over one table, with the actions
 * split between them: you could import fifty and not add one, and you could add
 * one and not turn anybody off. Being on the roster and being able to sign in
 * are genuinely two different things -- so they are two columns here, not two
 * screens.
 */
export default function Roster({ people, orgs, depts, mayEdit }: {
  people: Row[]; orgs: Named[]; depts: (Named & { entityId: string })[]; mayEdit: boolean
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<'import' | 'add' | 'move' | null>(null)
  const [paste, setPaste] = useState('')
  const [landed, land] = useFormState(importPeople, null)
  const [flipped, flip] = useFormState(setPeopleActive, null)
  const [moved, move] = useFormState(movePeople, null)

  const counts = useMemo(() => ({
    all: people.filter((p) => p.active).length,
    signin: people.filter((p) => p.active && p.canSignIn).length,
    never: people.filter((p) => p.active && !p.canSignIn && !p.invited).length,
    off: people.filter((p) => !p.active).length,
  }), [people])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return people.filter((p) => {
      if (filter === 'off') { if (p.active) return false }
      else if (!p.active) return false
      if (filter === 'signin' && !p.canSignIn) return false
      if (filter === 'never' && (p.canSignIn || p.invited)) return false
      if (!t) return true
      return [p.name, p.email, p.role, p.department, p.entity, p.location]
        .some((v) => v?.toLowerCase().includes(t))
    })
  }, [people, q, filter])

  const pick = (id: string) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allShown = shown.length > 0 && shown.every((p) => picked.has(p.id))
  const anyOff = [...picked].some((id) => people.find((p) => p.id === id)?.active === false)

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>People</h1>
          <p className="scopeline"><span>
            Everyone the business employs. Being on the roster and being able to sign in are two
            different things, and both are set here.
          </span></p>
        </div>
        {mayEdit && (
          <div className="hi__go">
            <button className="btn" type="button"
                    onClick={() => setOpen(open === 'import' ? null : 'import')}>
              {I(UP, '1.8')}Import
            </button>
            <button className="btn btn--amber" type="button"
                    onClick={() => setOpen(open === 'add' ? null : 'add')}>
              {I(PLUS, '1.8')}Add somebody
            </button>
          </div>
        )}
      </div>

      {open === 'add' && (
        <AddOne orgs={orgs} depts={depts} onDone={() => setOpen(null)} />
      )}

      {open === 'import' && (
        <form action={land} className="card" style={{ padding: 16, marginTop: 14 }}>
          <label htmlFor="rs-rows">Paste rows, straight out of a spreadsheet</label>
          <textarea className="field" id="rs-rows" name="rows" rows={8} value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder={'Name,Email,Role,Department,Organization,Phone,Manager,Location\nDana Whitfield,dana@example.com,Dispatcher,Dispatch,On Call Services and Rentals,,Tom Vickers,Tulsa Yard'} />
          <p className="hint">
            Headers are matched loosely — <b>Email</b>, <b>Email Address</b> and <b>e-mail</b> are
            the same column, and anything Hopper does not recognise is ignored rather than refused.
            Somebody already on the roster is matched by email, then by name, and updated rather
            than duplicated.
          </p>
          <div style={{ marginTop: 12 }}>
            <label htmlFor="rs-file">…or drop a file in</label>
            <input className="field" id="rs-file" type="file" accept=".csv,.tsv,.txt,text/csv"
                   onChange={async (e) => {
                     const f = e.target.files?.[0]
                     if (f) setPaste(await f.text())
                   }} />
          </div>
          <div className="rowacts" style={{ marginTop: 14 }}>
            <Go label="Import them" busy="Reading…" />
            <a className="btn" href="/admin/people/template" download>Download the template</a>
            <button className="btn" type="button" onClick={() => setOpen(null)}>Close</button>
          </div>
          {landed && <Report landed={landed} />}
        </form>
      )}

      <div className="rosbar">
        <span className="rosbar__f">
          {I(SEARCH, '2')}
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="Name, email, role…" aria-label="Find somebody" />
        </span>
        <span className="chipbar">
          {([['all', 'Everyone'], ['signin', 'Can sign in'],
             ['never', 'Never invited'], ['off', 'Inactive']] as [Filter, string][])
            .map(([k, label]) => (
              <button key={k} type="button" className={`chip2${filter === k ? ' is-on' : ''}`}
                      onClick={() => { setFilter(k); setPicked(new Set()) }}>
                {label}<i>{counts[k]}</i>
              </button>
            ))}
        </span>
      </div>

      {mayEdit && picked.size > 0 && (
        <div className="selbar">
          {I(TICK, '2.4')}
          <span><b>{picked.size}</b> picked.</span>
          <span className="selbar__go">
            <button className="btn" type="button"
                    onClick={() => setOpen(open === 'move' ? null : 'move')}>Move to…</button>
            <form action={flip} style={{ display: 'contents' }}>
              {[...picked].map((id) => <input key={id} type="hidden" name="id" value={id} />)}
              <input type="hidden" name="active" value={anyOff ? 'true' : 'false'} />
              <Go label={anyOff ? 'Bring them back' : 'Make inactive'}
                  busy="Saving…" bad={!anyOff} />
            </form>
            <button className="btn" type="button" onClick={() => setPicked(new Set())}>Clear</button>
          </span>
        </div>
      )}

      {open === 'move' && picked.size > 0 && (
        <form action={move} className="card" style={{ padding: 16, marginTop: 12 }}>
          {[...picked].map((id) => <input key={id} type="hidden" name="id" value={id} />)}
          <div className="formrow">
            <div><label htmlFor="mv-org">To which organization</label>
              <Choice id="mv-org" name="entity_id" placeholder="Leave where they are"
                      options={[{ value: '', label: 'Leave where they are' },
                                ...orgs.map((o) => ({ value: o.id, label: o.name }))]} /></div>
            <div><label htmlFor="mv-dep">And which department</label>
              <Choice id="mv-dep" name="department_id" placeholder="None"
                      options={[{ value: '', label: 'None' },
                                ...depts.map((d) => ({ value: d.id, label: d.name }))]} /></div>
          </div>
          <div className="rowacts" style={{ marginTop: 12 }}>
            <Go label={`Move ${picked.size}`} busy="Moving…" />
            <button className="btn" type="button" onClick={() => setOpen(null)}>Cancel</button>
            <span className="fine">Moving somebody to another organization without naming a
              department leaves them in none — rather than in a department of a business they
              have just left.</span>
          </div>
        </form>
      )}

      {(flipped || moved) && <Report landed={(flipped ?? moved)!} />}

      {shown.length === 0 ? (
        <p className="empty" style={{ marginTop: 14 }}>
          {q.trim() ? `Nobody matches “${q.trim()}”.` : 'Nobody here yet.'}
        </p>
      ) : (
        <div className="rst">
          <div className="rrw rrw--h">
            <span>
              {mayEdit && (
                <input type="checkbox" checked={allShown} aria-label="Pick everybody shown"
                       onChange={() => setPicked(allShown ? new Set()
                         : new Set(shown.map((p) => p.id)))} />
              )}
            </span>
            <span /><span>Name</span><span>Role</span><span>Where they sit</span>
            <span>Sign-in</span><span />
          </div>
          {shown.map((p) => (
            <div className={`rrw${p.active ? '' : ' rrw--off'}`} key={p.id}>
              <span>
                {mayEdit && (
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => pick(p.id)}
                         aria-label={`Pick ${p.name}`} />
                )}
              </span>
              <span className="ava ava--init" style={{ width: 32, height: 32, fontSize: 11 }}>
                {initials(p.name)}
              </span>
              <span className="rrw__n">
                <b>{p.name}</b>
                <small>{p.email ?? p.phone ?? 'No email on file'}</small>
              </span>
              <span className="rrw__c">{p.role ?? '—'}</span>
              <span className="rrw__c">
                {[p.entity, p.department].filter(Boolean).join(' · ') || '—'}
              </span>
              <span><Sign p={p} /></span>
              <span className="rrw__a">
                <a className="btn" href={`/people/${p.id}`}>Open</a>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="fine" style={{ marginTop: 10 }}>
        Nothing here deletes. Making somebody inactive keeps their history, their notes and
        everything they wrote — they stop appearing on the roster and stop being pickable.
        Taking a sign-in away is done under Permissions, deliberately.
      </p>
    </>
  )
}

function AddOne({ orgs, depts, onDone }: {
  orgs: Named[]; depts: Named[]; onDone: () => void
}) {
  const [state, action] = useFormState(createPerson, null)
  if (state?.ok) onDone()
  return (
    <form action={action} className="card" style={{ padding: 16, marginTop: 14 }}>
      <div className="formrow">
        <div><label htmlFor="ap-name">Their name</label>
          <input className="field" id="ap-name" name="full_name" required autoFocus
                 placeholder="Dana Whitfield" autoComplete="off" /></div>
        <div><label htmlFor="ap-email">Email</label>
          <input className="field" id="ap-email" name="email" type="email"
                 placeholder="Optional — needed before they can be invited" /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor="ap-role">Role</label>
          <input className="field" id="ap-role" name="role_title" placeholder="Dispatcher" /></div>
        <div><label htmlFor="ap-org">Organization</label>
          <Choice id="ap-org" name="entity_id" placeholder="Choose one"
                  options={orgs.map((o) => ({ value: o.id, label: o.name }))} /></div>
        <div><label htmlFor="ap-dep">Department</label>
          <Choice id="ap-dep" name="department_id" placeholder="None"
                  options={[{ value: '', label: 'None' },
                            ...depts.map((d) => ({ value: d.id, label: d.name }))]} /></div>
      </div>
      <div className="rowacts" style={{ marginTop: 12 }}>
        <Go label="Add them" busy="Adding…" />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
        <span className="fine">This puts them on the roster. Signing in is a separate step and
          needs an email address.</span>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

/**
 * What happened, per row.
 *
 * An import that says only "12 added" is an import nobody can trust: the
 * question is always which ones did not land, and why.
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

function Go({ label, busy, bad }: { label: string; busy: string; bad?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className={`btn ${bad ? 'btn--bad' : 'btn--amber'}`} type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}
