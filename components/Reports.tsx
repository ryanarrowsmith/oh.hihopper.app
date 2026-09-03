'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { refreshReport } from '@/app/actions/reports'
import { toggleFavorite } from '@/app/actions/admin'
import Chart, { Legend, isSplit, type Series } from '@/components/Chart'
import RawTable from '@/components/RawTable'
import { PRESETS } from '@/components/useRange'
import DateField from '@/components/DateField'
import { useRange, inWindow } from '@/components/useRange'

export type Card = {
  id: string; name: string; entity: string; department: string; category: string | null
  value: number | null; valueOn: string | null
  chartType: string; refresh: string; snapshotAt: string | null; restricted: boolean
  lastLook: string | null; lastLookOk: boolean | null; lastFailure: string | null
  freshness: 'new' | 'good' | 'behind' | 'failed' | 'snapshot'
  series: Series[]
  /** No date column means the readings cannot be put on a timeline at all, so
   *  this report is shown whole whatever the range says. */
  dated: boolean
  favorite: boolean
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** The mark on the row you are already on. */
const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 12 5 5L20 7" />
  </svg>
)

// ------------------------------------------------------------------ the list

export default function Reports({ cards: raw }: { cards: Card[] }) {
  const [density, setDensity] = useState<'lg' | 'md' | 'list'>('lg')
  const [open, setOpen] = useState<Card | null>(null)
  const [openOn, setOpenOn] = useState<'shape' | 'rows'>('shape')
  const [q, setQ] = useState('')
  // Which cards are chosen for printing. A set of ids and not a flag per card,
  // because the answer has to survive the list re-sorting under it.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const { range, setRange, window: win } = useRange()
  /** Which control is open. One at a time, because two popovers over the same
   *  bar is two answers to "what am I doing". */
  const [pop, setPop] = useState<'when' | 'find' | null>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pop) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPop(null) }
    const away = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) setPop(null)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [pop])

  /**
   * The range narrows the READINGS, and the number follows from them: a card's
   * value becomes the last reading inside the window, not the last one Hopper
   * has. Showing August's figure under a July window would be a card lying
   * about which question it is answering.
   */
  const cards = useMemo(() => raw.map((c) => {
    if (!c.dated) return c
    const series = c.series
      .map((s) => ({ ...s, points: s.points.filter((p) => inWindow(p.on, win)) }))
      .filter((s) => s.points.length > 0)
    const head = series[0]?.points ?? []
    const last = head[head.length - 1]
    return {
      ...c, series,
      value: last ? last.v : null,
      valueOn: last ? last.on : null,
    }
  }), [raw, win])

  const counted = useMemo(() => {
    const total = raw.reduce((n, c) => n + c.series.reduce((m, s) => m + s.points.length, 0), 0)
    const kept = cards.reduce((n, c) => n + c.series.reduce((m, s) => m + s.points.length, 0), 0)
    return { total, kept, undated: raw.filter((c) => !c.dated).length }
  }, [raw, cards])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return cards
    return cards.filter((c) => [c.name, c.entity, c.department, c.category ?? '']
      .some((s) => s.toLowerCase().includes(t)))
  }, [cards, q])

  // Grouped by department, because that is how the person who owns the number
  // thinks about it -- not by organization, which is how the database does.
  const groups = useMemo(() => {
    const m = new Map<string, Card[]>()
    for (const c of shown) {
      const key = `${c.entity} · ${c.department}`
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(c)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [shown])

  return (
    <>
      {/* One bar, and it belongs to the list rather than floating above it.
          Each control opens what it is for and carries its current answer
          beside the icon -- an icon alone hides what is SET, and a hidden date
          range is the difference between a number that means this month and
          one that means all year. */}
      <div className="rbar2" ref={bar}>
        <span className="rpickw">
          <button className={`rbtn${range.preset !== 'all' ? ' is-set' : ''}`} type="button"
                  aria-expanded={pop === 'when'} aria-haspopup="dialog"
                  onClick={(e) => { e.stopPropagation(); setPop(pop === 'when' ? null : 'when') }}>
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="1.6" />
              <path d="M3 10h18M8 3v4M16 3v4" /></svg>
            <b>{PRESETS.find((p) => p.k === range.preset)?.label ?? 'Custom'}</b>
          </button>
          {pop === 'when' && (
            <div className="rpick" role="dialog" aria-label="Which time">
              <p className="rpick__h">Which time</p>
              <div className="rpick__rows">
                {PRESETS.map((p) => (
                  <button key={p.k} className="rpick__r" type="button"
                          aria-pressed={range.preset === p.k}
                          onClick={() => setRange({ preset: p.k, from: null, to: null })}>
                    {p.label}
                    {range.preset === p.k && <Tick />}
                  </button>
                ))}
              </div>
              <span className="rpick__cut" />
              <div className="rpick__f">
                <DateField label="From" value={range.from}
                           onChange={(v) => setRange({ preset: 'custom', from: v, to: range.to })} />
                <span>to</span>
                <DateField label="To" value={range.to}
                           onChange={(v) => setRange({ preset: 'custom', from: range.from, to: v })} />
              </div>
              {(range.preset !== 'all' || counted.undated > 0) && (
                <p className="rpick__n">
                  {range.preset !== 'all' && <>
                    <b>{counted.kept.toLocaleString()}</b> of {counted.total.toLocaleString()} readings
                    fall inside it.{' '}
                  </>}
                  {counted.undated > 0 && <>
                    {counted.undated} {counted.undated === 1 ? 'report has' : 'reports have'} no date
                    column, so {counted.undated === 1 ? 'it is' : 'they are'} shown whole.
                  </>}
                </p>
              )}
            </div>
          )}
        </span>

        <span className="rpickw">
          <button className={`rbtn${q ? ' is-set' : ''}`} type="button"
                  aria-expanded={pop === 'find'} aria-haspopup="dialog"
                  onClick={(e) => { e.stopPropagation(); setPop(pop === 'find' ? null : 'find') }}>
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            {q ? <b>&ldquo;{q}&rdquo;</b> : 'Find a report'}
            {q && (
              // A span, not a button: a button inside a button is invalid, and
              // the browser will not nest the click anyway.
              <span className="rbtn__x" role="button" tabIndex={0} aria-label="Clear the search"
                    onClick={(e) => { e.stopPropagation(); setQ(''); setPop(null) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setQ('') }
                    }}>
                &times;
              </span>
            )}
          </button>
          {pop === 'find' && (
            <div className="rpick rpick--wide" role="dialog" aria-label="Find a report">
              <p className="rpick__h">Find a report</p>
              <input className="field rpick__q" value={q} autoFocus
                     placeholder="Name, category or organization"
                     onChange={(e) => setQ(e.target.value)} aria-label="Find a report" />
              <p className="rpick__n">It looks at the name, the category and the organization.</p>
            </div>
          )}
        </span>

        {/* What you are looking AT on the left, how you are looking at it on
            the right. Two different kinds of question, and the gap between them
            is what says so. */}
        <span className="rbar2__sp" />

        {/* The count travels with the size control rather than the filters.
            It is the one thing on the bar that is neither a control nor a
            heading -- it is the answer -- so it sits at the far end where the
            eye lands last, against the right group rather than adrift. */}
        {range.preset !== 'all' && (
          <span className="rbar2__say">
            <b>{counted.kept.toLocaleString()}</b> of {counted.total.toLocaleString()} readings
          </span>
        )}

        {/* Not a popover. Three words fit on the bar, and a control you can
            read without opening it is better than a tidier one you cannot. */}
        <div className="seg" role="group" aria-label="How much of each report to show">
          {([['lg', 'Large'], ['md', 'Medium'], ['list', 'List']] as const).map(([k, label]) => (
            <button key={k} className="seg__b" type="button" aria-pressed={density === k}
                    onClick={() => setDensity(k)}>{label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="empty">Nothing matches “{q}”.</p>}

      {groups.map(([label, list]) => (
        <section key={label} className="oboard">
          <h2 className="oboard__h">{label}<span>{list.length}</span></h2>
          {density === 'list'
            ? <div className="rlist2">{list.map((c) => (
                <button key={c.id} className="rrow" type="button" onClick={() => setOpen(c)}>
                  <span className="rrow__c">{c.category ?? '—'}</span>
                  <span className="rrow__n">{c.name}</span>
                  <span className="rrow__v">{c.value == null ? '—' : nf.format(c.value)}</span>
                  <span className="rrow__f"><Fresh c={c} /></span>
                </button>))}
              </div>
            : <div className={`rgrid${density === 'md' ? ' rgrid--md' : ''}`}>
                {list.map((c) => (
                  <ReportCard key={c.id} c={c}
                    onOpen={() => { setOpenOn('shape'); setOpen(c) }}
                    onRows={() => { setOpenOn('rows'); setOpen(c) }}
                    selected={picked.has(c.id)}
                    onSelect={() => setPicked((p) => {
                      const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n
                    })} />
                ))}
              </div>}
        </section>
      ))}

      {open && <ReportPop c={open} startOn={openOn} onClose={() => setOpen(null)} />}

      {/* Choosing cards is only worth doing if something happens next, so the
          bar arrives with the first tick and leaves with the last. It floats
          rather than sitting in the flow, because a bar that pushed the page
          down would move the cards you are still choosing from. */}
      {picked.size > 0 && (
        <div className="pickfloat" role="region" aria-label="Chosen reports">
          <b>{picked.size}</b> chosen
          <button className="lnk" type="button" onClick={() => setPicked(new Set())}>Clear</button>
          <a className="btn btn--amber"
             href={`/reporting/print?ids=${[...picked].join(',')}`}
             target="_blank" rel="noreferrer">Print them</a>
        </div>
      )}
    </>
  )
}

/**
 * A card, and the row of things you can do to it.
 *
 * The card stopped being a <button> to get here: a button cannot contain
 * buttons, and the actions have to be real controls rather than click targets
 * pretending. So the card is a div with one invisible button stretched across
 * it — that is what opens the report — and the actions sit above it.
 *
 * The row is hidden until the pointer is near, the same rule the reordering
 * handles follow, and faintly visible on touch, which has no hover to wait for.
 */
function ReportCard({ c, onOpen, onRows, selected, onSelect }: {
  c: Card; onOpen: () => void; onRows: () => void
  selected: boolean; onSelect: () => void
}) {
  return (
    <div className={`rcard${selected ? ' is-picked' : ''}`}>
      <button className="rcard__hit" type="button" onClick={onOpen}
              aria-label={`Open ${c.name}`} />

      <div className="cardacts" onClick={(e) => e.stopPropagation()}>
        <button className={`cbub cbub--tick${selected ? ' is-on' : ''}`} type="button"
                aria-pressed={selected} onClick={onSelect}
                title={selected ? 'Not this one' : 'Choose this one'}
                aria-label={selected ? 'Not this one' : 'Choose this one'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
               strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
        </button>
        <CardHeart id={c.id} on={c.favorite} />
        <button className="cbub" type="button" onClick={onRows}
                title="The rows behind it" aria-label="The rows behind it">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" /><path d="M3 9h18M3 14h18M9 9v11" /></svg>
        </button>
        <button className="cbub" type="button" onClick={onOpen}
                title="Open it" aria-label="Open it">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6" /><path d="M21 3l-9 9" />
            <path d="M20 14v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6" /></svg>
        </button>
      </div>

      <span className="rcard__c">{c.category ?? 'Uncategorized'}</span>
      <span className="rcard__n">{c.name}</span>
      {c.value == null
        ? <span className="rcard__none">Not read yet</span>
        : <span className="rcard__v">{nf.format(c.value)}</span>}
      {/* The card carries its own registered chart type, but only the HEADLINE
          measure -- the one the number above it belongs to. */}
      {(c.series[0]?.points.length ?? 0) > 1 && (
        <span className="rcard__chart">
          <Chart type={c.chartType} series={c.series.slice(0, 1)}
                 height={64} labels={false} bare compact />
        </span>
      )}
      <span className="rcard__f"><Fresh c={c} /></span>
    </div>
  )
}

function CardHeart({ id, on }: { id: string; on: boolean }) {
  const [, run] = useFormState(toggleFavorite, null)
  return (
    <form action={run} className="barform">
      <input type="hidden" name="object" value="report" />
      <input type="hidden" name="object_id" value={id} />
      <input type="hidden" name="back" value="/reporting" />
      <CardHeartGo on={on} />
    </form>
  )
}

function CardHeartGo({ on }: { on: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className={`cbub${on ? ' is-on' : ''}`} type="submit" disabled={pending}
            aria-pressed={on}
            title={on ? 'In your favourites' : 'Add to your favourites'}
            aria-label={on ? 'In your favourites' : 'Add to your favourites'}>
      <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor"
           strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z" /></svg>
    </button>
  )
}

function Fresh({ c }: { c: Card }) {
  if (c.freshness === 'snapshot') {
    return <span className="snap">
      <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" /><path d="M3 10h18M8 3v4" /></svg>
      Snapshot {c.snapshotAt ? on(c.snapshotAt) : ''}
    </span>
  }
  const tone = c.freshness === 'failed' ? 'bad' : c.freshness === 'behind' ? 'stale'
    : c.freshness === 'new' ? '' : 'good'
  const said = c.freshness === 'failed' ? 'Last look failed'
    : c.freshness === 'behind' ? `Still since ${c.valueOn ? on(c.valueOn) : 'a while'}`
    : c.freshness === 'new' ? 'Never read'
    : `Read ${c.lastLook ? ago(c.lastLook) : ''}`
  return <><span className={`dot${tone ? ` dot--${tone}` : ''}`} />{said}</>
}

/**
 * A date the sheet supplied is a DAY, not an instant. `new Date('2026-08-08')`
 * is parsed as UTC midnight, which west of Greenwich renders as the 7th -- so
 * the card said "Still since Aug 7" about a row dated the 8th. Anchoring at
 * local midnight is what makes a day mean the day.
 */
const on = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

// -------------------------------------------------------------- the card, open

/**
 * A report, opened.
 *
 * Centred over a scrim rather than anchored to the card, and for the reason the
 * anchored version failed on People: a grid gives no z-order guarantee, and
 * every card makes its own stacking context the moment it lifts on hover, so a
 * panel belonging to one card paints under the next one. One page-level overlay
 * has no such problem.
 *
 * Two tabs, because there are two questions. The shape is what the number has
 * been doing; the rows behind it are what the sheet actually said. Most people
 * never open the second, and the ones who do are usually about to argue with
 * the first.
 */
function ReportPop({ c, startOn, onClose }: {
  c: Card; startOn: 'shape' | 'rows'; onClose: () => void
}) {
  // Opened from the rows icon, it opens on the rows. Landing on the chart and
  // making somebody click again is the icon not having meant anything.
  const [tab, setTab] = useState<'shape' | 'rows'>(startOn)
  const box = useRef<HTMLDivElement>(null)

  return (
    <div className="rscrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rpop" role="dialog" aria-modal="true" aria-label={c.name} ref={box}>
        {/* Everything you can do to a report lives in its bar.
          A segmented strip below the header spent a whole band of the window
          saying two words, and Refresh and Open spent another one at the
          bottom. Both are icons up here now, which is where the title already
          told you what you were looking at. */}
      <div className="rpop__h">
          <span className="rpop__t">
            <b>{c.name}</b>
            <span>{[c.entity, c.department, c.category].filter(Boolean).join(' · ')}
              {c.lastLook ? ` · looked ${ago(c.lastLook)}` : ' · never looked'}</span>
          </span>

          <div className="barbtns" role="group" aria-label="This report">
            <button className="barbtn" type="button" aria-pressed={tab === 'shape'}
                    data-tip="The shape" aria-label="The shape"
                    onClick={() => setTab('shape')}>
              <svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 4 4-7 5 5" /><path d="M3 21h18" /></svg>
            </button>
            <button className="barbtn" type="button" aria-pressed={tab === 'rows'}
                    data-tip="The rows behind it" aria-label="The rows behind it"
                    onClick={() => setTab('rows')}>
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" />
                <path d="M3 9h18M3 14h18M9 9v11" /></svg>
            </button>

            <span className="barbtns__cut" />

            <RefreshIcon id={c.id} />
            <HeartIcon id={c.id} on={c.favorite} />
            <a className="barbtn" href={`/reporting/${c.id}`}
               data-tip="Its own page" aria-label="Open its own page">
              <svg viewBox="0 0 24 24"><path d="M15 4h5v5" /><path d="M20 4l-8 8" />
                <path d="M19 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>
            </a>

            <span className="barbtns__cut" />

            <button className="barbtn barbtn--x" type="button" data-tip="Close"
                    aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
      </div>

        {/* The rows are fetched when the tab is opened, not before: most people
            never open it, and five hundred rows per card is a page nobody can
            load. RawTable does that itself. */}
        {tab === 'shape'
          ? <Shape c={c} />
          : <div className="rpop__b rpop__b--data">
              <RawTable reportId={c.id} name={c.name} everRead={c.freshness !== 'new'} />
            </div>}

      </div>
    </div>
  )
}

function Shape({ c }: { c: Card }) {
  const head = c.series[0]?.points ?? []
  return (
    <div className="rpop__b">
      <div className="shape">
        <div className="shape__c">
        {head.length < 2
          ? <p className="empty">
              {c.freshness === 'new'
                ? 'Hopper has not read this one yet. Refresh it and the shape appears.'
                : 'One reading so far — a shape needs two.'}
            </p>
          : <><Chart type={c.chartType} series={c.series} height={300} />
              {!isSplit(c.series) && <Legend series={c.series} />}</>}
        </div>
        <div className="figs shape__f">
          <span className="fig"><span className="fig__l">Now</span>
            <span className="fig__v">{c.value == null ? '—' : nf.format(c.value)}</span></span>
          {head.length > 1 && <span className="fig"><span className="fig__l">Move</span>
            <span className={`fig__v ${head[head.length - 1].v >= head[0].v ? 'up' : 'down'}`}>
              {nf.format(Math.abs(head[head.length - 1].v - head[0].v))}
            </span></span>}
          <span className="fig"><span className="fig__l">Dated</span>
            <span className="fig__v">{c.valueOn ? on(c.valueOn) : '—'}</span></span>
          <span className="fig"><span className="fig__l">Goes back</span>
            <span className="fig__v" style={{ fontSize: 15 }}>{said(c.refresh)}</span></span>
        </div>
      </div>
    </div>
  )
}

const said = (r: string) => r === 'hourly' ? 'Every 30 min' : r === 'twice_daily' ? 'Hourly'
  : r === 'daily' ? 'Every 4 hours' : r === 'weekly' ? 'Daily, 3 AM' : 'Never — a snapshot'

/**
 * Refresh and the heart, as icons in the bar.
 *
 * Both are server actions, so both are still forms -- an icon that writes
 * something is a form with a small button in it, not a link that pretends
 * nothing happened.
 */
function RefreshIcon({ id }: { id: string }) {
  const [state, run] = useFormState(refreshReport, null)
  return (
    <form action={run} className="barform">
      <input type="hidden" name="id" value={id} />
      <RefreshGo />
      {state && <span className={`barsay${state.ok ? '' : ' barsay--bad'}`}>{state.message}</span>}
    </form>
  )
}

function RefreshGo() {
  const { pending } = useFormStatus()
  return (
    <button className={`barbtn${pending ? ' is-busy' : ''}`} type="submit" disabled={pending}
            data-tip={pending ? 'Looking…' : 'Go and look now'}
            aria-label={pending ? 'Looking' : 'Go and look now'}>
      <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></svg>
    </button>
  )
}

/**
 * The heart answers the click, not the next page load.
 *
 * The server action revalidates /reporting, but this popover is holding the
 * card it was handed when it opened -- so the heart sat unchanged until you
 * closed it and came back, which reads as a button that did nothing. It keeps
 * its own answer from the moment you press, and takes the server's again if
 * the card underneath changes for any other reason.
 */
function HeartIcon({ id, on }: { id: string; on: boolean }) {
  const [, run] = useFormState(toggleFavorite, null)
  const [mine, setMine] = useState(on)
  useEffect(() => { setMine(on) }, [on])
  return (
    <form action={run} className="barform" onSubmit={() => setMine((v) => !v)}>
      <input type="hidden" name="object" value="report" />
      <input type="hidden" name="object_id" value={id} />
      <input type="hidden" name="back" value="/reporting" />
      <HeartGo on={mine} />
    </form>
  )
}

function HeartGo({ on }: { on: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className={`barbtn${on ? ' is-on' : ''}`} type="submit" disabled={pending}
            data-tip={on ? 'In your favorites' : 'Add to your favorites'}
            aria-label={on ? 'In your favorites' : 'Add to your favorites'}
            aria-pressed={on}>
      <svg viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'}>
        <path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z" /></svg>
    </button>
  )
}
