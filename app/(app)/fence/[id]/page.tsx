import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import {
  loadJob, fenceStance, howToDraw, loadRights, OWNERS, SECTIONS, ROLE_WORD,
  type Section, type JobRole, type Task,
} from '@/lib/fence'
import FenceTasks from '@/components/FenceTasks'
import ActionForm from '@/components/ActionForm'
import { RecordRow } from '@/components/RowEdit'
import GrowText from '@/components/GrowText'
import Mentioned from '@/components/Mentioned'
import NoteAttach from '@/components/NoteAttach'
import type { Named } from '@/lib/mentions'
import { handToPm, setJobPlace, noteForBilling, addNote } from '@/app/actions/fence'

export const dynamic = 'force-dynamic'

/**
 * One job, grouped by whose desk it is on.
 *
 * FOUR TABS, NOT FIVE BANDS. A phase answered "where is this job". A tab answers
 * "whose desk is it on", which is what somebody opening the page is actually
 * asking — and it is the question the mark on every section was already
 * answering one at a time. See OWNERS in lib/fence.ts for what that rearranges.
 *
 * The tabs are LINKS carrying `?who=`, exactly as the admin panel's sections
 * are: a URL somebody can send, a back button that works, and nothing that has
 * to hydrate before the page is readable. The tab holding the work opens when
 * you arrive; nobody chooses it, the job's stage does.
 *
 * TWO RULES RUN THROUGH THE REST OF IT.
 *
 * Materials, not labels. A sealed section is a quiet card, the one carrying the
 * work has an amber spine, everything else is plain. The per-section marks came
 * off: four sections under a tab called "Project manager", each captioned
 * YOURS · EDIT, was the page reading itself aloud. Amber now means exactly one
 * thing on this screen — here is the work.
 *
 * Finished work sinks, at both levels. Ticked steps fold under the open ones
 * inside a section (see FenceTasks), and a section with nothing left in it drops
 * below the sections that still want something. Signing in puts your work first.
 */

/** The sections with a screen behind them. A heading that is not a link is a
 *  heading with nothing to open yet rather than a dead one. */
