import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { EditableSection, RecordRow, RowDanger, RowForm, Toggle } from '@/components/RowEdit'
import ActionForm from '@/components/ActionForm'
import Choice from '@/components/Choice'
import { FenceMark } from '@/components/FenceMark'
import { loadFenceAdmin, editsFor } from '@/lib/fence-admin'
import { loadRates, rateAge, RATE_KINDS, SECTIONS, ROLE_WORD, type JobRole } from '@/lib/fence'
import { LANG_NAME } from '@/lib/i18n'
import {
  setFencePerson, dropFencePerson, setRate, setSpec, setGateType,
  setTerm, setCrew, setChargeCode, setChargeRule, setTarget, setFenceSettings, setPlanStep,
} from '@/app/actions/fence'

export const dynamic = 'force-dynamic'

/**
 * Fence Builder admin: every list the module runs on, one at a time.
 *
 * The sections are LINKS, not tabs. Seven panels of reference data is a place
 * people come back to -- "the gate catalog" is a thing you send somebody, and
 * a tab index in a component's head cannot be sent. So the rail writes ?s= and
 * the server draws one section, which also means the back button does what the
 * back button does and nothing here needs to hydrate to be readable.
 *
 * One section on screen at a time, and no summary cards above them. A count in
 * a card is a number you then have to go and find; the list itself is three
 * lines further down.
 */

const KEYS = ['people', 'plan', 'rates', 'specs', 'glossary', 'billing', 'crews', 'pricing'] as const
type Key = (typeof KEYS)[number]

const TITLE: Record<Key, string> = {
  people: 'People and access',
  plan: 'Task plan',
  rates: 'Rate book',
  specs: 'Specs and gates',
  glossary: 'Glossary',
  billing: 'Charge codes and billing',
  crews: 'Crews',
  pricing: 'Pricing settings',
}

const ROLES = (['sales', 'pm', 'field', 'billing'] as JobRole[])
  .map((r) => ({ value: r, label: ROLE_WORD[r], hint: editsFor(r) }))
const LANGS = [
  { value: 'en', label: LANG_NAME.en },
  { value: 'es', label: LANG_NAME.es, hint: 'Their ticket and scope of work arrive in Spanish' },
]
const CLASSES = [
  { value: 'permanent', label: 'Permanent' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'secure', label: 'Secure' },
]
const CLASS_WORD: Record<string, string> = {
  permanent: 'Permanent', temporary: 'Temporary', secure: 'Secure',
}
/** Every class of work a roll-up rule could be missing for. */
const MISSING = ['permanent', 'temporary', 'secure'] as const

/**
 * A row, and whether it opens.
 *
 * Nothing a person may not do is rendered: without the right to manage the
 * account's reference data the row is a row, not a disabled pencil. The
 * database refuses those writes by matching no rows, which would otherwise
 * reach the screen as "that row is no longer here" -- a true sentence about the
 * wrong thing.
 */
function Row({ may, face, label, children }: {
  may: boolean; face: React.ReactNode; label: string; children: React.ReactNode
}) {
  if (!may) return <div className="rrec"><div className="rrec__face">{face}</div></div>
  return <RecordRow face={face} editLabel={label}>{children}</RecordRow>
}

const ft = (n: number | null) => (n == null ? '—' : `${Number(n)}′`)
const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

export default async function FenceAdmin(
  { searchParams }: { searchParams?: { s?: string } },
) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const s = (KEYS as readonly string[]).includes(searchParams?.s ?? '')
    ? (searchParams!.s as Key) : 'people'
  const at = KEYS.indexOf(s)

  const db = supabaseServer()
  const [a, book, { data: mods }] = await Promise.all([
    loadFenceAdmin(session.accountId),
    s === 'rates' ? loadRates(session.accountId, true) : Promise.resolve(null),
    db.schema('hopper').from('entity_module')
      .select('entity_id, enabled').eq('module_key', 'fence'),
  ])
  const live = (mods ?? []).some((m: any) => m.enabled)
  const may = a.rights.mayManage

  const Rail = (
    <nav className="fjarail" aria-label="Admin sections">
      <div className="fjachips">
        {KEYS.map((k) => (
          <Link key={k} className={`fjachip${k === s ? ' is-on' : ''}`}
                href={`/admin/fence?s=${k}`} aria-current={k === s ? 'page' : undefined}>
            {TITLE[k]}
          </Link>
        ))}
      </div>
      {/* Where you are in seven, and the two steps either side of it. The
          count is the thing the chips cannot say when they have wrapped. */}
      <div className="fjastep">
        <span className="fjacount">{at + 1} / {KEYS.length}</span>
        {at > 0 && <Link className="fjago" href={`/admin/fence?s=${KEYS[at - 1]}`}>
          ← {TITLE[KEYS[at - 1]]}</Link>}
        {at < KEYS.length - 1 && <Link className="fjago" href={`/admin/fence?s=${KEYS[at + 1]}`}>
          {TITLE[KEYS[at + 1]]} →</Link>}
      </div>
    </nav>
  )

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Fence Builder</h1>
        <p className="scopeline"><span>
          Every list the module runs on, one at a time. Nothing floats beside anything —
          read one table, change it where it sits, step to the next.
        </span></p>
      </div></div>

      {!live && (
        <p className="note note--err" style={{ marginTop: 16 }}>
          Fence Builder is switched off for every organization, so nobody sees these lists yet.
          {' '}<Link href="/admin/modules">Modules</Link> is where that changes.
        </p>
      )}

      {!may && (
        <p className="note" style={{ marginTop: 16 }}>
          You can read every list here. Changing them belongs to whoever administers this
          account, so nothing on this screen opens.
        </p>
      )}

      {Rail}

      {s === 'people' && <People people={a.people} spare={a.spare} may={may} />}
      {s === 'plan' && <Plan steps={a.plan} may={may} />}
      {s === 'rates' && book && <RateBook rates={book.rates} seesCost={book.seesCost} may={may} />}
      {s === 'specs' && <Specs specs={a.specs} gates={a.gates} may={may} />}
      {s === 'glossary' && <Glossary terms={a.glossary} may={may} />}
      {s === 'billing' && <Billing codes={a.codes} rules={a.rules} targets={a.targets} may={may} />}
      {s === 'crews' && <Crews crews={a.crews} people={a.people} may={may} />}
      {s === 'pricing' && <Pricing read={a.settings} may={may} />}
    </>
  )
}

