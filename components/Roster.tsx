'use client'
import { useEffect, useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import { Pencil } from '@/components/Icons'
import { importPeople, movePeople, setPeopleActive, type Landed } from '@/app/actions/roster'
import { createPerson, setPersonActive, updatePerson } from '@/app/actions/admin'
import InvitePanel from '@/components/InvitePanel'
import SignInToggle from '@/components/SignInToggle'

export type Row = {
  id: string; name: string; email: string | null; role: string | null; phone: string | null
  entity: string | null; entityId: string | null
  department: string | null; location: string | null
  manager: string | null; canSignIn: boolean; invited: boolean; active: boolean
  /** They have an Oh hi account, whether or not it may open Hopper. */
  hasAccount: boolean
  /** It is the person reading the screen. */
  isMe: boolean
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

/**
 * Signs in, could be invited, has no address to invite — three states, and the
 * difference between them is the whole reason People and Users used to be two
 * screens.
 *
 * The middle one used to say "Invited", which was a claim nothing in Hopper
 * could have made true: there is no invite anywhere in the product, so the
 * chip appeared the moment somebody had an email address and read as "we sent
 * them one". A screen that reports work nobody did is worse than a screen that
 * reports nothing.
 */
function Sign({ p, mayEdit, mayManageAccess, onInvite, open }: {
  p: Row; mayEdit: boolean; mayManageAccess: boolean
  onInvite: () => void; open: boolean
}) {
  // Somebody with an account can be switched on and off. Only an admin of the
  // account may do it, and only an admin can see the true answer -- so without
  // that, this stays the label it always was.
  if (p.hasAccount && mayManageAccess) {
    return <SignInToggle id={p.id} name={p.name} on={p.canSignIn} mine={p.isMe} />
  }
  if (p.canSignIn) return <span className="sign sign--in">{I(TICK, '2.4')}Signs in</span>
  if (p.hasAccount) {
    return <span className="sign sign--no" data-tip="They have an account but it cannot open Hopper">
      {I(MINUS, '2.4')}Signed out</span>
  }
  if (p.invited) {
    // There is something to do here and the person looking at it may do it, so
    // the cell is the control rather than a label about the control. It opens
    // the row rather than sending immediately: an irreversible thing fired
    // straight from a table cell is a thing done by accident.
    if (mayEdit && p.active) {
      return (
        <button className={`btn btn--amber invbtn${open ? ' is-on' : ''}`} type="button"
                onClick={onInvite} aria-expanded={open}
                data-tip="Email them a link to sign in, or write one out to send yourself">
          Invite
        </button>
      )
    }
    return <span className="sign sign--wait" data-tip="Has an email address — nobody has been invited yet">
      {I(MAIL, '2')}No login yet</span>
  }
  return <span className="sign sign--no" data-tip="No email address on file to invite">
    {I(MINUS, '2.4')}Roster only</span>
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
export default function Roster({ people, orgs, depts, mayEdit, mayManageAccess }: {
  people: Row[]; orgs: Named[]; depts: (Named & { entityId: string })[]; mayEdit: boolean
  /** Only an admin of the account may switch somebody's sign-in, and only an
   *  admin can read the true answer -- so this gates the control AND the
   *  label. */
  mayManageAccess: boolean
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<'import' | 'add' | 'move' | null>(null)
  // One drawer per row, two things it can hold: the quick edit, or the two
  // ways of inviting somebody. Two drawers on one row would be two ways to
  // push the rows below apart.
  const [drawer, setDrawer] = useState<{ id: string; what: 'edit' | 'invite' } | null>(null)
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
             ['never', 'No email'], ['off', 'Inactive']] as [Filter, string][])
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
            <div className={`rrec${drawer?.id === p.id ? ' is-open' : ''}`} key={p.id}>
            <div className={`rrw${p.active ? '' : ' rrw--off'}`}>
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
                {/* The name is the way deeper. One line each, the quick changes
                    in the row, everything else on their own page. */}
                <b><a className="orgname" href={`/people/${p.id}`}>{p.name}</a></b>
                <small>{p.email ?? p.phone ?? 'No email on file'}</small>
              </span>
              <span className="rrw__c">{p.role ?? '—'}</span>
              <span className="rrw__c">
                {[p.entity, p.department].filter(Boolean).join(' · ') || '—'}
              </span>
              <span><Sign p={p} mayEdit={mayEdit} mayManageAccess={mayManageAccess}
                          open={drawer?.id === p.id && drawer.what === 'invite'}
                          onInvite={() => setDrawer(
                            drawer?.id === p.id && drawer.what === 'invite'
                              ? null : { id: p.id, what: 'invite' })} /></span>
              {/* Nothing a person may not do is drawn. Without the right to
                  edit there is no pencil here, not a dead one. */}
              <span className="rrw__a">
                {mayEdit
                  ? <button className="rpen" type="button" title={`Edit ${p.name}`}
                            aria-label={`Edit ${p.name}`}
                            aria-expanded={drawer?.id === p.id && drawer.what === 'edit'}
                            onClick={() => setDrawer(
                              drawer?.id === p.id && drawer.what === 'edit'
                                ? null : { id: p.id, what: 'edit' })}>
                      <Pencil />
                    </button>
                  : <a className="btn" href={`/people/${p.id}`}>Open</a>}
              </span>
            </div>
            <div className="rrec__drawer"><div className="rrec__clip">
              <div className="rrec__form">
                {drawer?.id === p.id && drawer.what === 'edit' && (
                  <QuickEdit p={p} orgs={orgs} depts={depts} onDone={() => setDrawer(null)} />
                )}
                {drawer?.id === p.id && drawer.what === 'invite' && (
                  <InvitePanel id={p.id} name={p.name} email={p.email}
                               onDone={() => setDrawer(null)} />
                )}
              </div>
            </div></div>
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

/**
 * The quick change, in the row.
 *
 * The five things that actually go stale on a roster -- a name, an email, a
 * role, which business, which department -- and nothing else. A screen where
 * correcting a spelling costs two navigations is a screen where the spelling
 * stays wrong.
 */
function QuickEdit({ p, orgs, depts, onDone }: {
  p: Row; orgs: Named[]; depts: (Named & { entityId: string })[]; onDone: () => void
}) {
  const [saved, save] = useFormState(updatePerson, null)
  const [flipped, flip] = useFormState(setPersonActive, null)
  // Closing is a change to the row above, so it happens after the render that
  // learned the save worked -- not during it.
  useEffect(() => { if (saved?.ok || flipped?.ok) onDone() }, [saved, flipped, onDone])
  return (
    <>
      <div className="rrec__lab">Editing {p.name}</div>
      <form action={save}>
        <input type="hidden" name="id" value={p.id} />
        <div className="formrow">
          <div><label htmlFor={`pn-${p.id}`}>Name</label>
            <input className="field" id={`pn-${p.id}`} name="full_name"
                   defaultValue={p.name} required autoFocus /></div>
          <div><label htmlFor={`pe-${p.id}`}>Email</label>
            <input className="field" id={`pe-${p.id}`} name="email" type="email"
                   defaultValue={p.email ?? ''} placeholder="None on file" /></div>
          <div><label htmlFor={`pr-${p.id}`}>Role</label>
            <input className="field" id={`pr-${p.id}`} name="role_title"
                   defaultValue={p.role ?? ''} placeholder="Dispatcher" /></div>
          <div><label htmlFor={`pp-${p.id}`}>Phone</label>
            <input className="field" id={`pp-${p.id}`} name="phone" type="tel"
                   defaultValue={p.phone ?? ''} placeholder="None on file" /></div>
        </div>
        <div className="formrow" style={{ marginTop: 11 }}>
          <div><label htmlFor={`po-${p.id}`}>Organization</label>
            <Choice id={`po-${p.id}`} name="entity_id" defaultValue={p.entityId ?? ''}
                    placeholder="None"
                    options={[{ value: '', label: 'None' },
                              ...orgs.map((o) => ({ value: o.id, label: o.name }))]} /></div>
          <div><label htmlFor={`pd-${p.id}`}>Department</label>
            <Choice id={`pd-${p.id}`} name="department_id" placeholder="None"
                    options={[{ value: '', label: 'None' },
                              ...depts.map((d) => ({ value: d.id, label: d.name }))]} /></div>
        </div>
        {saved && !saved.ok && <p className="note note--err">{saved.message}</p>}
        <div className="rowacts">
          <Go label="Save" busy="Saving…" />
          <button className="lnk" type="button" onClick={onDone}>Cancel</button>
          <a className="lnk lnk--go" href={`/people/${p.id}`} style={{ color: 'var(--ink-3)' }}>
            Everything else about them →
          </a>
        </div>
      </form>

      {/* Its own form on purpose: not a field, and not a thing to reach by
          pressing Enter in a text box. */}
      <form action={flip} className="rrec__danger">
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="active" value={p.active ? 'false' : 'true'} />
        <Go label={p.active ? 'Make them inactive' : 'Bring them back'}
            busy="Saving…" bad={p.active} />
        <span className="fine">
          Nothing is deleted. They keep their history, their notes and everything they
          wrote — they stop appearing on the roster and stop being pickable.
        </span>
      </form>
      {flipped && !flipped.ok && <p className="note note--err">{flipped.message}</p>}
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
    <button className={`btn btn--sm ${bad ? 'btn--bad' : 'btn--amber'}`} type="submit"
            disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}
