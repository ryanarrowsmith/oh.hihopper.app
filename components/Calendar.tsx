'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { addEvent } from '@/app/actions/calendar'
import Choice from '@/components/Choice'
import Link from 'next/link'
import type { Ev, Celebrant } from '@/lib/calendar'

type View = 'day' | 'week' | 'month'
type Feed = { id: string; name: string; colour: string; last_ok: boolean | null; failure: string | null }

const DAY = 86_400_000
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Monday, because a working week starts on one and a grid that starts on
 *  Sunday puts the weekend on both ends of it. */
function weekStart(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

const I = (d: string, w = '1.7') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)

const H0 = 7, H1 = 20, PX = 34
const SIDE_KEY = 'hopper.calside'

export default function Calendar({ events, feeds, bdays, annis, address, orgs = [] }: {
  events: Ev[]; feeds: Feed[]; bdays: Celebrant[]; annis: Celebrant[]; address: string | null
  orgs?: { id: string; name: string }[]
}) {
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [off, setOff] = useState<Set<string>>(new Set())
  const [now, setNow] = useState<Date | null>(null)
  // Folded or not. Starts open and corrects on mount rather than reading
  // storage during render, because the server has no localStorage and a first
  // paint that disagrees with the second is a flash of the wrong answer.
  const [sideMin, setSideMin] = useState(false)

  useEffect(() => {
    try { setSideMin(localStorage.getItem(SIDE_KEY) === 'min') } catch { /* fine */ }
  }, [])

  // The popover hangs off the plus in the bar, but it cannot LIVE in the bar:
  // .calmain clips, because a timed event is positioned absolutely and would
  // otherwise spill out the bottom of the grid. So it is a sibling of the box,
  // pushed down by however tall the bar actually is -- measured, because the
  // bar wraps at narrow widths and a guessed number would float.
  const [adding, setAdding] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  const [barH, setBarH] = useState(51)

  useEffect(() => {
    if (!adding) return
    setBarH(bar.current?.offsetHeight ?? 51)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdding(false) }
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      // A Choice renders its list into <body>, deliberately, so that nothing
      // that clips or scrolls can eat it. That also puts it outside this
      // panel -- so picking an organization read as a click somewhere else
      // and shut the form on the way to answering its own question.
      if ((t as HTMLElement).closest?.('.choicepop')) return
      if (!pop.current?.contains(t) && !plus.current?.contains(t)) setAdding(false)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [adding])

  const foldSide = () => setSideMin((m) => {
    try { localStorage.setItem(SIDE_KEY, m ? 'open' : 'min') } catch { /* not fatal */ }
    return !m
  })

  // The line across today, and only ever drawn once the browser has a clock:
  // the server's is UTC, and a red line an hour out is worse than none.
  useEffect(() => {
    const t = () => setNow(new Date())
    t(); const h = setInterval(t, 60_000); return () => clearInterval(h)
  }, [])

  // Arrows move, T comes home. A calendar you can only drive with a mouse is a
  // calendar nobody drives twice.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && /input|textarea|select/i.test(el.tagName)) return
      if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key.toLowerCase() === 't') { const d = new Date(); d.setHours(0,0,0,0); setAnchor(d) }
      else if (e.key.toLowerCase() === 'd') setView('day')
      else if (e.key.toLowerCase() === 'w') setView('week')
      else if (e.key.toLowerCase() === 'm') setView('month')
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  })

  function step(n: number) {
    setAnchor((a) => {
      const d = new Date(a)
      if (view === 'day') d.setDate(d.getDate() + n)
      else if (view === 'week') d.setDate(d.getDate() + n * 7)
      else d.setMonth(d.getMonth() + n)
      return d
    })
  }

  const days = useMemo(() => {
    if (view === 'day') return [new Date(anchor)]
    if (view === 'week') {
      const s = weekStart(anchor)
      return Array.from({ length: 7 }, (_, i) => new Date(+s + i * DAY))
    }
    const first = monthStart(anchor)
    const s = weekStart(first)
    // Six rows always. A month grid that is five rows in February and six in
    // March jumps everything below it every time you page.
    return Array.from({ length: 42 }, (_, i) => new Date(+s + i * DAY))
  }, [anchor, view])

  const shown = useMemo(() => events.filter((e) => !off.has(e.kind === 'feed' ? e.colour : e.kind)),
    [events, off])
  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of shown) { const l = m.get(e.day) ?? []; l.push(e); m.set(e.day, l) }
    return m
  }, [shown])

  const today = iso(new Date())
  const title = view === 'month'
    ? anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : view === 'day'
    ? anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${
        days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  const toggle = (k: string) => setOff((s) => {
    const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n
  })

  const timed = (d: Date) => (byDay.get(iso(d)) ?? []).filter((e) => e.at)
  const allDay = (d: Date) => (byDay.get(iso(d)) ?? []).filter((e) => !e.at)
  const topOf = (at: string) => {
    const t = new Date(at)
    return ((t.getHours() - H0) * 60 + t.getMinutes()) / 60 * PX
  }

  return (
    <>
      <div className={`calwrap${sideMin ? ' is-min' : ''}`}>
        <CalSide feeds={feeds} off={off} toggle={toggle} address={address}
                 min={sideMin} fold={foldSide} />

        <div className="calmainw">
        <div className="calmain">
          <div className="calbar" ref={bar}>
            <button className="rbtn" type="button"
                    onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setAnchor(d) }}>Today</button>
            <span className="calnav">
              <button className="calarr" type="button" aria-label="Back" onClick={() => step(-1)}>
                {I('<path d="m15 18-6-6 6-6"/>', '2.2')}</button>
              <button className="calarr" type="button" aria-label="Forward" onClick={() => step(1)}>
                {I('<path d="m9 18 6-6-6-6"/>', '2.2')}</button>
            </span>
            <b className="calnow">{title}</b>
            <span className="rbar2__sp" />
            <div className="seg" role="group" aria-label="How much to show">
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button key={v} className="seg__b" type="button" aria-pressed={view === v}
                        onClick={() => setView(v)}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <button className="calplus" type="button" ref={plus} aria-expanded={adding}
                    data-tip="New event" aria-label="New event"
                    onClick={(e) => { e.stopPropagation(); setAdding(!adding) }}>
              {I('<path d="M12 5v14M5 12h14"/>', '2.2')}
            </button>
          </div>

          {view === 'month' ? (
            <div className="mgrid">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                <span className="mhead" key={d}>{d}</span>
              ))}
              {days.map((d) => (
                <div key={+d} className={`mcell${d.getMonth() !== anchor.getMonth() ? ' is-dim' : ''}${iso(d) === today ? ' is-today' : ''}`}>
                  {/* The number takes you into the day, which is what somebody
                      is reaching for when a square has four things in it. */}
                  <button className="mcell__n" type="button"
                          onClick={() => { setAnchor(new Date(d)); setView('day') }}>
                    {d.getDate()}
                  </button>
                  {(byDay.get(iso(d)) ?? []).slice(0, 4).map((e) => <Chip key={e.id} e={e} />)}
                  {(byDay.get(iso(d)) ?? []).length > 4 && (
                    <span className="mmore">+{(byDay.get(iso(d)) ?? []).length - 4} more</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="calgrid">
              <div className="calhead">
                <span className="calgut" />
                {days.map((d) => (
                  <span key={+d} className={`calday${iso(d) === today ? ' is-today' : ''}`}>
                    <b>{d.toLocaleDateString('en-US', { weekday: 'short' })}</b>
                    <em>{d.getDate()}</em>
                  </span>
                ))}
              </div>

              <div className="calallday">
                <span className="calgut">All day</span>
                <div className="callanes" style={{ gridTemplateColumns: `repeat(${days.length},1fr)` }}>
                  {days.map((d, i) => (
                    <div key={+d} className="callane" style={{ gridColumn: i + 1 }}>
                      {allDay(d).map((e) => <Chip key={e.id} e={e} />)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="calbody">
                <div className="calhours" style={{ height: (H1 - H0) * PX }}>
                  {Array.from({ length: H1 - H0 + 1 }, (_, i) => (
                    <span key={i} style={{ top: i * PX }}>
                      {((H0 + i) % 12) || 12}{H0 + i < 12 ? 'am' : 'pm'}
                    </span>
                  ))}
                </div>
                <div className="calcols"
                     style={{ gridTemplateColumns: `repeat(${days.length},1fr)`, height: (H1 - H0) * PX }}>
                  {days.map((d, i) => (
                    <div key={+d} className={`calcol${iso(d) === today ? ' is-today' : ''}`}>
                      {Array.from({ length: H1 - H0 }, (_, h) => (
                        <span className="calline" key={h} style={{ top: (h + 1) * PX }} />
                      ))}
                    </div>
                  ))}
                  {days.flatMap((d, i) => timed(d).map((e) => (
                    <Timed key={e.id} e={e} col={i} cols={days.length} top={topOf(e.at!)} px={PX} />
                  )))}
                  {now && days.some((d) => iso(d) === today) && (
                    <span className="calnowline"
                          style={{ top: ((now.getHours() - H0) * 60 + now.getMinutes()) / 60 * PX }}>
                      <i />
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {adding && (
          <div className="addpop calpop" ref={pop} role="dialog" aria-label="New event"
               style={{ top: barH + 12 }}>
            <div className="addpop__h">
              <b>New event</b>
              <button className="addpop__x" type="button" aria-label="Close"
                      onClick={() => setAdding(false)}>&times;</button>
            </div>
            <div className="addpop__body">
              <NewEvent day={iso(anchor)} orgs={orgs} onDone={() => setAdding(false)} />
            </div>
          </div>
        )}
        </div>
      </div>

      <Celebrations bdays={bdays} annis={annis}
                    month={anchor.toLocaleDateString('en-US', { month: 'long' })} />
    </>
  )
}

/**
 * The event form.
 *
 * The day starts at whatever the calendar is looking at, because somebody who
 * paged to March and pressed the plus meant March. All day is a toggle rather
 * than a checkbox, and it does not hide the times so much as make them
 * unnecessary -- turning it on empties them, so the form and the record agree
 * about what was meant.
 */
function NewEvent({ day, orgs, onDone }: {
  day: string; orgs: { id: string; name: string }[]; onDone: () => void
}) {
  const [state, action] = useFormState(addEvent, null)
  const [allDay, setAllDay] = useState(false)
  const [pub, setPub] = useState(false)
  useEffect(() => { if (state?.ok) onDone() }, [state, onDone])

  return (
    <form action={action}>
      <div className="formrow formrow--one">
        <div>
          <label htmlFor="ev-title">What is it</label>
          <input className="field" id="ev-title" name="title" required maxLength={160}
                 placeholder="Quarterly review" autoFocus autoComplete="off" />
        </div>
      </div>

      <div className="formrow" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="ev-day">Day</label>
          <input className="field" id="ev-day" name="day" type="date" required defaultValue={day} />
        </div>
        <div>
          <label htmlFor="ev-allday">All day</label>
          <div className="togline">
            <span className="tog">
              <input id="ev-allday" name="all_day" type="checkbox" checked={allDay}
                     aria-label="All day" onChange={(e) => setAllDay(e.target.checked)} />
              <span className="tog__track" /><span className="tog__knob" />
            </span>
            <span className="togstate">{allDay ? 'On' : 'Off'}</span>
          </div>
        </div>
      </div>

      {!allDay && (
        <div className="formrow" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="ev-start">Starts</label>
            <input className="field" id="ev-start" name="start_at" type="time" defaultValue="09:00" />
          </div>
          <div>
            <label htmlFor="ev-end">Ends</label>
            <input className="field" id="ev-end" name="end_at" type="time" defaultValue="10:00" />
          </div>
        </div>
      )}

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="ev-where">Where</label>
          <input className="field" id="ev-where" name="location" maxLength={200}
                 placeholder="Optional" autoComplete="off" />
        </div>
      </div>

      {/* Only rendered when there is a choice to make. One organization is not
          a question, and a dropdown with one thing in it is furniture. */}
      {orgs.length > 1 && (
        <div className="formrow formrow--one" style={{ marginTop: 12 }}>
          <div>
            <label htmlFor="ev-org">Who it is for</label>
            <Choice id="ev-org" name="entity_id" placeholder="Everyone"
                    options={[{ value: '', label: 'Everyone' },
                      ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
          </div>
        </div>
      )}

      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="ev-notes">Notes</label>
          <textarea className="field" id="ev-notes" name="notes" rows={2} maxLength={2000}
                    placeholder="Optional" />
        </div>
      </div>

      {/* Off by default, and that is the point: a calendar you can put your own
          days on is only useful if putting one there is not an announcement.
          Sharing is a decision somebody makes, not a state they have to
          remember to undo. */}
      <div className="formrow formrow--one" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="ev-public">Who can see it</label>
          <div className="togline">
            <span className="tog">
              <input id="ev-public" name="is_public" type="checkbox" checked={pub}
                     aria-label="Shared" onChange={(e) => setPub(e.target.checked)} />
              <span className="tog__track" /><span className="tog__knob" />
            </span>
            <span className="togstate">{pub ? 'On' : 'Off'}</span>
            <span className="togsay">{pub
              ? 'Everyone who can open it will see this on their calendar.'
              : 'Only you. Nobody else sees it until you turn this on.'}</span>
          </div>
        </div>
      </div>

      <div className="rowacts">
        <Add />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Add() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Adding\u2026' : 'Add it'}
    </button>
  )
}

function Chip({ e }: { e: Ev }) {
  const body = <>
    <span className="chip__k" style={{ background: `var(${e.colour})` }} />
    {e.title}{e.sub && <em> · {e.sub}</em>}
  </>
  return e.href
    ? <Link className={`chip chip--${e.kind}`} href={e.href as any} title={`${e.title}${e.sub ? ` · ${e.sub}` : ''}`}>{body}</Link>
    : <span className={`chip chip--${e.kind}`} title={e.title}>{body}</span>
}

function Timed({ e, col, cols, top, px }: {
  e: Ev; col: number; cols: number; top: number; px: number
}) {
  // Positioned by percentage, not grid-column: an absolutely positioned child
  // is out of grid flow, so grid-column is ignored and the block spans the
  // whole week.
  const style = {
    left: `calc(${col} * (100% / ${cols}) + 3px)`,
    width: `calc(100% / ${cols} - 6px)`,
    top, height: Math.max(18, ((e.mins ?? 60) / 60) * px),
  }
  const inner = <>
    <b>{e.title}</b>
    <span>{new Date(e.at!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
  </>
  return e.href
    ? <a className="ev ev--feed" style={style} href={e.href}>{inner}</a>
    : <span className="ev ev--feed" style={style}>{inner}</span>
}

/** What is on, what is subscribed, and the address that puts Hopper in your
 *  own calendar app. */
function CalSide({ feeds, off, toggle, address, min, fold }: {
  feeds: Feed[]; off: Set<string>; toggle: (k: string) => void; address: string | null
  min: boolean; fold: () => void
}) {
  const [copied, setCopied] = useState(false)
  const url = address ? `${typeof window === 'undefined' ? '' : window.location.origin}/cal/${address}/hopper.ics` : null

  const row = (k: string, name: string, colour: string, note?: string) => (
    <button className="calrow" type="button" key={k} onClick={() => toggle(k)}
            aria-pressed={!off.has(k)}>
      <span className="calkey" style={{ background: `var(${colour})` }} />
      <span>{name}{note && <em>{note}</em>}</span>
      <span className={`tog2${off.has(k) ? '' : ' is-on'}`} />
    </button>
  )

  return (
    <aside className="calside">
      <button className="calside__top" type="button" aria-expanded={!min} onClick={fold}
              aria-label={min ? 'Show the calendars' : 'Hide the calendars'}>
        {I('<rect x="3" y="5" width="18" height="16"/><path d="M3 10h18M8 3v4M16 3v4"/>', '1.8')}
        <b>Calendars</b>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" /></svg>
      </button>

      <div className="calside__body">
      <p className="calside__h">Showing</p>
      {row('event', 'Events', '--ink-2')}
      {row('sched', 'Report schedule', '--s1')}
      {row('late', 'Behind', '--amber')}
      {row('birthday', 'Birthdays', '--amber')}
      {row('anniversary', 'Anniversaries', '--s2')}

      <p className="calside__h">Subscribed</p>
      {feeds.length === 0
        ? <p className="calsub">None yet. Any calendar that publishes an .ics address can go here —
            that is how a team&rsquo;s Google or Outlook calendar arrives without Hopper holding a key.</p>
        : feeds.map((f) => row(f.colour, f.name, f.colour, f.last_ok === false ? ' · not answering' : undefined))}
      <Link className="btn btn--sm" href={'/calendar/subscribe' as any}>
        {I('<path d="M12 5v14M5 12h14"/>', '2.2')}Subscribe to a calendar
      </Link>

      <p className="calside__h">Hopper in your calendar</p>
      <p className="calsub">
        Add this address to Google, Apple or Outlook and Hopper&rsquo;s dates appear there.
        Treat it like a password: anyone holding it can read this calendar.
      </p>
      {url ? (
        <>
          <div className="calurl">
            <code>{url}</code>
            <button className="cbub" type="button" data-tip={copied ? 'Copied' : 'Copy'}
                    aria-label="Copy the address"
                    onClick={() => {
                      navigator.clipboard?.writeText(url).then(() => {
                        setCopied(true); setTimeout(() => setCopied(false), 1600)
                      }).catch(() => {})
                    }}>
              {I('<rect x="9" y="9" width="12" height="12" rx="1.6"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>')}
            </button>
          </div>
          <form action="/calendar/rotate" method="post">
            <button className="lnk lnk--go" type="submit">Rotate the address</button>
          </form>
        </>
      ) : (
        <p className="calsub">No address yet.</p>
      )}
      </div>
    </aside>
  )
}

/**
 * Who to congratulate, under the calendar.
 *
 * A month list rather than only marks on days, because "who has a birthday this
 * month" is the question somebody actually opens a calendar to answer -- and
 * because it is where a cake has room to arrive.
 */
function Celebrations({ bdays, annis, month }: {
  bdays: Celebrant[]; annis: Celebrant[]; month: string
}) {
  if (bdays.length === 0 && annis.length === 0) return null
  return (
    <div className="celebs">
      {annis.length > 0 && (
        <section className="bmonth bmonth--anni">
          <p className="bmonth__h">
            {I('<path d="M12 3l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.4l6-.9z"/>')}
            <b>Anniversaries in {month}</b><span>{annis.length}</span>
          </p>
          <div className="bmonth__l">
            {annis.map((p) => (
              <Link className="brow brow--anni" key={p.id} href={`/people/${p.id}` as any}>
                <span className="pop" aria-hidden="true">
                  {Array.from({ length: 34 }, (_, i) => {
                    const cols = ['--s1', '--s2', '--s3', '--amber', '--steel', '--bad']
                    return <i key={i} style={{
                      ['--a' as any]: `${(i / 34) * 360 + (i % 5) * 7}deg`,
                      ['--d' as any]: `${54 + ((i * 37) % 70)}px`,
                      ['--r' as any]: `${(i % 2 ? 1 : -1) * (180 + i * 13)}deg`,
                      ['--dl' as any]: `${(i % 7) * 22}ms`,
                      ['--c' as any]: `var(${cols[i % 6]})`,
                      ['--w' as any]: `${5 + (i % 3) * 2}px`,
                      ['--h' as any]: `${7 + (i % 4) * 2}px`,
                    }} />
                  })}
                </span>
                <Face name={p.name} />
                <span className="btx">
                  <b>{p.name}</b>
                  <span>{p.years === 0 ? 'Started this month' : `${p.years} year${p.years === 1 ? '' : 's'}`}
                    {p.where && ` · ${p.where}`}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {bdays.length > 0 && (
        <section className="bmonth">
          <p className="bmonth__h">
            {I('<path d="M4 21h16v-7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z"/><path d="M12 8V5"/><path d="M4 15c2 1.6 4 1.6 6 0s4-1.6 6 0 2 1.6 4 0"/>')}
            <b>Birthdays in {month}</b><span>{bdays.length}</span>
          </p>
          <div className="bmonth__l">
            {bdays.map((p) => (
              <Link className="brow brow--bday" key={p.id} href={`/people/${p.id}` as any}>
                <span className="cakew" aria-hidden="true"><Cake /></span>
                <Face name={p.name} />
                <span className="btx">
                  <b>{p.name}</b>
                  <span>{p.day ? `${month.slice(0, 3)} ${p.day}` : month}{p.where && ` · ${p.where}`}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const Face = ({ name }: { name: string }) => (
  <span className="bavatar" aria-hidden="true">
    {name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
  </span>
)

/** Three candles, each flickering on its own beat -- in unison they read as one
 *  light behind a stencil rather than as three flames. */
const Cake = () => {
  const candle = (x: number, d: number) => (
    <g key={x} style={{ ['--d' as any]: `${d}s` }}>
      <path className="flame" style={{ transformOrigin: `${x}px 17px` }}
            d={`M${x} 8c3.4 4.2 5.2 6.9 5.2 9.6a5.2 5.2 0 0 1-10.4 0C${x - 5.2} 14.9 ${x - 3.4} 12.2 ${x} 8z`} />
      <path className="wick" d={`M${x} 24v9`} />
      <path className="cake" d={`M${x} 33v13`} />
    </g>
  )
  return (
    <svg className="bday bday--rise" viewBox="0 0 100 100" aria-hidden="true">
      {candle(30, 0)}{candle(50, 0.5)}{candle(70, 1.1)}
      <path className="icing" d="M14 52c4.7 0 4.7-6 9.3-6s4.7 6 9.4 6 4.6-6 9.3-6 4.7 6 9.3 6 4.7-6 9.4-6 4.6 6 9.3 6 4.7-6 9.3-6 4.7 6 9.4 6v8H14z" />
      <path className="cake" d="M14 60h72v26a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" />
    </svg>
  )
}