const HAS_SCREEN: Partial<Record<Section, string>> = {
  estimate: 'estimate',
  survey: 'survey',
  schedule: 'schedule',
  sow: 'sow',
  closeout: 'closeout',
  billing: 'billing',
}

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ who?: string }>
}) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const { id } = await params
  const loaded = await loadJob(session.accountId, id)
  if (!loaded) notFound()

  const { job, tasks, seals, place } = loaded
  const [{ jobRole }, rights, { data: options }] = await Promise.all([
    fenceStance(session.accountId),
    loadRights(session.accountId),
    /* The quotes, because sending the job forward has to say WHICH ONE was sold.
       After the seal nobody can — hopper_fence_edits checks the seal before it
       checks anything else, administrator included — so the question is asked
       here, at the last moment it can still be answered. */
    supabaseServer().schema('hopper').from('fence_option')
      .select('id, label, price, accepted')
      .eq('account_id', session.accountId).eq('job_id', id)
      .order('priced_at', { ascending: false }),
  ])

  /* What the project manager wants accounting told. Read here so close-out can
     show what was already said rather than an empty box beside a full record. */
  const [{ data: billNotes }, { data: wentOut }, { data: log }, { data: dir }] =
    await Promise.all([
    supabaseServer().schema('hopper').from('fence_note')
      .select('id, body, created_at, author_id')
      .eq('account_id', session.accountId).eq('job_id', id).eq('section', 'billing')
      .order('created_at', { ascending: false }).limit(3),
    // The lock. Once the letter has gone, the note it carried stops moving.
    supabaseServer().schema('hopper').from('fence_handoff')
      .select('sent_at').eq('account_id', session.accountId).eq('job_id', id)
      .order('sent_at', { ascending: false }).limit(1),
    /* THE LOG. One stream per job, newest first — every note anybody has left
       against any section, plus whatever the crew wrote from a ticket. It is
       the job's memory: the reason a gate moved, the day the locate came back,
       what the customer said on the phone. */
    supabaseServer().schema('hopper').from('fence_note')
      .select('id, body, section, created_at, author_id, by_crew, file_path, file_name, file_mime, file_bytes')
      .eq('account_id', session.accountId).eq('job_id', id)
      .order('created_at', { ascending: false }).limit(60),
    supabaseServer().schema('hopper').from('directory')
      .select('id, full_name').eq('active', true),
  ])
  const notes = (log ?? []) as
    { id: string; body: string; section: Section | null; created_at: string
      author_id: string | null; by_crew: string | null
      file_path: string | null; file_name: string | null
      file_mime: string | null; file_bytes: number | null }[]
  const wrote = new Map(((dir ?? []) as any[]).map((p) => [p.id, p.full_name as string]))
  const roster: Named[] = ((dir ?? []) as any[]).map((p) => ({ id: p.id, name: p.full_name }))
  const toBilling = (billNotes ?? []) as
    { id: string; body: string; created_at: string; author_id: string | null }[]
  const handedOff = ((wentOut ?? []) as { sent_at: string }[])[0] ?? null
  const mineToBilling = toBilling.find((n) => n.author_id === session.personId) ?? null
  const quotes = (options ?? []) as { id: string; label: string; price: number | null; accepted: boolean }[]
  const soldOne = quotes.find((q) => q.accepted) ?? null

  const sealed = new Set<Section>(seals.map((s) => s.section))
  const ownerOf = (sec: Section) => SECTIONS.find((s) => s.key === sec)!.owner
  const reached = SECTIONS.findIndex((s) => s.key === job.reached)

  /* What each tab is holding. A count says 2 / 2 is finished and 0 / 4 has not
     started, so neither needed a mark of its own — only "where the work is"
     did, and that is the dot. */
  const tabs = OWNERS.map((role) => {
    const mine = SECTIONS.filter((s) => s.owner === role).map((s) => s.key)
    const ts = tasks.filter((t) => mine.includes(t.section))
    return {
      role,
      sections: mine,
      total: ts.length,
      done: ts.filter((t) => t.done).length,
      /* A job that entered at the survey never had a sales phase. Those sections
         read as NOT USED rather than sitting unfinished forever. */
      skipped: mine.every((s) => SECTIONS.findIndex((x) => x.key === s) < reached),
      holdsWork: ownerOf(job.stage) === role,
    }
  })

  const asked = (await searchParams).who as JobRole | undefined
  const who: JobRole = asked && OWNERS.includes(asked) ? asked : ownerOf(job.stage)
  const tab = tabs.find((t) => t.role === who)!

  /* Sections still wanting something stay in the order the work runs; a section
     with nothing left drops below them, keeping that order among themselves. */
  const openIn = (sec: Section) => tasks.some((t) => t.section === sec && !t.done)
  const shown = [...tab.sections].sort((a, b) => Number(openIn(b)) - Number(openIn(a)))

  const mayPlace = howToDraw('intake', jobRole, sealed, rights.mayManage) === 'edit'
    || howToDraw('survey', jobRole, sealed, rights.mayManage) === 'edit'
  const where = place
    ? [place.line1, [place.city, place.region].filter(Boolean).join(', '), place.postcode]
        .filter(Boolean).join(', ')
    : job.site_address
  const role = jobRole ? ROLE_WORD[jobRole] : rights.mayManage ? 'Administrator' : 'Reading only'

  const Chip = ({ t }: { t: (typeof tabs)[number] }) => (
    <>
      {t.holdsWork && <i className="fjadot" />}
      {ROLE_WORD[t.role]}
      <span className="fjan">{t.skipped ? 'Not used' : `${t.done} / ${t.total}`}</span>
    </>
  )

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{job.name}</h1>
        <p className="scopeline"><span>
          {job.ref}{job.customer ? ` · ${job.customer}` : ''}
        </span></p>

        {/* Where the job is, as one line rather than a band of captioned cards.
            The estimator refuses to draw without a pin and sends people here, so
            the pencil is on it — and the pin is looked up again whenever the
            address changes, because a pin that outlives its address points
            somewhere confidently wrong. */}
        {mayPlace ? (
          <div className="fjplacerow">
            <RecordRow editLabel="Change the address" face={
              <p className="fjplace">
                <span>{where ?? 'No address yet'}</span>
                {job.lat != null && job.lon != null ? <i>Pinned</i> : <i>No pin</i>}
                {place?.navusoft_account && <i>Navusoft {place.navusoft_account}</i>}
              </p>
            }>
              <ActionForm action={setJobPlace} label="Save the address" busy="Looking it up…">
                <input type="hidden" name="job_id" value={job.id} />
                <div className="formrow">
                  <div><label htmlFor="jp-l1">Site address</label>
                    <input className="field" id="jp-l1" name="line1" required
                           defaultValue={place?.line1 ?? job.site_address ?? ''} /></div>
                </div>
                <div className="formrow" style={{ marginTop: 12 }}>
                  <div><label htmlFor="jp-city">City</label>
                    <input className="field" id="jp-city" name="city"
                           defaultValue={place?.city ?? ''} /></div>
                  <div><label htmlFor="jp-region">State</label>
                    <input className="field" id="jp-region" name="region"
                           defaultValue={place?.region ?? ''} /></div>
                  <div><label htmlFor="jp-zip">ZIP</label>
                    <input className="field" id="jp-zip" name="postcode"
                           defaultValue={place?.postcode ?? ''} /></div>
                </div>
                <div className="formrow" style={{ marginTop: 12 }}>
                  <div><label htmlFor="jp-note">Anything about getting on site</label>
                    <input className="field" id="jp-note" name="pin_note"
                           placeholder="Gate code, which drive takes a truck, who to ask for" /></div>
                </div>
              </ActionForm>
            </RecordRow>
          </div>
        ) : (
          <p className="fjplace">
            <span>{where ?? 'No address yet'}</span>
            {job.lat != null && job.lon != null ? <i>Pinned</i> : <i>No pin</i>}
            {place?.navusoft_account && <i>Navusoft {place.navusoft_account}</i>}
          </p>
        )}
      </div></div>

      {/* The rail. Chips on a desktop; under 640 the same four links become a
          picker — a strip that scrolls sideways hides its own options behind a
          gesture nobody is told about. Exactly one of the two is ever rendered:
          display:none takes the other out of the accessibility tree as well as
          off the screen, so nothing is announced twice. */}
      <nav className="fjarail fjarail--own" aria-label="Sections by owner">
        <div className="fjachips">
          {tabs.map((t) => (
            <Link key={t.role} href={`/fence/${job.id}?who=${t.role}` as any}
                  className={`fjachip${t.role === who ? ' is-on' : ''}${t.skipped ? ' is-off' : ''}`}
                  aria-current={t.role === who ? 'page' : undefined}>
              <Chip t={t} />
            </Link>
          ))}
        </div>

        <details className="fjapick">
          <summary>
            <Chip t={tab} />
            <svg className="fjapick__v" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6.5L8 10.5L12 6.5" />
            </svg>
          </summary>
          <div className="fjapick__list">
            {tabs.map((t) => (
              <Link key={t.role} href={`/fence/${job.id}?who=${t.role}` as any}
                    className={`fjapick__o${t.role === who ? ' is-on' : ''}${t.skipped ? ' is-off' : ''}`}
                    aria-current={t.role === who ? 'page' : undefined}>
                <Chip t={t} />
              </Link>
            ))}
          </div>
        </details>

        <span className="fjwho">{role}</span>
      </nav>

      {tab.skipped ? (
        <p className="fjempty">
          This job started at {SECTIONS.find((s) => s.key === job.reached)?.en.toLowerCase()}.
          Nothing here was used.
        </p>
      ) : shown.map((sec) => {
        const how = howToDraw(sec, jobRole, sealed, rights.mayManage)
        const word = SECTIONS.find((s) => s.key === sec)!
        const secTasks = tasks.filter((t) => t.section === sec)
        const waiting = secTasks.length > 0 && secTasks.every((t) => !t.done)
        const screen = HAS_SCREEN[sec]

        return (
          <div key={sec} className={
            'fjsec'
            + (how === 'sealed' ? ' fjsec--sealed' : '')
            + (sec === job.stage ? ' is-now' : '')
          }>
            <div className="fjsec__h">
              <h3>{screen
                ? <a className="fjsec__go" href={`/fence/${job.id}/${screen}`}>{word.en}</a>
                : word.en}</h3>
              {/* A figure the section carries in its own head. Data, never a
                  caption: what it sold for, or how many steps are waiting. */}
              {sec === 'estimate' && soldOne && (
                <span className="fjsecn">
                  Sold · ${Number(soldOne.price ?? 0).toLocaleString('en-US')}
                </span>
              )}
              {waiting && sec !== job.stage && (
                <span className="fjsecn">{secTasks.length} step{secTasks.length === 1 ? '' : 's'}</span>
              )}
            </div>

            {secTasks.length > 0 && !(waiting && sec !== job.stage) && (
              <FenceTasks jobId={job.id} tasks={secTasks as Task[]} mayEdit={how === 'edit'}
                          navusoft={place?.navusoft_account ?? null} hasPlace={!!place} />
            )}

            {/* Close-out is the last moment the person who ran the job is still
                looking at it, so it is where the message to accounting gets
                written. Billing reads it on the handoff and it goes out at the
                top of the letter. */}
            {sec === 'closeout' && (how === 'edit' || toBilling.length > 0) && (
              <div className="fjnote">
                {toBilling
                  .filter((nte) => handedOff || nte.id !== mineToBilling?.id)
                  .map((nte) => (
                    <p className="fjnote__had" key={nte.id}>{nte.body}</p>
                  ))}

                {handedOff ? (
                  toBilling.length > 0 && (
                    <p className="fjnote__shut">
                      Sent to accounting {new Date(handedOff.sent_at)
                        .toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </p>
                  )
                ) : how === 'edit' && (
                  <ActionForm action={noteForBilling}
                              label={mineToBilling ? 'Save it' : 'Leave it for accounting'}
                              busy="Saving…" className="fjnote__f">
                    <input type="hidden" name="job_id" value={job.id} />
                    <label htmlFor="fj-bill-note">Anything accounting should know</label>
                    <GrowText className="field" id="fj-bill-note" name="body" rows={2}
                              defaultValue={mineToBilling?.body ?? ''}
                              placeholder="Two gates went in on the north drive, not one" />
                  </ActionForm>
                )}
              </div>
            )}

            {/* Sales sends it forward from the section it owns. The seal and the
                project manager's task list are one act, so they are one button. */}
            {sec === 'estimate' && how === 'edit' && !sealed.has('estimate') && (
              quotes.length === 0 ? (
                <p className="fjwhy">
                  Nothing is on the quote yet.{' '}
                  <a href={`/fence/${job.id}/estimate`}>Measure the line</a> first.
                </p>
              ) : (
                <form className="fjhand" action={async (f: FormData) => {
                  'use server'
                  await handToPm(null, f)
                }}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <label className="fjhand__pick" htmlFor="fj-sold">
                    Which option did the customer buy?
                  </label>
                  <select className="field" id="fj-sold" name="option_id"
                          defaultValue={soldOne?.id ?? quotes[0].id}>
                    {quotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label} — ${Number(q.price ?? 0).toLocaleString('en-US')}
                        {q.accepted ? ' (marked sold)' : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn--amber" type="submit">
                    Send it to the project manager
                  </button>
                  <small>
                    Marks that option sold and seals the estimate — nothing changes it afterwards,
                    not even an administrator.
                  </small>
                </form>
              )
            )}
          </div>
        )
      })}

      {/* THE LOG. Under the work rather than beside it: somebody arriving
          wants to know what is open, and then what happened. Anybody who can
          reach the job may add to it, including people who cannot edit a single
          section — a field hand who cannot touch the scope can still say the
          gate post is in rock. */}
      <section className="fjlog">
        <div className="fjlog__h">
          <h3>Notes</h3>
          {notes.length > 0 && (
            <span>{notes.length === 60 ? 'the last 60' : `${notes.length}`}</span>
          )}
        </div>

        <ActionForm action={addNote} label="Add it" busy="Saving…" className="fjlog__f">
          <input type="hidden" name="job_id" value={job.id} />
          <input type="hidden" name="section" value={job.stage} />
          <GrowText className="field" name="body" rows={2}
                    aria-label="A note on this job"
                    placeholder="What happened, what was said, what to watch for" />
          <div className="fjlog__row">
            <NoteAttach />
            <p className="fjlog__at">
              @ somebody and they get a notification and an email.
            </p>
          </div>
        </ActionForm>

        {notes.length === 0 ? (
          <p className="fjlog__none">Nothing written down yet.</p>
        ) : (
          <ul className="fjlog__l">
            {notes.map((nte) => {
              const word = nte.section
                ? SECTIONS.find((x) => x.key === nte.section)?.en ?? null
                : null
              return (
                <li key={nte.id}>
                  <p><Mentioned text={nte.body} roster={roster} /></p>
                  {nte.file_path && (
                    nte.file_mime?.startsWith('image/') ? (
                      <a className="fjshot" href={`/api/fence/file/${nte.id}`}
                         target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/fence/file/${nte.id}`}
                             alt={nte.file_name ?? 'An attachment'} loading="lazy" />
                      </a>
                    ) : (
                      <a className="fjfile" href={`/api/fence/file/${nte.id}`}
                         target="_blank" rel="noreferrer">
                        {nte.file_name ?? 'A file'}
                        {nte.file_bytes != null && (
                          <i>{Math.max(1, Math.round(nte.file_bytes / 1024))} KB</i>
                        )}
                      </a>
                    )
                  )}
                  <span>
                    <b>{nte.by_crew ?? (nte.author_id ? wrote.get(nte.author_id) : null) ?? 'Somebody'}</b>
                    <i>{new Date(nte.created_at).toLocaleDateString('en-US',
                      { day: 'numeric', month: 'short', year: 'numeric' })}</i>
                    {word && <i>{word}</i>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="fjfoot">
        <Link href={'/fence' as any}>Back to jobs</Link>
        {' · '}
        <a href={`/fence/${job.id}/record`} target="_blank" rel="noreferrer">
          The whole job, as a document
        </a>
      </p>
    </>
  )
}