// ------------------------------------------------------------------ people
function People({ people, spare, may }: {
  people: Awaited<ReturnType<typeof loadFenceAdmin>>['people']
  spare: { id: string; name: string }[]; may: boolean
}) {
  return (
    <>
      <EditableSection
        title="Who is what on the crew"
        blurb={`${people.length} on Fence Builder. Their job decides which sections of a job they may edit — everything else they read, and may write a note on.`}
        addLabel="Adding somebody"
        addForm={may ? (
          <RowForm action={setFencePerson} label="Add them" busy="Adding…">
            <div className="formrow">
              <div><label htmlFor="fp-p">Person</label>
                <Choice id="fp-p" name="person_id" required placeholder="Somebody on the roster"
                        options={spare.map((p) => ({ value: p.id, label: p.name }))} /></div>
            </div>
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="fp-r">Their job</label>
                <Choice id="fp-r" name="job_role" required options={ROLES} /></div>
              <div><label htmlFor="fp-l">Reads</label>
                <Choice id="fp-l" name="lang" defaultValue="en" options={LANGS} /></div>
            </div>
            {spare.length === 0 && <p className="note">
              Everybody on the roster is already here. <Link href="/admin/people">People</Link> is
              where somebody new gets added to the business.
            </p>}
          </RowForm>
        ) : undefined}
      >
        {people.length === 0 ? (
          <p className="empty">Nobody has been put on Fence Builder yet.</p>
        ) : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1.6fr) 150px 120px minmax(0,1.3fr)' }}>
            <div className="rhead">
              <span>Person</span><span>Their job</span><span>Reads</span><span>Edits</span>
            </div>
            {people.map((p) => (
              <Row key={p.id} may={may} label={`Edit ${p.name}`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjname">{p.name}</span>
                    <span className="fjsub">{p.email ?? p.title ?? '—'}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Their job</span>
                    <span className="rcell__val">{ROLE_WORD[p.job_role]}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Reads</span>
                    <span className="rcell__val">{LANG_NAME[p.lang]}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Edits</span>
                    <span className="rcell__val"><span className="fjsub">{p.edits}</span></span>
                  </span>
                </>
              }>
                <RowForm action={setFencePerson}
                         danger={<TakeOff id={p.id} name={p.name} />}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="person_id" value={p.person_id} />
                  <input type="hidden" name="name" value={p.name} />
                  <div className="formrow">
                    <div><label htmlFor={`r-${p.id}`}>Their job</label>
                      <Choice id={`r-${p.id}`} name="job_role" defaultValue={p.job_role}
                              options={ROLES} /></div>
                    <div><label htmlFor={`l-${p.id}`}>Ticket and scope arrive in</label>
                      <Choice id={`l-${p.id}`} name="lang" defaultValue={p.lang}
                              options={LANGS} /></div>
                  </div>
                </RowForm>
              </Row>
            ))}
          </div>
        )}
      </EditableSection>

      {/* The map itself, stated once. It is the module's central rule and it is
          not a setting: a salesperson's quote is not a project manager's to
          rewrite, and no toggle here should imply otherwise. */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>What each job may edit</h2>
          <p>Fixed, and the same for every account — including an administrator, who may edit
            anything unsealed and nothing sealed.</p>
        </div></div>
        <div className="fjaown">
          {(['sales', 'pm', 'field', 'billing'] as JobRole[]).map((r) => (
            <div className="fjaown__r" key={r}>
              <b>{ROLE_WORD[r]}</b>
              <span>
                {SECTIONS.filter((x) => x.owner === r).map((x) => (
                  <FenceMark key={x.key} kind="edit">{x.en}</FenceMark>
                ))}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

/** Taking somebody off the module. Their work stays; the key goes. */
function TakeOff({ id, name }: { id: string; name: string }) {
  return (
    <RowDanger action={dropFencePerson} label="Take them off">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="name" value={name} />
    </RowDanger>
  )
}

// ---------------------------------------------------------------- task plan
const PHASES_AFTER = [
  { value: 'survey', label: 'Survey', hint: 'The project manager picks it up' },
  { value: 'schedule', label: 'Schedule', hint: 'Dates, crew, materials' },
  { value: 'sow', label: 'Scope of work', hint: 'Written, checked, signed' },
  { value: 'ticket', label: 'Crew ticket', hint: 'What the crew does on site' },
  { value: 'closeout', label: 'Close-out', hint: 'QA, photographs, release' },
  { value: 'billing', label: 'Billing', hint: 'Keyed into the billing system' },
]
const NEEDS = [
  { value: '', label: 'Nothing — a person’s word', hint: 'Most steps' },
  { value: 'navusoft_account', label: 'The Navusoft account number',
    hint: 'Cannot be ticked until the number is against the address' },
]

function Plan({ steps, may }: {
  steps: Awaited<ReturnType<typeof loadFenceAdmin>>['plan']; may: boolean
}) {
  const Fields = ({ r }: { r?: (typeof steps)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`pl-s-${r?.id ?? 'new'}`}>Phase</label>
          <Choice id={`pl-s-${r?.id ?? 'new'}`} name="section" defaultValue={r?.section ?? 'survey'}
                  options={PHASES_AFTER} /></div>
        <div><label htmlFor={`pl-o-${r?.id ?? 'new'}`}>Order</label>
          <input className="field" id={`pl-o-${r?.id ?? 'new'}`} name="sort" inputMode="numeric"
                 defaultValue={r?.sort ?? (steps.length + 1) * 10} /></div>
        <div><label htmlFor={`pl-d-${r?.id ?? 'new'}`}>Due, days after handoff</label>
          <input className="field" id={`pl-d-${r?.id ?? 'new'}`} name="due_days" inputMode="numeric"
                 defaultValue={r?.due_days ?? ''} placeholder="No date" /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`pl-e-${r?.id ?? 'new'}`}>The step, in English</label>
          <input className="field" id={`pl-e-${r?.id ?? 'new'}`} name="en" required
                 defaultValue={r?.en} /></div>
        <div><label htmlFor={`pl-p-${r?.id ?? 'new'}`}>En español</label>
          <input className="field" id={`pl-p-${r?.id ?? 'new'}`} name="es" required
                 defaultValue={r?.es} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`pl-n-${r?.id ?? 'new'}`}>Needs before it can be ticked</label>
          <Choice id={`pl-n-${r?.id ?? 'new'}`} name="needs" defaultValue={r?.needs ?? ''}
                  options={NEEDS} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="active" label="In the plan" defaultOn={r ? r.active : true}
                say="Off leaves it here and stops opening it on new jobs" />
      </div>
    </>
  )

  const gated = steps.filter((r) => r.needs).length

  return (
    <EditableSection
      title="What happens after sales hands it over"
      blurb={`${steps.length} standing steps. They are copied onto a job when sales sends it forward — so changing the plan changes the next job, and nobody halfway through a build gets new homework.`}
      addLabel="Adding a step"
      actions={gated > 0 ? (
        <span className="fjawarn"><FenceMark kind="sealed">
          {gated} cannot be ticked without their figure
        </FenceMark></span>
      ) : undefined}
      addForm={may ? <RowForm action={setPlanStep} label="Add it" busy="Adding…"><Fields /></RowForm> : undefined}
    >
      <p className="note">
        Sales&rsquo; own phases are not here. The plan starts where sales stops, so a step in
        intake or on the estimate would be a to-do arriving after the work it describes was
        finished.
      </p>
      {steps.length === 0 ? <p className="empty">No plan yet.</p> : (
        PHASES_AFTER.map((ph) => {
          const mine = steps.filter((r) => r.section === ph.value)
          if (mine.length === 0) return null
          return (
            <div key={ph.value} className="fjagroup">
              <h3>{ph.label}<small>{mine.length}</small></h3>
              <div className="rlist rlist--cols"
                   style={{ ['--cols' as any]: 'minmax(0,1.6fr) minmax(0,1.2fr) 130px' }}>
                <div className="rhead"><span>Step</span><span>Español</span><span>Due</span></div>
                {mine.map((r) => (
                  <Row key={r.id} may={may} label={`Edit ${r.en}`} face={
                    <>
                      <span className="rcell rcell--lead">
                        <span className="fjname">{r.en}</span>
                        {!r.active && <FenceMark kind="absent">Off</FenceMark>}
                        {r.needs === 'navusoft_account' && (
                          <FenceMark kind="sealed" title="Not done until the number is there">
                            Needs the account number
                          </FenceMark>
                        )}
                      </span>
                      <span className="rcell">
                        <span className="rcell__lab">Español</span>
                        <span className="rcell__val">{r.es}</span>
                      </span>
                      <span className="rcell">
                        <span className="rcell__lab">Due</span>
                        <span className="rcell__val fjamono">
                          {r.due_days == null ? <span className="fjnone">no date</span>
                            : `+${r.due_days}d`}</span>
                      </span>
                    </>
                  }>
                    <RowForm action={setPlanStep}>
                      <input type="hidden" name="id" value={r.id} />
                      <Fields r={r} />
                    </RowForm>
                  </Row>
                ))}
              </div>
            </div>
          )
        })
      )}
    </EditableSection>
  )
}

// ---------------------------------------------------------------- rate book
function RateBook({ rates, seesCost, may }: {
  rates: Awaited<ReturnType<typeof loadRates>>['rates']; seesCost: boolean; may: boolean
}) {
  const placeholders = rates.filter((r) => !r.verified_on).length
  const cols = seesCost
    ? '110px minmax(0,1.8fr) 70px 100px 90px 100px'
    : '110px minmax(0,1.8fr) 70px 100px'

  const Fields = ({ r }: { r?: (typeof rates)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`c-${r?.id ?? 'new'}`}>Code</label>
          <input className="field" id={`c-${r?.id ?? 'new'}`} name="code" required
                 defaultValue={r?.code} placeholder="CL-FAB-6" /></div>
        <div><label htmlFor={`k-${r?.id ?? 'new'}`}>Kind</label>
          <Choice id={`k-${r?.id ?? 'new'}`} name="kind" defaultValue={r?.kind ?? 'material'}
                  options={RATE_KINDS.map((k) => ({ value: k.key, label: k.en }))} /></div>
        <div><label htmlFor={`u-${r?.id ?? 'new'}`}>Unit</label>
          <input className="field" id={`u-${r?.id ?? 'new'}`} name="uom"
                 defaultValue={r?.uom ?? 'LF'} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`en-${r?.id ?? 'new'}`}>Item, in English</label>
          <input className="field" id={`en-${r?.id ?? 'new'}`} name="name_en" required
                 defaultValue={r?.name_en} /></div>
        <div><label htmlFor={`es-${r?.id ?? 'new'}`}>In Spanish</label>
          <input className="field" id={`es-${r?.id ?? 'new'}`} name="name_es"
                 defaultValue={r?.name_es ?? ''} placeholder="Optional" /></div>
      </div>
      {seesCost && (
        <div className="formrow" style={{ marginTop: 12 }}>
          <div><label htmlFor={`co-${r?.id ?? 'new'}`}>What it costs us</label>
            <input className="field" id={`co-${r?.id ?? 'new'}`} name="cost" inputMode="decimal"
                   defaultValue={r?.cost ?? ''} /></div>
          <div><label htmlFor={`mk-${r?.id ?? 'new'}`}>Markup</label>
            <input className="field" id={`mk-${r?.id ?? 'new'}`} name="markup" inputMode="decimal"
                   defaultValue={r?.markup ?? ''} placeholder="1.45" /></div>
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Toggle name="verified" label="Checked against an invoice" defaultOn={false}
                say="Saving stamps today's date on it and stops calling it a placeholder" />
        <Toggle name="active" label="In use" defaultOn={r ? r.active : true}
                say="Off keeps the figure and stops offering it on a quote" />
      </div>
    </>
  )

  return (
    <EditableSection
      title="Rate book"
      blurb={`${rates.length} lines. ${seesCost
        ? 'Sell is cost times markup and is computed by the database, so the two can never disagree.'
        : 'What each line sells for. What it costs us is not shown here.'}`}
      addLabel="Adding a rate"
      actions={placeholders > 0 ? (
        <span className="fjawarn"><FenceMark kind="warn">
          {placeholders} never checked
        </FenceMark></span>
      ) : undefined}
      addForm={may ? <RowForm action={setRate} label="Add it" busy="Adding…"><Fields /></RowForm> : undefined}
    >
      {rates.length === 0 ? <p className="empty">The book is empty.</p> : (
        RATE_KINDS.map((kind) => {
          const group = rates.filter((r) => r.kind === kind.key)
          if (group.length === 0) return null
          return (
            <div key={kind.key} className="fjagroup">
              <h3>{kind.en}<small>{group.length}</small></h3>
              <div className="rlist rlist--cols" style={{ ['--cols' as any]: cols }}>
                <div className="rhead">
                  <span>Code</span><span>Item</span><span>Unit</span>
                  {seesCost && <><span>Cost</span><span>Markup</span></>}
                  <span>Sell</span>
                </div>
                {group.map((r) => {
                  const age = rateAge(r.verified_on)
                  return (
                    <Row key={r.id} may={may} label={`Edit ${r.code}`} face={
                      <>
                        <span className="rcell rcell--lead">
                          <span className="fjacode">{r.code}</span>
                        </span>
                        <span className="rcell">
                          <span className="rcell__lab">Item</span>
                          <span className="rcell__val">
                            {r.name_en}
                            {!r.active && <FenceMark kind="absent">Retired</FenceMark>}
                            {age === null
                              ? <FenceMark kind="warn" title="Never checked against an invoice">
                                  Placeholder</FenceMark>
                              : age > 365
                                ? <FenceMark kind="late" title={`Last checked ${age} days ago`}>
                                    {Math.floor(age / 30)} months old</FenceMark>
                                : null}
                          </span>
                        </span>
                        <span className="rcell">
                          <span className="rcell__lab">Unit</span>
                          <span className="rcell__val fjamono">{r.uom}</span>
                        </span>
                        {seesCost && <>
                          <span className="rcell">
                            <span className="rcell__lab">Cost</span>
                            <span className="rcell__val fjamono">{money(r.cost)}</span>
                          </span>
                          <span className="rcell">
                            <span className="rcell__lab">Markup</span>
                            <span className="rcell__val fjamono">
                              {r.markup == null ? '—' : `×${Number(r.markup)}`}</span>
                          </span>
                        </>}
                        <span className="rcell">
                          <span className="rcell__lab">Sell</span>
                          <span className="rcell__val fjamono fjasell">{money(r.sell)}</span>
                        </span>
                      </>
                    }>
                      <RowForm action={setRate}>
                        <input type="hidden" name="id" value={r.id} />
                        <Fields r={r} />
                      </RowForm>
                    </Row>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </EditableSection>
  )
}

// ------------------------------------------------------------ specs and gates
function Specs({ specs, gates, may }: {
  specs: Awaited<ReturnType<typeof loadFenceAdmin>>['specs']
  gates: Awaited<ReturnType<typeof loadFenceAdmin>>['gates']; may: boolean
}) {
  const SpecFields = ({ r }: { r?: (typeof specs)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`sc-${r?.id ?? 'new'}`}>Code</label>
          <input className="field" id={`sc-${r?.id ?? 'new'}`} name="code" required
                 defaultValue={r?.code} placeholder="CL-6-PRIV" /></div>
        <div><label htmlFor={`sk-${r?.id ?? 'new'}`}>Class</label>
          <Choice id={`sk-${r?.id ?? 'new'}`} name="cls" defaultValue={r?.cls ?? 'permanent'}
                  options={CLASSES} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`sn-${r?.id ?? 'new'}`}>Name, in English</label>
          <input className="field" id={`sn-${r?.id ?? 'new'}`} name="name_en" required
                 defaultValue={r?.name_en} /></div>
        <div><label htmlFor={`ss-${r?.id ?? 'new'}`}>In Spanish</label>
          <input className="field" id={`ss-${r?.id ?? 'new'}`} name="name_es"
                 defaultValue={r?.name_es ?? ''} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`sh-${r?.id ?? 'new'}`}>Height, feet</label>
          <input className="field" id={`sh-${r?.id ?? 'new'}`} name="height_ft" inputMode="decimal"
                 defaultValue={r?.height_ft ?? ''} /></div>
        <div><label htmlFor={`sp-${r?.id ?? 'new'}`}>Post spacing, feet</label>
          <input className="field" id={`sp-${r?.id ?? 'new'}`} name="spacing_ft" inputMode="decimal"
                 defaultValue={r?.spacing_ft ?? ''} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`so-${r?.id ?? 'new'}`}>Note</label>
          <input className="field" id={`so-${r?.id ?? 'new'}`} name="note"
                 defaultValue={r?.note ?? ''}
                 placeholder="What an estimator needs to remember about it" /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="active" label="Offered on a quote" defaultOn={r ? r.active : true}
                say="Off keeps the spec on jobs already sold and stops offering it on new ones" />
      </div>
    </>
  )

  const GateFields = ({ r }: { r?: (typeof gates)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`gc-${r?.id ?? 'new'}`}>Code</label>
          <input className="field" id={`gc-${r?.id ?? 'new'}`} name="code" required
                 defaultValue={r?.code} placeholder="GATE-VD-16" /></div>
        <div><label htmlFor={`gk-${r?.id ?? 'new'}`}>Class</label>
          <Choice id={`gk-${r?.id ?? 'new'}`} name="cls" defaultValue={r?.cls ?? 'permanent'}
                  options={CLASSES} /></div>
        <div><label htmlFor={`gw-${r?.id ?? 'new'}`}>Width, feet</label>
          <input className="field" id={`gw-${r?.id ?? 'new'}`} name="width_ft" inputMode="decimal"
                 defaultValue={r?.width_ft ?? ''} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`gn-${r?.id ?? 'new'}`}>Name, in English</label>
          <input className="field" id={`gn-${r?.id ?? 'new'}`} name="name_en" required
                 defaultValue={r?.name_en} /></div>
        <div><label htmlFor={`ge-${r?.id ?? 'new'}`}>In Spanish</label>
          <input className="field" id={`ge-${r?.id ?? 'new'}`} name="name_es"
                 defaultValue={r?.name_es ?? ''} /></div>
        <div><label htmlFor={`gr-${r?.id ?? 'new'}`}>Rate code</label>
          <input className="field" id={`gr-${r?.id ?? 'new'}`} name="rate_code"
                 defaultValue={r?.rate_code ?? ''} placeholder="What it prices from" /></div>
        <div><label htmlFor={`gb-${r?.id ?? 'new'}`}>Charge code</label>
          <input className="field" id={`gb-${r?.id ?? 'new'}`} name="charge_code"
                 defaultValue={r?.charge_code ?? ''}
                 placeholder="What it bills under" /></div>
      </div>
      <p className="fxhint">
        Two different books. The rate code is what it PRICES from on a quote; the charge code is
        what accounting BILLS it under. Leaving the charge code empty says this gate rides inside
        the fence line rather than billing on one of its own — which is what a panel gate in a
        temporary fence rental does.
      </p>
      <div style={{ marginTop: 12 }}>
        <Toggle name="active" label="Offered on a quote" defaultOn={r ? r.active : true} />
      </div>
    </>
  )

  return (
    <>
      <EditableSection
        title="Fence specs"
        blurb={`${specs.length} of them. A spec is what goes in the ground — the height, the post spacing and the words for it in both languages. The estimator prices from these, so a height that is wrong here is wrong on every quote.`}
        addLabel="Adding a spec"
        addForm={may ? <RowForm action={setSpec} label="Add it" busy="Adding…"><SpecFields /></RowForm> : undefined}
      >
        {specs.length === 0 ? <p className="empty">No specs yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: '140px minmax(0,1.8fr) 130px 90px 110px' }}>
            <div className="rhead">
              <span>Code</span><span>Spec</span><span>Class</span><span>Height</span>
              <span>Spacing</span>
            </div>
            {specs.map((r) => (
              <Row key={r.id} may={may} label={`Edit ${r.code}`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjacode">{r.code}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Spec</span>
                    <span className="rcell__val">
                      {r.name_en}
                      {!r.active && <FenceMark kind="absent">Retired</FenceMark>}
                      {r.name_es && <span className="fjsub">{r.name_es}</span>}
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Class</span>
                    <span className="rcell__val">{CLASS_WORD[r.cls] ?? r.cls}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Height</span>
                    <span className="rcell__val fjamono">{ft(r.height_ft)}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Spacing</span>
                    <span className="rcell__val fjamono">{ft(r.spacing_ft)}</span>
                  </span>
                </>
              }>
                <RowForm action={setSpec}>
                  <input type="hidden" name="id" value={r.id} />
                  <SpecFields r={r} />
                </RowForm>
              </Row>
            ))}
          </div>
        )}
      </EditableSection>

      <EditableSection
        title="Gate catalog"
        blurb={`${gates.length} gates. Width is what the opening measures, not what the leaf does — a 16-foot double drive is two 8-foot leaves and is still a 16.`}
        addLabel="Adding a gate"
        addForm={may ? <RowForm action={setGateType} label="Add it" busy="Adding…"><GateFields /></RowForm> : undefined}
      >
        {gates.length === 0 ? <p className="empty">No gates yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: '140px minmax(0,1.6fr) 120px 80px 120px 120px' }}>
            <div className="rhead">
              <span>Code</span><span>Gate</span><span>Class</span><span>Width</span>
              <span>Prices from</span><span>Bills under</span>
            </div>
            {gates.map((r) => (
              <Row key={r.id} may={may} label={`Edit ${r.code}`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjacode">{r.code}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Gate</span>
                    <span className="rcell__val">
                      {r.name_en}
                      {!r.active && <FenceMark kind="absent">Retired</FenceMark>}
                      {r.name_es && <span className="fjsub">{r.name_es}</span>}
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Class</span>
                    <span className="rcell__val">{CLASS_WORD[r.cls] ?? r.cls}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Width</span>
                    <span className="rcell__val fjamono">{ft(r.width_ft)}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Prices from</span>
                    <span className="rcell__val fjamono">
                      {r.rate_code ?? <span className="fjnone">nothing yet</span>}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Bills under</span>
                    <span className="rcell__val fjamono">
                      {r.charge_code ?? <span className="fjnone">in the fence line</span>}</span>
                  </span>
                </>
              }>
                <RowForm action={setGateType}>
                  <input type="hidden" name="id" value={r.id} />
                  <GateFields r={r} />
                </RowForm>
              </Row>
            ))}
          </div>
        )}
      </EditableSection>
    </>
  )
}

// ---------------------------------------------------------------- glossary
function Glossary({ terms, may }: {
  terms: Awaited<ReturnType<typeof loadFenceAdmin>>['glossary']; may: boolean
}) {
  const used = terms.filter((t) => t.inUse).length
  const Fields = ({ r }: { r?: (typeof terms)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`te-${r?.id ?? 'new'}`}>English</label>
          <input className="field" id={`te-${r?.id ?? 'new'}`} name="en" required
                 defaultValue={r?.en} placeholder="top rail" /></div>
        <div><label htmlFor={`ts-${r?.id ?? 'new'}`}>Español</label>
          <input className="field" id={`ts-${r?.id ?? 'new'}`} name="es" required
                 defaultValue={r?.es} placeholder="riel superior" /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`tn-${r?.id ?? 'new'}`}>Note</label>
          <input className="field" id={`tn-${r?.id ?? 'new'}`} name="note"
                 defaultValue={r?.note ?? ''}
                 placeholder="Where the two words are not quite the same thing" /></div>
      </div>
    </>
  )

  return (
    <EditableSection
      title="Trade glossary"
      blurb={`${terms.length} terms, ${used} of them in a scope of work somebody has actually written. The translator is held to this list, so “top rail” is never three different words across three jobs.`}
      addLabel="Adding a term"
      addForm={may ? <RowForm action={setTerm} label="Add it" busy="Adding…"><Fields /></RowForm> : undefined}
    >
      {terms.length === 0 ? <p className="empty">The glossary is empty.</p> : (
        <>
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1fr) minmax(0,1fr) 120px' }}>
            <div className="rhead"><span>English</span><span>Español</span><span>In use</span></div>
            {terms.map((r) => (
              <Row key={r.id} may={may} label={`Edit ${r.en}`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjname">{r.en}</span>
                    {r.note && <span className="fjsub">{r.note}</span>}
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Español</span>
                    <span className="rcell__val">{r.es}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">In use</span>
                    <span className="rcell__val">
                      {r.inUse
                        ? <FenceMark kind="done" title="Used in a scope of work" />
                        : <FenceMark kind="idle" title="On the list, not currently used" />}
                    </span>
                  </span>
                </>
              }>
                <RowForm action={setTerm}>
                  <input type="hidden" name="id" value={r.id} />
                  <Fields r={r} />
                </RowForm>
              </Row>
            ))}
          </div>
          <p className="fjakey">
            <FenceMark kind="done">Used in a live scope of work</FenceMark>
            <FenceMark kind="idle">On the list, not currently used</FenceMark>
          </p>
        </>
      )}
    </EditableSection>
  )
}

