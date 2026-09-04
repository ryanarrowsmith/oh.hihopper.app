'use client'
import { useMemo, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import Toggle from '@/components/Toggle'
import {
  saveDesk, saveQueue, saveSla, saveKind, saveField, saveSnippet, setQueueAgent,
} from '@/app/actions/desk'
import {
  FACING_WORD, ASSIGN_WORD, FIELD_WORD, gap,
  type AssignMode, type FieldKind,
} from '@/lib/desk'

type Named = { id: string; name: string }
type Org = Named
type Dep = Named & { entity_id: string; active: boolean }
type Sla = Named & {
  entity_id: string; first_reply_mins: number | null; resolve_mins: number | null
  business_hours: boolean; active: boolean
}
type Queue = Named & {
  entity_id: string; department_id: string; facing: string; inbox_address: string | null
  form_enabled: boolean; sla_id: string | null; assign_mode: AssignMode
  assign_to: string | null; active: boolean
}
type Kind = Named & { entity_id: string; sla_id: string | null; active: boolean }
type Agent = { id: string; queue_id: string; person_id: string; lead: boolean; active: boolean }
type Who = { id: string; full_name: string }
type Desk = {
  entity_id: string; prefix: string; next_number: number
  day_start: number; day_end: number; work_days: number[]; time_zone: string
}

const TABS = [
  { key: 'queues', label: 'Queues' },
  { key: 'slas', label: 'SLAs' },
  { key: 'kinds', label: 'Ticket types' },
  { key: 'hours', label: 'Hours & references' },
] as const
type Tab = typeof TABS[number]['key']

/**
 * Queues & SLAs.
 *
 * Four things a desk has to be able to change without anybody being asked to
 * write SQL: the queues and who works them, the promises attached to them, the
 * kinds of ticket and what each kind asks for, and the hours the clocks
 * actually run in. Each list edits in place -- opening a row IS the form -- and
 * nothing here deletes: a queue that is no longer used is switched off, keeps
 * its tickets, and can be switched back on where you left it.
 */
export default function DeskAdmin({
  orgs, mayOrgs, departments, queues, agents, slas, kinds, people, desks,
}: {
  orgs: Org[]; mayOrgs: string[]; departments: Dep[]; queues: Queue[]; agents: Agent[]
  slas: Sla[]; kinds: Kind[]; people: Who[]; desks: Desk[]
}) {
  const [tab, setTab] = useState<Tab>('queues')
  const mine = useMemo(() => orgs.filter((o) => mayOrgs.includes(o.id)), [orgs, mayOrgs])
  const [org, setOrg] = useState(mine[0]?.id ?? '')

  if (mine.length === 0) {
    return (
      <div className="pjcol">
        <div className="pj__h"><div className="pj__id"><h1>Queues &amp; SLAs</h1></div></div>
        <p className="empty">
          You work the desk but you do not configure it. Ask whoever manages this
          organization to add a queue or change an SLA.
        </p>
      </div>
    )
  }

  const inOrg = <T extends { entity_id: string }>(xs: T[]) => xs.filter((x) => x.entity_id === org)
  const myQueues = inOrg(queues)
  const mySlas = inOrg(slas)
  const myKinds = inOrg(kinds)
  const myDeps = departments.filter((d) => d.entity_id === org && d.active)
  const desk = desks.find((d) => d.entity_id === org) ?? null

  return (
    <div className="pjcol">
      <div className="pj__h">
        <div className="pj__id">
          <h1>Queues &amp; SLAs</h1>
          <p className="pjline">
            <span>{myQueues.filter((q) => q.active).length} queues</span>
            <span>{mySlas.filter((s) => s.active).length} SLAs</span>
            <span>{myKinds.filter((k) => k.active).length} ticket types</span>
          </p>
        </div>
        {/* Only when there is more than one to choose between. */}
        {mine.length > 1 && (
          <div className="pj__go" style={{ minWidth: 220 }}>
            <Choice name="admin_org" defaultValue={org} onPick={setOrg}
                    options={mine.map((o) => ({ value: o.id, label: o.name }))} />
          </div>
        )}
      </div>

      <div className="dktabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                  className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queues' && (
        <Queues org={org} queues={myQueues} deps={myDeps} slas={mySlas}
                people={people} agents={agents} />
      )}
      {tab === 'slas' && <Slas org={org} slas={mySlas} />}
      {tab === 'kinds' && <Kinds org={org} kinds={myKinds} slas={mySlas} queues={myQueues} />}
      {tab === 'hours' && <Hours org={org} desk={desk} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ queues */

function Queues({ org, queues, deps, slas, people, agents }: {
  org: string; queues: Queue[]; deps: Dep[]; slas: Sla[]; people: Who[]; agents: Agent[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (deps.length === 0) {
    return <p className="empty">
      A queue is answered by a department, and this organization has none yet.
      Add one under Organizations first.
    </p>
  }
  return (
    <>
      <div className="dkrows">
        {queues.map((q) => (
          <div className={`dkrow${q.active ? '' : ' off'}`} key={q.id}>
            <button className="dkrow__h" type="button" aria-expanded={open === q.id}
                    onClick={() => setOpen(open === q.id ? null : q.id)}>
              <span className="dkrow__n">
                <b>{q.name}</b>
                <span>{FACING_WORD[q.facing as 'in' | 'out']} · {ASSIGN_WORD[q.assign_mode]}
                  {q.inbox_address ? ` · ${q.inbox_address}` : ''}
                  {q.active ? '' : ' · switched off'}</span>
              </span>
              <span className="dkrow__c tnum">
                {agents.filter((a) => a.queue_id === q.id && a.active).length} on it
              </span>
              <Caret on={open === q.id} />
            </button>
            {open === q.id && (
              <div className="dkrow__b">
                <QueueForm org={org} q={q} deps={deps} slas={slas} people={people} />
                <Agents queue={q} people={people} agents={agents} />
              </div>
            )}
          </div>
        ))}
        {queues.length === 0 && <p className="empty">No queues yet. Add the first one.</p>}
      </div>
      <Adder label="Add a queue" title="New queue">
        <QueueForm org={org} q={null} deps={deps} slas={slas} people={people} />
      </Adder>
    </>
  )
}

function QueueForm({ org, q, deps, slas, people }: {
  org: string; q: Queue | null; deps: Dep[]; slas: Sla[]; people: Who[]
}) {
  const [state, action] = useFormState(saveQueue, null)
  const [mode, setMode] = useState<AssignMode>(q?.assign_mode ?? 'manual')
  return (
    <form action={action} className="dkform">
      {q && <input type="hidden" name="id" value={q.id} />}
      <input type="hidden" name="entity_id" value={org} />

      <div className="formrow">
        <div>
          <label htmlFor={`qn${q?.id ?? 'new'}`}>What it is called</label>
          <input className="field" id={`qn${q?.id ?? 'new'}`} name="name" required maxLength={80}
                 defaultValue={q?.name ?? ''} placeholder="Customer Care" autoComplete="off" />
        </div>
        <div>
          <label>Who answers it</label>
          <Choice name="department_id" required defaultValue={q?.department_id ?? ''}
                  placeholder="Choose a department"
                  options={deps.map((d) => ({ value: d.id, label: d.name }))} />
        </div>
      </div>

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label>Who writes in</label>
          <Choice name="facing" defaultValue={q?.facing ?? 'out'}
                  options={Object.entries(FACING_WORD).map(([v, l]) => ({ value: v, label: l }))} />
        </div>
        <div>
          <label>What we promise</label>
          <Choice name="sla_id" defaultValue={q?.sla_id ?? ''} placeholder="No promise"
                  options={[{ value: '', label: 'No promise' },
                            ...slas.filter((s) => s.active).map((s) => ({
                              value: s.id, label: s.name, hint: slaLine(s),
                            }))]} />
        </div>
      </div>

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label>Who it goes to</label>
          <Choice name="assign_mode" defaultValue={mode} onPick={(v) => setMode(v as AssignMode)}
                  options={Object.entries(ASSIGN_WORD).map(([v, l]) => ({ value: v, label: l }))} />
        </div>
        <div>
          {mode === 'fixed' ? (
            <>
              <label>Which person</label>
              <Choice name="assign_to" defaultValue={q?.assign_to ?? ''} placeholder="Choose one"
                      options={people.map((p) => ({ value: p.id, label: p.full_name }))} />
            </>
          ) : (
            <>
              <label htmlFor={`qi${q?.id ?? 'new'}`}>Where its mail arrives</label>
              <input className="field" id={`qi${q?.id ?? 'new'}`} name="inbox_address"
                     type="email" maxLength={160} defaultValue={q?.inbox_address ?? ''}
                     placeholder="care@yourcompany.com" autoComplete="off" />
            </>
          )}
        </div>
      </div>

      {mode === 'fixed' && (
        <div className="formrow formrow--one" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor={`qi2${q?.id ?? 'new'}`}>Where its mail arrives</label>
            <input className="field" id={`qi2${q?.id ?? 'new'}`} name="inbox_address"
                   type="email" maxLength={160} defaultValue={q?.inbox_address ?? ''}
                   placeholder="care@yourcompany.com" autoComplete="off" />
          </div>
        </div>
      )}

      <div className="dktogs">
        <Toggle name="form_enabled" label="Take tickets from a web form"
                defaultChecked={q?.form_enabled ?? false} />
        <Toggle name="active" label="In use" defaultChecked={q?.active ?? true} />
      </div>

      <div className="rowacts"><Go label={q ? 'Save' : 'Add it'} /></div>
      {state && <p className={state.ok ? 'sok sok--thin' : 'swhy'}>{state.message}</p>}
    </form>
  )
}

function Agents({ queue, people, agents }: { queue: Queue; people: Who[]; agents: Agent[] }) {
  const [, action] = useFormState(setQueueAgent, null)
  const on = new Map(agents.filter((a) => a.queue_id === queue.id).map((a) => [a.person_id, a]))
  return (
    <div className="dkagents">
      <h3>Who works it</h3>
      <p className="fine">
        Being on a queue is what gives somebody its tickets — there is no second
        permission to remember. A lead gets the escalations.
      </p>
      <ul>
        {people.map((p) => {
          const a = on.get(p.id)
          return (
            <li key={p.id}>
              <span className="dkav">{mark(p.full_name)}</span>
              <b>{p.full_name}</b>
              <form action={action}>
                <input type="hidden" name="queue_id" value={queue.id} />
                <input type="hidden" name="person_id" value={p.id} />
                <input type="hidden" name="active" value={a?.active ? 'false' : 'on'} />
                <input type="hidden" name="lead" value={a?.lead ? 'on' : 'false'} />
                <button className="btn btn--tiny" type="submit">
                  {a?.active ? 'Take off' : 'Put on'}
                </button>
              </form>
              {a?.active && (
                <form action={action}>
                  <input type="hidden" name="queue_id" value={queue.id} />
                  <input type="hidden" name="person_id" value={p.id} />
                  <input type="hidden" name="active" value="on" />
                  <input type="hidden" name="lead" value={a.lead ? 'false' : 'on'} />
                  <button className="btn btn--tiny" type="submit">
                    {a.lead ? 'Not a lead' : 'Make lead'}
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ═════════════════════════════════════════════════════════════════ SLAs */

function slaLine(s: { first_reply_mins: number | null; resolve_mins: number | null; business_hours: boolean }) {
  const bits = [
    s.first_reply_mins ? `reply in ${gap(s.first_reply_mins * 60000)}` : null,
    s.resolve_mins ? `done in ${gap(s.resolve_mins * 60000)}` : null,
  ].filter(Boolean).join(', ')
  return `${bits}${s.business_hours ? ', working hours' : ', around the clock'}`
}

function Slas({ org, slas }: { org: string; slas: Sla[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="dkrows">
        {slas.map((s) => (
          <div className={`dkrow${s.active ? '' : ' off'}`} key={s.id}>
            <button className="dkrow__h" type="button" aria-expanded={open === s.id}
                    onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="dkrow__n">
                <b>{s.name}</b><span>{slaLine(s)}{s.active ? '' : ' · switched off'}</span>
              </span>
              <Caret on={open === s.id} />
            </button>
            {open === s.id && <div className="dkrow__b"><SlaForm org={org} s={s} /></div>}
          </div>
        ))}
        {slas.length === 0 && <p className="empty">
          No promises yet. Without one a ticket has no clock — which is a choice,
          not a bug, but usually not the one you want.
        </p>}
      </div>
      <Adder label="Add an SLA" title="New SLA"><SlaForm org={org} s={null} /></Adder>
    </>
  )
}

function SlaForm({ org, s }: { org: string; s: Sla | null }) {
  const [state, action] = useFormState(saveSla, null)
  return (
    <form action={action} className="dkform">
      {s && <input type="hidden" name="id" value={s.id} />}
      <input type="hidden" name="entity_id" value={org} />
      <div className="formrow formrow--one">
        <div>
          <label htmlFor={`sn${s?.id ?? 'new'}`}>What it is called</label>
          <input className="field" id={`sn${s?.id ?? 'new'}`} name="name" required maxLength={80}
                 defaultValue={s?.name ?? ''} placeholder="Standard" autoComplete="off" />
        </div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor={`sr${s?.id ?? 'new'}`}>First reply, in minutes</label>
          <input className="field" id={`sr${s?.id ?? 'new'}`} name="first_reply_mins"
                 type="number" min={1} max={100000} defaultValue={s?.first_reply_mins ?? ''}
                 placeholder="60" />
        </div>
        <div>
          <label htmlFor={`sd${s?.id ?? 'new'}`}>Resolved, in minutes</label>
          <input className="field" id={`sd${s?.id ?? 'new'}`} name="resolve_mins"
                 type="number" min={1} max={100000} defaultValue={s?.resolve_mins ?? ''}
                 placeholder="480" />
        </div>
      </div>
      <div className="dktogs">
        <Toggle name="business_hours" label="Count only working hours"
                defaultChecked={s?.business_hours ?? true} />
        <Toggle name="active" label="In use" defaultChecked={s?.active ?? true} />
      </div>
      <div className="rowacts"><Go label={s ? 'Save' : 'Add it'} /></div>
      {state && <p className={state.ok ? 'sok sok--thin' : 'swhy'}>{state.message}</p>}
    </form>
  )
}

/* ══════════════════════════════════════════════════════════ ticket types */

function Kinds({ org, kinds, slas, queues }: {
  org: string; kinds: Kind[]; slas: Sla[]; queues: Queue[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <div className="dkrows">
        {kinds.map((k) => (
          <div className={`dkrow${k.active ? '' : ' off'}`} key={k.id}>
            <button className="dkrow__h" type="button" aria-expanded={open === k.id}
                    onClick={() => setOpen(open === k.id ? null : k.id)}>
              <span className="dkrow__n">
                <b>{k.name}</b>
                <span>{slas.find((s) => s.id === k.sla_id)?.name ?? 'the queue’s promise'}
                  {k.active ? '' : ' · switched off'}</span>
              </span>
              <Caret on={open === k.id} />
            </button>
            {open === k.id && (
              <div className="dkrow__b">
                <KindForm org={org} k={k} slas={slas} />
                <Fields kindId={k.id} />
                <Snippets org={org} kindId={k.id} queues={queues} />
              </div>
            )}
          </div>
        ))}
        {kinds.length === 0 && <p className="empty">
          No types yet. A type is what lets a ticket ask for the things that kind
          of ticket always needs — and carry its own, faster promise.
        </p>}
      </div>
      <Adder label="Add a ticket type" title="New ticket type">
        <KindForm org={org} k={null} slas={slas} />
      </Adder>
    </>
  )
}

function KindForm({ org, k, slas }: { org: string; k: Kind | null; slas: Sla[] }) {
  const [state, action] = useFormState(saveKind, null)
  return (
    <form action={action} className="dkform">
      {k && <input type="hidden" name="id" value={k.id} />}
      <input type="hidden" name="entity_id" value={org} />
      <div className="formrow">
        <div>
          <label htmlFor={`kn${k?.id ?? 'new'}`}>What it is called</label>
          <input className="field" id={`kn${k?.id ?? 'new'}`} name="name" required maxLength={80}
                 defaultValue={k?.name ?? ''} placeholder="Missed collection" autoComplete="off" />
        </div>
        <div>
          <label>Its own promise</label>
          <Choice name="sla_id" defaultValue={k?.sla_id ?? ''} placeholder="Use the queue’s"
                  options={[{ value: '', label: 'Use the queue’s' },
                            ...slas.filter((s) => s.active).map((s) => ({
                              value: s.id, label: s.name, hint: slaLine(s) }))]} />
        </div>
      </div>
      <div className="dktogs">
        <Toggle name="active" label="In use" defaultChecked={k?.active ?? true} />
      </div>
      <div className="rowacts"><Go label={k ? 'Save' : 'Add it'} /></div>
      {state && <p className={state.ok ? 'sok sok--thin' : 'swhy'}>{state.message}</p>}
    </form>
  )
}

/** What this type asks for. Added here, answered on the ticket. */
function Fields({ kindId }: { kindId: string }) {
  const [state, action] = useFormState(saveField, null)
  const [kind, setKind] = useState<FieldKind>('text')
  return (
    <div className="dkagents">
      <h3>What it asks for</h3>
      <form action={action} className="dkform">
        <input type="hidden" name="kind_id" value={kindId} />
        <div className="formrow">
          <div>
            <label htmlFor={`fl${kindId}`}>Label</label>
            <input className="field" id={`fl${kindId}`} name="label" required maxLength={80}
                   placeholder="Service address" autoComplete="off" />
          </div>
          <div>
            <label>What sort of answer</label>
            <Choice name="kind" defaultValue="text" onPick={(v) => setKind(v as FieldKind)}
                    options={Object.entries(FIELD_WORD).map(([v, l]) => ({ value: v, label: l }))} />
          </div>
        </div>
        {kind === 'choice' && (
          <div className="formrow formrow--one" style={{ marginTop: 12 }}>
            <div>
              <label htmlFor={`fo${kindId}`}>The list, one to a line</label>
              <textarea className="field" id={`fo${kindId}`} name="options" rows={3}
                        placeholder={'Roll-off\nFront load\nRestroom'} />
            </div>
          </div>
        )}
        <div className="formrow formrow--one" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor={`fh${kindId}`}>A hint under it</label>
            <input className="field" id={`fh${kindId}`} name="hint" maxLength={140}
                   placeholder="Optional" autoComplete="off" />
          </div>
        </div>
        <div className="dktogs">
          <Toggle name="required" label="Must be answered" />
          <Toggle name="on_form" label="Ask on the web form too" />
        </div>
        <div className="rowacts"><Go label="Add the field" /></div>
        {state && <p className={state.ok ? 'sok sok--thin' : 'swhy'}>{state.message}</p>}
      </form>
    </div>
  )
}

function Snippets({ org, kindId, queues }: { org: string; kindId: string; queues: Queue[] }) {
  const [state, action] = useFormState(saveSnippet, null)
  return (
    <div className="dkagents">
      <h3>Quick responses</h3>
      <p className="fine">Written once, dropped into a reply from the ticket.</p>
      <form action={action} className="dkform">
        <input type="hidden" name="entity_id" value={org} />
        <input type="hidden" name="kind_id" value={kindId} />
        <div className="formrow">
          <div>
            <label htmlFor={`snt${kindId}`}>What it is called</label>
            <input className="field" id={`snt${kindId}`} name="title" required maxLength={80}
                   placeholder="We are on our way" autoComplete="off" />
          </div>
          <div>
            <label>Only on one queue</label>
            <Choice name="queue_id" defaultValue="" placeholder="Any queue"
                    options={[{ value: '', label: 'Any queue' },
                              ...queues.map((q) => ({ value: q.id, label: q.name }))]} />
          </div>
        </div>
        <div className="formrow formrow--one" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor={`snb${kindId}`}>What it says</label>
            <textarea className="field" id={`snb${kindId}`} name="body" rows={3} required
                      placeholder="Thanks for letting us know — a truck is scheduled for tomorrow." />
          </div>
        </div>
        <div className="rowacts"><Go label="Add it" /></div>
        {state && <p className={state.ok ? 'sok sok--thin' : 'swhy'}>{state.message}</p>}
      </form>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ hours and references */

const DAYS = [
  { n: 1, w: 'Mon' }, { n: 2, w: 'Tue' }, { n: 3, w: 'Wed' }, { n: 4, w: 'Thu' },
  { n: 5, w: 'Fri' }, { n: 6, w: 'Sat' }, { n: 7, w: 'Sun' },
]
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mins = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function Hours({ org, desk }: { org: string; desk: Desk | null }) {
  const [state, action] = useFormState(saveDesk, null)
  const [start, setStart] = useState(clock(desk?.day_start ?? 420))
  const [end, setEnd] = useState(clock(desk?.day_end ?? 1020))
  const days = desk?.work_days ?? [1, 2, 3, 4, 5]

  return (
    <form action={action} className="dkform dkform--pad">
      <input type="hidden" name="entity_id" value={org} />
      <input type="hidden" name="day_start" value={mins(start)} />
      <input type="hidden" name="day_end" value={mins(end)} />

      <p className="fine">
        A four-hour promise means four hours the desk was open. Without these,
        everything that arrives on a Friday evening is late by Monday morning.
      </p>

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="dk-p">What its references look like</label>
          <input className="field tnum" id="dk-p" name="prefix" required maxLength={8}
                 defaultValue={desk?.prefix ?? ''} placeholder="ONC"
                 style={{ textTransform: 'uppercase' }} autoComplete="off" />
          <p className="fine">
            {desk ? `Next one out is ${desk.prefix}-${desk.next_number}.`
                  : 'Two to eight letters or digits. The first ticket will be number 1.'}
          </p>
        </div>
        <div>
          <label htmlFor="dk-z">Which clock</label>
          <input className="field" id="dk-z" name="time_zone" maxLength={60}
                 defaultValue={desk?.time_zone ?? 'America/Chicago'} autoComplete="off" />
        </div>
      </div>

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="dk-s">Opens</label>
          <input className="field" id="dk-s" type="time" value={start}
                 onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor="dk-e">Closes</label>
          <input className="field" id="dk-e" type="time" value={end}
                 onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <fieldset className="dkdays">
        <legend>Which days</legend>
        {DAYS.map((d) => (
          <Toggle key={d.n} name="work_days" value={d.n} label={d.w} small
                  defaultChecked={days.includes(d.n)} />
        ))}
      </fieldset>

      <div className="rowacts"><Go label="Save" /></div>
      {state && <p className={state.ok ? 'sok sok--thin' : 'swhy'}>{state.message}</p>}
    </form>
  )
}

/* ─────────────────────────────────────────────────────────────── the bits */

function Adder({ label, title, children }: {
  label: string; title: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dkadd">
      <button className="btn btn--amber" type="button" aria-expanded={open}
              onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{label}
      </button>
      {open && (
        <div className="dkadd__p" role="dialog" aria-label={title}>
          <div className="addpop__h">
            <b>{title}</b>
            <button className="addpop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}

function Caret({ on }: { on: boolean }) {
  return (
    <svg className={`dkcar${on ? ' on' : ''}`} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  )
}

function Go({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Saving…' : label}
  </button>
}

function mark(name: string) {
  const p = name.split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}
