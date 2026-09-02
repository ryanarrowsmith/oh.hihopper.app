'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { refreshReport } from '@/app/actions/reports'
import Chart, { Legend, isSplit, type Series } from '@/components/Chart'
import RawTable from '@/components/RawTable'

export type Card = {
  id: string; name: string; entity: string; department: string; category: string | null
  value: number | null; valueOn: string | null
  chartType: string; refresh: string; snapshotAt: string | null; restricted: boolean
  lastLook: string | null; lastLookOk: boolean | null; lastFailure: string | null
  freshness: 'new' | 'good' | 'behind' | 'failed' | 'snapshot'
  series: Series[]
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

// ------------------------------------------------------------------ the list

export default function Reports({ cards }: { cards: Card[] }) {
  const [density, setDensity] = useState<'lg' | 'md' | 'list'>('lg')
  const [open, setOpen] = useState<Card | null>(null)
  const [q, setQ] = useState('')

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
      <div className="rbar">
        <span className="rbar__l">How it is drawn</span>
        <input className="field rbar__q" value={q} placeholder="Find a report"
               onChange={(e) => setQ(e.target.value)} aria-label="Find a report" />
        <div className="seg" role="group" aria-label="How much of each report to show">
          {([['lg', 'Large'], ['md', 'Medium'], ['list', 'List']] as const).map(([k, label]) => (
            <button key={k} className="seg__b" type="button" aria-pressed={density === k}
                    onClick={() => setDensity(k)}>{label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="empty">Nothing matches “{q}”.</p>}

      {groups.map(([label, list]) => (
        <section key={label} className="rgroup">
          <h2 className="rgroup__h">{label}<span>{list.length}</span></h2>
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
                {list.map((c) => <ReportCard key={c.id} c={c} onOpen={() => setOpen(c)} />)}
              </div>}
        </section>
      ))}

      {open && <ReportPop c={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function ReportCard({ c, onOpen }: { c: Card; onOpen: () => void }) {
  return (
    <button className="rcard" type="button" onClick={onOpen}>
      <span className="rcard__c">{c.category ?? 'Uncategorized'}</span>
      <span className="rcard__n">{c.name}</span>
      {c.value == null
        ? <span className="rcard__none">Not read yet</span>
        : <span className="rcard__v">{nf.format(c.value)}</span>}
      {/* The card carries its registered chart type, but only the HEADLINE
          measure -- the one the number above it belongs to. Three measures on a
          64px plot share one scale, and the moment they differ in magnitude two
          of them lie flat along the bottom saying nothing. The other measures
          are a click away, where there is room to read them. */}
      {(c.series[0]?.points.length ?? 0) > 1 && (
        <span className="rcard__chart">
          <Chart type={c.chartType} series={c.series.slice(0, 1)}
                 height={64} labels={false} bare compact />
        </span>
      )}
      <span className="rcard__f"><Fresh c={c} /></span>
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
function ReportPop({ c, onClose }: { c: Card; onClose: () => void }) {
  const [tab, setTab] = useState<'shape' | 'rows'>('shape')
  const box = useRef<HTMLDivElement>(null)

  return (
    <div className="rscrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rpop" role="dialog" aria-modal="true" aria-label={c.name} ref={box}>
        <div className="rpop__h">
          <span className="rpop__t">
            <b>{c.name}</b>
            <span>{[c.entity, c.department, c.category].filter(Boolean).join(' · ')}
              {c.lastLook ? ` · looked ${ago(c.lastLook)}` : ' · never looked'}</span>
          </span>
          <button className="rpop__x" type="button" aria-label="Close" onClick={onClose}>&times;</button>
        </div>

        <div className="rpop__tabs" role="tablist">
          <button role="tab" type="button" aria-selected={tab === 'shape'}
                  onClick={() => setTab('shape')}>The shape</button>
          <button role="tab" type="button" aria-selected={tab === 'rows'}
                  onClick={() => setTab('rows')}>The rows behind it</button>
        </div>

        {/* The rows are fetched when the tab is opened, not before: most people
            never open it, and five hundred rows per card is a page nobody can
            load. RawTable does that itself. */}
        {tab === 'shape'
          ? <Shape c={c} />
          : <div className="rpop__b rpop__b--data">
              <RawTable reportId={c.id} name={c.name} everRead={c.freshness !== 'new'} />
            </div>}

        <div className="rpop__go">
          <RefreshBtn id={c.id} />
          <a className="btn" href={`/reporting/${c.id}`}>Open it</a>
          <span className="spacer" />
          {c.lastLookOk === false && c.lastFailure &&
            <span className="rpop__fail" title={c.lastFailure}>{c.lastFailure}</span>}
        </div>
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
              {head[head.length - 1].v >= head[0].v ? '+' : ''}
              {nf.format(head[head.length - 1].v - head[0].v)}
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

function RefreshBtn({ id }: { id: string }) {
  const [state, run] = useFormState(refreshReport, null)
  return (
    <form action={run} className="rpop__ref">
      <input type="hidden" name="id" value={id} />
      <Go />
      {state && <span className={state.ok ? 'rpop__said' : 'rpop__fail'}>{state.message}</span>}
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return <button className="btn" type="submit" disabled={pending}>
    {pending ? 'Looking…' : 'Refresh'}</button>
}