// ------------------------------------------------------- codes and billing
function Billing({ codes, rules, targets, may }: {
  codes: Awaited<ReturnType<typeof loadFenceAdmin>>['codes']
  rules: Awaited<ReturnType<typeof loadFenceAdmin>>['rules']
  targets: Awaited<ReturnType<typeof loadFenceAdmin>>['targets']; may: boolean
}) {
  const guesses = codes.filter((c) => c.provisional).length
  const opts = targets.map((t) => ({ value: t.id, label: t.name }))

  const TargetFields = ({ r }: { r?: (typeof targets)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`bn-${r?.id ?? 'new'}`}>Target</label>
          <input className="field" id={`bn-${r?.id ?? 'new'}`} name="name" required
                 defaultValue={r?.name} placeholder="Navusoft" /></div>
        <div><label htmlFor={`bt-${r?.id ?? 'new'}`}>Sends to</label>
          <input className="field" id={`bt-${r?.id ?? 'new'}`} name="to_email" type="email"
                 defaultValue={r?.to_email ?? ''} placeholder="accounting@…" /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`bi-${r?.id ?? 'new'}`}>What the person keying it needs told</label>
          <input className="field" id={`bi-${r?.id ?? 'new'}`} name="instructions"
                 defaultValue={r?.instructions ?? ''} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="active" label="In use" defaultOn={r ? r.active : true}
                say="The handoff goes to the active target" />
      </div>
    </>
  )

  const CodeFields = ({ r }: { r?: (typeof codes)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`cc-${r?.id ?? 'new'}`}>Code</label>
          <input className="field" id={`cc-${r?.id ?? 'new'}`} name="code" required
                 defaultValue={r?.code} placeholder="INST-CL" /></div>
        <div><label htmlFor={`cd-${r?.id ?? 'new'}`}>What it bills</label>
          <input className="field" id={`cd-${r?.id ?? 'new'}`} name="description" required
                 defaultValue={r?.description} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`ct-${r?.id ?? 'new'}`}>Keyed into</label>
          <Choice id={`ct-${r?.id ?? 'new'}`} name="target_id" defaultValue={r?.target_id ?? ''}
                  placeholder="No particular system" options={opts} /></div>
        <div><label htmlFor={`cy-${r?.id ?? 'new'}`}>Cycle, days</label>
          <input className="field" id={`cy-${r?.id ?? 'new'}`} name="cycle_days" inputMode="numeric"
                 defaultValue={r?.cycle_days ?? ''} placeholder="28, on a recurring code" /></div>
        <div><label htmlFor={`cs-${r?.id ?? 'new'}`}>Order</label>
          <input className="field" id={`cs-${r?.id ?? 'new'}`} name="sort" inputMode="numeric"
                 defaultValue={r?.sort ?? 0} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`cn-${r?.id ?? 'new'}`}>Note</label>
          <input className="field" id={`cn-${r?.id ?? 'new'}`} name="note"
                 defaultValue={r?.note ?? ''} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="recurring" label="Bills again every cycle" defaultOn={r?.recurring ?? false}
                say="A rental bills every cycle; everything else bills once" />
        <Toggle name="provisional" label="Still a guess" defaultOn={r?.provisional ?? true}
                say="Leave it on until the code has been matched to the real import template" />
        <Toggle name="active" label="In use" defaultOn={r ? r.active : true} />
      </div>
    </>
  )

  const RuleFields = ({ r }: { r?: (typeof rules)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`rk-${r?.id ?? 'new'}`}>Class of work</label>
          <Choice id={`rk-${r?.id ?? 'new'}`} name="cls" defaultValue={r?.cls ?? 'permanent'}
                  options={CLASSES.map((c) => ({ value: c.value, label: c.label }))} /></div>
        <div><label htmlFor={`rt-${r?.id ?? 'new'}`}>Collects</label>
          <Choice id={`rt-${r?.id ?? 'new'}`} name="takes" defaultValue={r?.takes ?? 'fence'}
                  options={[
                    { value: 'fence', label: 'Everything but the gates' },
                    { value: 'gate', label: 'Each gate, by default' },
                  ]} /></div>
        <div><label htmlFor={`rc-${r?.id ?? 'new'}`}>Bills under</label>
          <input className="field" id={`rc-${r?.id ?? 'new'}`} name="charge_code" required
                 defaultValue={r?.charge_code ?? ''} placeholder="INST-CL" /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`rn-${r?.id ?? 'new'}`}>Why, for whoever reads this next</label>
          <input className="field" id={`rn-${r?.id ?? 'new'}`} name="note"
                 defaultValue={r?.note ?? ''} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="active" label="In use" defaultOn={r ? r.active : true}
                say="Retiring a gate rule says its gates bill inside the fence line" />
      </div>
    </>
  )

  return (
    <>
      <EditableSection
        title="Where the keying sheet goes"
        blurb="Fence Builder never invoices. It writes accounting one message laid out to be keyed from, with the whole job attached — and where that message goes, and in what words, belongs to the target rather than to the module."
        addLabel="Adding a target"
        addForm={may ? <RowForm action={setTarget} label="Add it" busy="Adding…"><TargetFields /></RowForm> : undefined}
      >
        {targets.length === 0 ? (
          <p className="empty">Nothing to send to yet, so a finished job has nowhere to go.</p>
        ) : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: 'minmax(0,1fr) minmax(0,1.2fr) 120px' }}>
            <div className="rhead"><span>Target</span><span>Sends to</span><span>State</span></div>
            {targets.map((r) => (
              <Row key={r.id} may={may} label={`Edit ${r.name}`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjname">{r.name}</span>
                    {r.instructions && <span className="fjsub">{r.instructions}</span>}
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Sends to</span>
                    <span className="rcell__val fjamono">
                      {r.to_email ?? <span className="fjnone">nobody yet</span>}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">State</span>
                    <span className="rcell__val">
                      {r.active ? <FenceMark kind="done">Active</FenceMark>
                                : <FenceMark kind="absent">Off</FenceMark>}
                    </span>
                  </span>
                </>
              }>
                <RowForm action={setTarget}>
                  <input type="hidden" name="id" value={r.id} />
                  <TargetFields r={r} />
                </RowForm>
              </Row>
            ))}
          </div>
        )}
      </EditableSection>

      <EditableSection
        title="Charge codes"
        blurb={`${codes.length} codes. These are what the handoff prints beside each line, so somebody in accounting can key the job without deciding anything.`}
        addLabel="Adding a code"
        actions={guesses > 0 ? (
          <span className="fjawarn"><FenceMark kind="warn">
            {guesses} still a guess
          </FenceMark></span>
        ) : undefined}
        addForm={may ? <RowForm action={setChargeCode} label="Add it" busy="Adding…"><CodeFields /></RowForm> : undefined}
      >
        {guesses > 0 && (
          <p className="note">
            Navusoft publishes no import schema, so these were written from what the sheet has to
            say rather than from a template. Get the real one before anything here is treated as an
            exporter — and clear the mark on each code as it is matched.
          </p>
        )}
        {codes.length === 0 ? <p className="empty">No charge codes yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: '140px minmax(0,1.8fr) 140px 110px' }}>
            <div className="rhead">
              <span>Code</span><span>What it bills</span><span>Kind</span><span>Checked</span>
            </div>
            {codes.map((r) => (
              <Row key={r.id} may={may} label={`Edit ${r.code}`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjacode">{r.code}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">What it bills</span>
                    <span className="rcell__val">
                      {r.description}
                      {!r.active && <FenceMark kind="absent">Retired</FenceMark>}
                      {r.note && <span className="fjsub">{r.note}</span>}
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Kind</span>
                    <span className="rcell__val">
                      {r.recurring
                        ? `Every ${r.cycle_days ?? 28} days`
                        : 'One time'}
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Checked</span>
                    <span className="rcell__val">
                      {r.provisional
                        ? <FenceMark kind="warn" title="Not yet matched to a real import template">
                            Guess</FenceMark>
                        : <FenceMark kind="done" title="Matched to the import template" />}
                    </span>
                  </span>
                </>
              }>
                <RowForm action={setChargeCode}>
                  <input type="hidden" name="id" value={r.id} />
                  <CodeFields r={r} />
                </RowForm>
              </Row>
            ))}
          </div>
        )}
      </EditableSection>

      <EditableSection
        title="How a quote rolls up into those codes"
        blurb="The recipe turns a measure into priced lines. This turns priced lines into the handful of lines accounting keys: one line for the fence, and a line for each gate that bills on its own. Nothing is re-priced on the way — it is a roll-up of what was sold."
        addLabel="Adding a rule"
        addForm={may ? <RowForm action={setChargeRule} label="Add it" busy="Adding…"><RuleFields /></RowForm> : undefined}
      >
        <p className="note">
          <b>An absent gate rule is a statement, not a gap.</b> A temporary fence rental includes
          its panel gates, so temporary has no gate rule and its gates bill inside the fence line.
          A class with no <i>fence</i> rule cannot be billed at all, and the handoff screen says so
          by name rather than quietly billing it as something else.
        </p>
        {MISSING.filter((c) => !rules.some((r) => r.cls === c && r.takes === 'fence' && r.active))
          .map((c) => (
            <p className="note note--err" key={c}>
              <b>A {c} job has no install code.</b> Nothing on a {c} job can be handed to
              accounting until one is here.
            </p>
          ))}
        {rules.length === 0 ? <p className="empty">No roll-up rules yet.</p> : (
          <div className="rlist rlist--cols"
               style={{ ['--cols' as any]: '130px 150px 140px minmax(0,1fr)' }}>
            <div className="rhead">
              <span>Class</span><span>Collects</span><span>Bills under</span><span>Why</span>
            </div>
            {rules.map((r) => (
              <Row key={r.id} may={may} label={`Edit the ${r.cls} ${r.takes} rule`} face={
                <>
                  <span className="rcell rcell--lead">
                    <span className="fjname">{CLASS_WORD[r.cls] ?? r.cls}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Collects</span>
                    <span className="rcell__val">
                      {r.takes === 'fence' ? 'Everything but the gates' : 'Each gate, by default'}
                      {!r.active && <FenceMark kind="absent">Retired</FenceMark>}
                    </span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Bills under</span>
                    <span className="rcell__val fjacode">{r.charge_code}</span>
                  </span>
                  <span className="rcell">
                    <span className="rcell__lab">Why</span>
                    <span className="rcell__val">
                      {r.note ?? <span className="fjnone">nothing said</span>}</span>
                  </span>
                </>
              }>
                <RowForm action={setChargeRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <RuleFields r={r} />
                </RowForm>
              </Row>
            ))}
          </div>
        )}
      </EditableSection>
    </>
  )
}

