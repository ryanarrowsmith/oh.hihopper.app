import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import {
  MEASURES, STEPS, NOTE_KINDS, DOC_KINDS, CEILING, PROMPT_AT,
  daysSince, lastQuarters, quarterLabel, quarterStart, stanceIn,
} from '@/lib/staffing'
import Avatar from '@/components/Avatar'
import ActionForm from '@/components/ActionForm'
import StaffQuarters from '@/components/StaffQuarters'
import Fold from '@/components/Fold'
import { saveReview, addNote, saveMeeting, addDocument } from '@/app/actions/staffing'

export const dynamic = 'force-dynamic'

/**
 * One person's file.
 *
 * Everything on this page is read with the viewer's own session, so the page
 * that renders for somebody who may not open this record is not a page with
 * empty sections -- hopper.person refuses the row and this is a 404. Which is
 * the honest answer: whether a record exists is itself a fact about somebody.
 */
export default async function Page({ params }: { params: { person: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const stance = await stanceIn(session.accountId)

  // Your own file is the documents view, because your scores and your notes
  // are not yours to read -- and a page that showed you their shape would tell
  // you more than showing them would.
  if (stance.personId && params.person === stance.personId) redirect('/staffing')

  const { data: who } = await db.schema('hopper').from('person')
    .select('id, full_name, role_title, photo_url, entity_id, manager_id, starts_on, email')
    .eq('id', params.person).maybeSingle()
  if (!who) notFound()

  const [{ data: reviews }, { data: notes }, { data: meets }, { data: docs },
         { data: ents }, { data: bosses }] = await Promise.all([
    db.schema('hopper').from('staff_review')
      .select('id, period, caring, communication, reliability, job_knowledge, score, summary, settled')
      .eq('person_id', who.id).order('period', { ascending: false }),
    db.schema('hopper').from('staff_note')
      .select('id, kind, body, happened_on, author_id')
      .eq('person_id', who.id).order('happened_on', { ascending: false }),
    db.schema('hopper').from('staff_meeting')
      .select('id, day, agenda, notes, held')
      .eq('person_id', who.id).order('day', { ascending: false }),
    db.schema('hopper').from('staff_document')
      .select('id, kind, title, happened_on, sensitive, bytes')
      .eq('person_id', who.id).order('happened_on', { ascending: false }),
    db.schema('hopper').from('entity').select('id, name'),
    db.schema('hopper').from('person').select('id, full_name'),
  ])

  const orgName = (ents ?? []).find((e: any) => e.id === who.entity_id)?.name ?? null
  const nameOf = new Map<string, string>((bosses ?? []).map((p: any) => [p.id, p.full_name]))

  const settled = (reviews ?? []).filter((r: any) => r.settled)
  const byPeriod = new Map((reviews ?? []).map((r: any) => [r.period, r]))
  const quarters = lastQuarters(8).map((p) => {
    const r: any = byPeriod.get(p)
    return { period: p, score: r?.settled ? r.score : null }
  })

  const thisQuarter = quarterStart()
  const current: any = byPeriod.get(thisQuarter) ?? null
  const lastHeld = (meets ?? []).find((m: any) => m.held)?.day ?? null
  const since = daysSince(lastHeld)

  const mayEdit = stance.mayEdit

  return (
    <>
      <nav className="crumbs">
        <Link className="crumbs__step" href="/staffing">Staffing</Link>
        <span className="crumbs__sep">/</span>
        <span className="crumbs__plain">{who.full_name}</span>
      </nav>

      <header className="sthead">
        <Avatar name={who.full_name} src={who.photo_url} size={72} />
        <div className="sthead__t">
          <h1>{who.full_name}</h1>
          <p>{[who.role_title, orgName].filter(Boolean).join(' · ') || 'No title yet'}</p>
          <p className="sthead__line">
            {who.manager_id
              ? <>Reports to {nameOf.get(who.manager_id) ?? 'somebody you cannot see'}</>
              : 'Reports to nobody on the roster'}
            {who.starts_on && <> · started {who.starts_on}</>}
          </p>
        </div>
        <dl className="stfacts">
          <div>
            <dt>Last settled</dt>
            <dd>{settled[0]?.score != null ? `${settled[0].score} of ${CEILING}` : '—'}</dd>
            <span>{settled[0] ? quarterLabel(settled[0].period) : 'never scored'}</span>
          </div>
          <div className={since !== null && since > 90 ? 'is-stale' : undefined}>
            <dt>One-to-one</dt>
            <dd>{since === null ? 'Never' : since === 0 ? 'Today' : `${since}d`}</dd>
            <span>{lastHeld ?? 'nothing logged'}</span>
          </div>
          <div>
            <dt>On file</dt>
            <dd>{(notes ?? []).length + (docs ?? []).length}</dd>
            <span>{(notes ?? []).length} notes · {(docs ?? []).length} documents</span>
          </div>
        </dl>
      </header>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Results</h2>
          <p>Four measures a quarter. Exceeds 3, Meets 2, Below 1 — so twelve is the ceiling.</p>
        </div></div>
        <StaffQuarters quarters={quarters} />

        {settled.length > 0 && (
          <div className="tblwrap">
            <table className="tbl stmeas">
              <thead>
                <tr>
                  <th>Quarter</th>
                  {MEASURES.map((m) => <th key={m.key}>{m.label}</th>)}
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((r: any) => (
                  <tr key={r.id}>
                    <td><b>{quarterLabel(r.period)}</b></td>
                    {MEASURES.map((m) => (
                      <td key={m.key}>
                        {STEPS.find((s) => s.n === r[m.key])?.word ?? '—'}
                      </td>
                    ))}
                    <td className={r.score <= PROMPT_AT ? 'is-low' : undefined}>
                      <b>{r.score}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mayEdit && (
          <Fold open={!current?.settled}
                title={`Score ${quarterLabel(thisQuarter)}`}
                note={current ? (current.settled ? 'settled' : 'draft in progress') : 'not started'}>
            <ActionForm action={saveReview} label="Save this quarter" busy="Saving…">
              <input type="hidden" name="person_id" value={who.id} />
              <input type="hidden" name="period" value={thisQuarter} />
              <div className="stscore">
                {MEASURES.map((m) => (
                  <fieldset key={m.key} className="stscore__m">
                    <legend>{m.label}</legend>
                    {STEPS.map((s) => (
                      <label key={s.n}>
                        <input type="radio" name={m.key} value={s.n}
                               defaultChecked={current?.[m.key] === s.n} />
                        <span>{s.word}</span>
                        <i>{s.n}</i>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
              <div className="formrow">
                <label htmlFor="summary">What the quarter came down to</label>
                <textarea id="summary" name="summary" rows={3}
                          defaultValue={current?.summary ?? ''} />
              </div>
              <label className="togline">
                <input type="checkbox" name="settled" defaultChecked={!!current?.settled} />
                <span>Settled — it counts, and it appears in the stack ranking</span>
              </label>
            </ActionForm>
          </Fold>
        )}
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Record</h2>
          <p>What happened, in the order it happened.</p>
        </div></div>

        {(notes ?? []).length === 0
          ? <p className="empty">Nothing written down yet.</p>
          : <ul className="stnotes">
              {(notes ?? []).map((n: any) => (
                <li key={n.id} className={`stnote stnote--${n.kind}`}>
                  <span className="stnote__k">
                    {NOTE_KINDS.find((k) => k.key === n.kind)?.label ?? n.kind}
                  </span>
                  <p>{n.body}</p>
                  <em>{n.happened_on}
                    {n.author_id && nameOf.has(n.author_id) && <> · {nameOf.get(n.author_id)}</>}
                  </em>
                </li>
              ))}
            </ul>}

        {mayEdit && (
          <Fold open={false} title="Write something down" note="note, compliment or coaching">
            <ActionForm action={addNote} label="Add to the record" busy="Saving…">
              <input type="hidden" name="person_id" value={who.id} />
              <div className="formrow">
                <label htmlFor="kind">What kind</label>
                <select id="kind" name="kind" defaultValue="general">
                  {NOTE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </div>
              <div className="formrow">
                <label htmlFor="happened_on">When</label>
                <input id="happened_on" name="happened_on" type="date"
                       defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="formrow formrow--lean">
                <label htmlFor="body">What happened</label>
                <textarea id="body" name="body" rows={4} required />
              </div>
            </ActionForm>
          </Fold>
        )}
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>One-to-ones</h2>
          <p>Kept here rather than in Meetings, because what is said in one is the
             same sensitivity as the notes beside it. Only the date goes out — onto
             your own calendar.</p>
        </div></div>

        {(meets ?? []).length === 0
          ? <p className="empty">No one-to-ones logged.</p>
          : <ul className="st121s">
              {(meets ?? []).map((m: any) => (
                <li key={m.id} className={m.held ? 'is-held' : 'is-ahead'}>
                  <b>{m.day}</b>
                  <span>{m.held ? 'Held' : 'On the calendar'}</span>
                  {(m.agenda || m.notes) && <p>{m.notes || m.agenda}</p>}
                </li>
              ))}
            </ul>}

        {mayEdit && (
          <Fold open={false} title="Log or schedule a one-to-one" note="date, and what it was about">
            <ActionForm action={saveMeeting} label="Save" busy="Saving…">
              <input type="hidden" name="person_id" value={who.id} />
              <div className="formrow">
                <label htmlFor="day">Date</label>
                <input id="day" name="day" type="date" required
                       defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="formrow formrow--lean">
                <label htmlFor="agenda">What it is about</label>
                <input id="agenda" name="agenda" type="text" />
              </div>
              <div className="formrow formrow--lean">
                <label htmlFor="notes">What was said</label>
                <textarea id="notes" name="notes" rows={4} />
              </div>
              <label className="togline">
                <input type="checkbox" name="held" defaultChecked />
                <span>It happened — untick to put a future one on your calendar</span>
              </label>
            </ActionForm>
          </Fold>
        )}
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Documents</h2>
          <p>Anything filed against this record. Marking one sensitive takes it out
             of {who.full_name.split(' ')[0]}&rsquo;s own view and changes nothing else.</p>
        </div></div>

        {(docs ?? []).length === 0
          ? <p className="empty">Nothing on file.</p>
          : <ul className="stdocs">
              {(docs ?? []).map((d: any) => (
                <li key={d.id}>
                  <a href={`/api/staff-doc/${d.id}`} target="_blank" rel="noreferrer">{d.title}</a>
                  <em>{DOC_KINDS.find((k) => k.key === d.kind)?.label ?? d.kind}</em>
                  <u>{d.happened_on}</u>
                  {d.sensitive && <span className="stseal">Sensitive</span>}
                </li>
              ))}
            </ul>}

        {mayEdit && (
          <Fold open={false} title="File a document" note="25MB, any format">
            <ActionForm action={addDocument} label="Upload" busy="Uploading…">
              <input type="hidden" name="person_id" value={who.id} />
              <div className="formrow">
                <label htmlFor="title">What it is</label>
                <input id="title" name="title" type="text" placeholder="Left blank, the file name is used" />
              </div>
              <div className="formrow">
                <label htmlFor="dkind">Kind</label>
                <select id="dkind" name="kind" defaultValue="other">
                  {DOC_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </div>
              <div className="formrow">
                <label htmlFor="dwhen">Dated</label>
                <input id="dwhen" name="happened_on" type="date"
                       defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="formrow formrow--lean">
                <label htmlFor="file">The file</label>
                <input id="file" name="file" type="file" required />
              </div>
              <label className="togline">
                <input type="checkbox" name="sensitive" />
                <span>Sensitive — {who.full_name.split(' ')[0]} does not see this one</span>
              </label>
            </ActionForm>
          </Fold>
        )}
      </section>
    </>
  )
}