// ------------------------------------------------------------------- crews
function Crews({ crews, people, may }: {
  crews: Awaited<ReturnType<typeof loadFenceAdmin>>['crews']
  people: Awaited<ReturnType<typeof loadFenceAdmin>>['people']; may: boolean
}) {
  const foremen = people.filter((p) => p.job_role === 'field')
    .map((p) => ({ value: p.person_id, label: p.name }))

  const Fields = ({ r }: { r?: (typeof crews)[number] }) => (
    <>
      <div className="formrow">
        <div><label htmlFor={`kn-${r?.id ?? 'new'}`}>Crew</label>
          <input className="field" id={`kn-${r?.id ?? 'new'}`} name="name" required
                 defaultValue={r?.name} placeholder="Crew 4" /></div>
        <div><label htmlFor={`kf-${r?.id ?? 'new'}`}>Foreman</label>
          <Choice id={`kf-${r?.id ?? 'new'}`} name="foreman_id" defaultValue={r?.foreman_id ?? ''}
                  placeholder="Nobody yet" options={foremen} /></div>
      </div>
      <div className="formrow" style={{ marginTop: 12 }}>
        <div><label htmlFor={`ks-${r?.id ?? 'new'}`}>People on it</label>
          <input className="field" id={`ks-${r?.id ?? 'new'}`} name="size" inputMode="numeric"
                 defaultValue={r?.size ?? ''} /></div>
        <div><label htmlFor={`kl-${r?.id ?? 'new'}`}>Their ticket arrives in</label>
          <Choice id={`kl-${r?.id ?? 'new'}`} name="lang" defaultValue={r?.lang ?? 'es'}
                  options={LANGS} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Toggle name="badged" label="Badged for secure sites" defaultOn={r?.badged ?? false}
                say="A badged crew is the only one a secure site will admit" />
        <Toggle name="active" label="Working" defaultOn={r ? r.active : true} />
      </div>
      {foremen.length === 0 && <p className="note">
        Nobody on Fence Builder does the field job yet, so there is nobody to name as foreman.
        {' '}<Link href="/admin/fence?s=people">People and access</Link> is where that is set.
      </p>}
    </>
  )

  return (
    <EditableSection
      title="Crews"
      blurb={`${crews.length} crews. The crew on a job decides which language its ticket is written in and whether a secure site will let it through the gate.`}
      addLabel="Adding a crew"
      addForm={may ? <RowForm action={setCrew} label="Add it" busy="Adding…"><Fields /></RowForm> : undefined}
    >
      {crews.length === 0 ? <p className="empty">No crews yet.</p> : (
        <div className="rlist rlist--cols"
             style={{ ['--cols' as any]: 'minmax(0,1.4fr) minmax(0,1fr) 120px 130px' }}>
          <div className="rhead">
            <span>Crew</span><span>Foreman</span><span>Reads</span><span>Badged</span>
          </div>
          {crews.map((r) => (
            <Row key={r.id} may={may} label={`Edit ${r.name}`} face={
              <>
                <span className="rcell rcell--lead">
                  <span className="fjname">{r.name}</span>
                  <span className="fjsub">
                    {r.size ? `${r.size} people` : 'Size not set'}
                    {!r.active && ' · not working'}
                  </span>
                </span>
                <span className="rcell">
                  <span className="rcell__lab">Foreman</span>
                  <span className="rcell__val">
                    {r.foreman ?? <span className="fjnone">nobody yet</span>}</span>
                </span>
                <span className="rcell">
                  <span className="rcell__lab">Reads</span>
                  <span className="rcell__val">{LANG_NAME[r.lang]}</span>
                </span>
                <span className="rcell">
                  <span className="rcell__lab">Badged</span>
                  <span className="rcell__val">
                    {r.badged ? <FenceMark kind="done">Badged</FenceMark>
                              : <FenceMark kind="idle" title="Not badged" />}
                  </span>
                </span>
              </>
            }>
              <RowForm action={setCrew}>
                <input type="hidden" name="id" value={r.id} />
                <Fields r={r} />
              </RowForm>
            </Row>
          ))}
        </div>
      )}
    </EditableSection>
  )
}

// ---------------------------------------------------------------- pricing
function Pricing({ read, may }: {
  read: Awaited<ReturnType<typeof loadFenceAdmin>>['settings']; may: boolean
}) {
  const settings = read.row
  const seesCost = read.seesCost

  return (
    <>
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Pricing settings</h2>
          <p>Labor is hours, not dollars per foot. A wage change moves one field here and the hours
            stay true, because they describe the work rather than the payroll.</p>
        </div></div>

        {/* Read-only for everybody who does not administer the account: the
            numbers still matter to a salesperson working out whether a quote
            will clear the floor, and a form they cannot submit is worse than a
            list they can read. */}
        {!may ? (
          <div className="fjaown">
            <div className="fjaown__r"><b>Margin floor</b>
              <span className="fjamono">{settings?.margin_floor ?? 35}%</span></div>
            <div className="fjaown__r"><b>Default waste</b>
              <span className="fjamono">{settings?.waste_pct ?? 4}%</span></div>
            {seesCost && <>
              <div className="fjaown__r"><b>Burdened crew rate</b>
                <span className="fjamono">{money(settings?.crew_rate ?? null)} / hr</span></div>
              <div className="fjaown__r"><b>Labor markup</b>
                <span className="fjamono">×{settings?.labor_markup ?? 1.85}</span></div>
            </>}
            <div className="fjaown__r"><b>Crew links</b>
              <span>{(settings?.link_expires ?? true)
                ? <FenceMark kind="sealed">Expire when the job is installed</FenceMark>
                : <FenceMark kind="warn">Stay open after the job is installed</FenceMark>}</span></div>
          </div>
        ) : (
        <ActionForm action={setFenceSettings} label="Save settings">
          <div className="formrow">
            <div><label htmlFor="ps-floor">Margin floor, %</label>
              <input className="field" id="ps-floor" name="margin_floor" inputMode="decimal"
                     defaultValue={settings?.margin_floor ?? 35} />
              <p className="fjahint">Below this a quote needs a manager to release it.</p></div>
            <div><label htmlFor="ps-waste">Default waste, %</label>
              <input className="field" id="ps-waste" name="waste_pct" inputMode="decimal"
                     defaultValue={settings?.waste_pct ?? 4} />
              <p className="fjahint">Added to fabric and rail on every takeoff.</p></div>
          </div>

          {seesCost ? (
            <div className="formrow" style={{ marginTop: 12 }}>
              <div><label htmlFor="ps-rate">Burdened crew rate, $ / hr</label>
                <input className="field" id="ps-rate" name="crew_rate" inputMode="decimal"
                       defaultValue={settings?.crew_rate ?? 96} />
                <p className="fjahint">What an hour of crew costs us, all in — the figure a
                  new labor line in the rate book is seeded from. A job prices its hours off the
                  LAB- rate for its class, not off this.</p></div>
              <div><label htmlFor="ps-markup">Labor markup</label>
                <input className="field" id="ps-markup" name="labor_markup" inputMode="decimal"
                       defaultValue={settings?.labor_markup ?? 1.85} />
                <p className="fjahint">The markup a new labor line starts at. The rate book is
                  where a live one is changed.</p></div>
            </div>
          ) : (
            /* Not shown and not posted. What an hour costs us and what we
               multiply it by are together a cost, and the database revokes
               both -- so the fields are absent rather than greyed, and saving
               this form leaves them exactly as they were. */
            <p className="note" style={{ marginTop: 12 }}>
              What crew hours cost us is not shown to you, so those two fields are not here.
              Saving this form leaves them as they are.
            </p>
          )}

          <div style={{ marginTop: 14 }}>
            <Toggle name="link_expires" label="Crew links expire when the job is installed"
                    defaultOn={settings?.link_expires ?? true}
                    say="An old link should be a closed door, not a stale page" />
          </div>
        </ActionForm>
        )}
      </section>

      {/* Two things people look for on this screen that are not settings. Drawn
          as what they are -- facts -- because a toggle nobody may move is a
          support call, and a toggle that could be moved would be a mistake. */}
      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>The crew ticket, and what it will never carry</h2>
          <p>Built into the module rather than configured, so no account can switch it off.</p>
        </div></div>
        <div className="fjafacts">
          <div className="fjafact">
            <b>Prices on the ticket</b>
            <span><FenceMark kind="sealed">Quantities yes, dollars never</FenceMark></span>
            <p>Every money column in Fence Builder is revoked from the ticket’s own connection, so
              there is no query the crew’s page could run that returns one.</p>
          </div>
          <div className="fjafact">
            <b>The link itself</b>
            <span><FenceMark kind="sealed">No password, one job</FenceMark></span>
            <p>A crew link resolves to exactly one job and is cycled from the job’s own screen.
              Unknown, revoked and expired all give the same answer.</p>
          </div>
          <div className="fjafact">
            <b>Preliminary stamp</b>
            <span><FenceMark kind="warn">Always on</FenceMark></span>
            <p>Every figure that comes off the estimator says it is preliminary, and sales cannot
              remove the stamp.</p>
          </div>
        </div>
      </section>
    </>
  )
}
