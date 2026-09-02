'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { refreshReport } from '@/app/actions/reports'
import Chart, { Legend, type Series } from '@/components/Chart'

export type Card = {
  id: string; name: string; entity: string; department: string; category: string | null
  value: number | null; valueOn: string | null
  chartType: string; refresh: string; snapshotAt: string | null; restricted: boolean
  lastLook: string | null; lastLookOk: boolean | null; lastFailure: string | null
  freshness: 'new' | 'good' | 'behind' | 'failed' | 'snapshot'
  series: Series[]
}

type Rows = {
  columns: { key: string; label: string; type: 'text' | 'number' | 'date' }[]
  rows: (string | number | null)[][]
  /** What the sheet itself shows, cell for cell. A sheet already knows how it
   *  wants its numbers written; re-deriving that turned a Year of 2026 into
   *  "2,026". The table prints this; sorting and export use `rows`. */
  display: (string | null)[][] | null
  row_count: number; truncated: boolean; fetched_at: string | null
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
  const [data, setData] = useState<Rows | null>(null)
  const [loading, setLoading] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  // Sorting and hiding live here, not in the table, because the export has to
  // agree with what is on screen. A CSV that comes back in a different order
  // from the table you exported it from is a CSV somebody has to re-sort.
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(new Set())

  const view = useMemo<Rows | null>(() => {
    if (!data) return null
    const keep = data.columns.map((_, i) => i).filter((i) => !hidden.has(i))

    // Sort the INDEXES, not the rows, so the display strings travel with the
    // values they belong to. Sorting two parallel arrays separately is how a
    // table ends up showing one row's numbers under another row's label.
    let order = data.rows.map((_, n) => n)
    if (sort) {
      const { i, dir } = sort
      const t = data.columns[i]?.type
      order = order.sort((a, b) => {
        const x = data.rows[a][i], y = data.rows[b][i]
        if (x == null) return 1
        if (y == null) return -1
        if (t === 'number') return ((x as number) - (y as number)) * dir
        return String(x).localeCompare(String(y)) * dir
      })
    }
    return {
      ...data,
      columns: keep.map((i) => data.columns[i]),
      rows: order.map((n) => keep.map((i) => data.rows[n][i])),
      display: data.display
        ? order.map((n) => keep.map((i) => data.display![n]?.[i] ?? null))
        : null,
    }
  }, [data, sort, hidden])

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  // Fetched when the tab is opened, not before: most people never open it, and
  // five hundred rows per card is a page nobody can load.
  useEffect(() => {
    if (tab !== 'rows' || data || loading) return
    setLoading(true)
    fetch(`/api/report/${c.id}/rows`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ columns: [], rows: [], display: null,
                             row_count: 0, truncated: false, fetched_at: null }))
      .finally(() => setLoading(false))
  }, [tab, data, loading, c.id])

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

        {tab === 'shape'
          ? <Shape c={c} />
          : <RawTab c={c} data={data} loading={loading}
                    sort={sort} setSort={setSort} hidden={hidden} setHidden={setHidden} />}

        <div className="rpop__go">
          <RefreshBtn id={c.id} />
          {tab === 'rows' && view && view.rows.length > 0 &&
            <button className="btn" type="button" onClick={() => toCsv(c.name, view)}>Export CSV</button>}
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
        {head.length < 2
          ? <p className="empty">
              {c.freshness === 'new'
                ? 'Hopper has not read this one yet. Refresh it and the shape appears.'
                : 'One reading so far — a shape needs two.'}
            </p>
          : <><Chart type={c.chartType} series={c.series} height={250} />
              <Legend series={c.series} /></>}
        <div className="figs">
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

// ------------------------------------------------------- the rows behind it

/**
 * A wide table, readably. Four things carry it, and they matter in this order:
 *
 *  1. The first column freezes. Scroll right through fifteen columns and the
 *     thing that tells you WHICH ROW you are on leaves the screen, after which
 *     every number you read belongs to nobody.
 *  2. The header freezes. Same argument, the other axis.
 *  3. Rows alternate. Hairlines are enough at five columns; at fifteen the eye
 *     loses the line halfway across and a band is what carries it. Very faint --
 *     a stripe you notice is a stripe competing with the numbers.
 *  4. Hover lights the whole row over the top of the stripe, so pointing at a
 *     row is still how you read one.
 *
 * The table runs to the container's own edges, because padding around a
 * fifteen-column table costs two columns for nothing.
 */
function RawTab({ c, data, loading, sort, setSort, hidden, setHidden }: {
  c: Card; data: Rows | null; loading: boolean
  sort: { i: number; dir: 1 | -1 } | null
  setSort: (s: { i: number; dir: 1 | -1 } | null) => void
  hidden: Set<number>; setHidden: (h: Set<number>) => void
}) {
  const [tight, setTight] = useState(false)
  const [picking, setPicking] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const boxEl = useRef<HTMLDivElement>(null)

  const cols = data?.columns ?? []

  // The same index sort the popover does, for the same reason: the display
  // strings have to move with the values they belong to.
  const order = useMemo(() => {
    const ix = (data?.rows ?? []).map((_, n) => n)
    if (!sort || !data) return ix
    const { i, dir } = sort
    const t = cols[i]?.type
    return ix.sort((a, b) => {
      const x = data.rows[a][i], y = data.rows[b][i]
      if (x == null) return 1
      if (y == null) return -1
      if (t === 'number') return ((x as number) - (y as number)) * dir
      return String(x).localeCompare(String(y)) * dir
    })
  }, [data, sort, cols])

  // The right-edge hint must not lie: it goes out once you have actually
  // reached the last column, and a pinned column casts a shadow only once it is
  // floating over something.
  const edge = () => {
    const w = wrap.current, b = boxEl.current
    if (!w || !b) return
    b.classList.toggle('at-end', w.scrollWidth - w.clientWidth - w.scrollLeft <= 2)
    b.classList.toggle('is-scrolled', w.scrollLeft > 2)
  }
  useEffect(edge, [data, hidden, tight])

  if (loading) return <div className="rpop__b"><p className="empty">Reading…</p></div>
  if (!data || cols.length === 0) {
    return <div className="rpop__b"><p className="empty">
      {c.freshness === 'new'
        ? 'Nothing has been read yet. Refresh it and the rows appear here.'
        : 'The last look brought back no rows.'}
    </p></div>
  }

  const shownCols = cols.map((_, i) => i).filter((i) => !hidden.has(i))

  return (
    <div className="rpop__b rpop__b--data">
      <div className="rawbar">
        <span className="rawbar__l">
          {data.truncated
            ? <>The most recent <b>{order.length.toLocaleString()}</b> rows of <b>{data.row_count.toLocaleString()}</b></>
            : <><b>{order.length.toLocaleString()}</b> row{order.length === 1 ? '' : 's'}</>}
          {data.fetched_at ? `, read ${ago(data.fetched_at)}.` : '.'}
        </span>
        <div className="seg">
          <button className="seg__b" type="button" aria-pressed={!tight}
                  onClick={() => setTight(false)}>Comfortable</button>
          <button className="seg__b" type="button" aria-pressed={tight}
                  onClick={() => setTight(true)}>Compact</button>
        </div>
        <div className="colpick">
          <button className="btn" type="button" aria-expanded={picking}
                  onClick={(e) => { e.stopPropagation(); setPicking(!picking) }}>
            Columns <b>{shownCols.length}</b>
          </button>
          {picking && (
            <div className="colpop" onMouseDown={(e) => e.stopPropagation()}>
              {cols.map((col, i) => {
                const on = !hidden.has(i)
                return (
                  <button key={col.key} className="colrow" type="button" aria-pressed={on}
                    disabled={i === 0}
                    title={i === 0 ? 'The key column stays' : undefined}
                    onClick={() => {
                      const next = new Set(hidden)
                      on ? next.add(i) : next.delete(i)
                      setHidden(next)
                    }}>
                    <span className={`colrow__k colrow__k--${col.type}`}>
                      {col.type === 'number' ? '123' : col.type === 'date' ? 'DATE' : 'ABC'}
                    </span>
                    <span>{col.label}</span>
                    <span className="colrow__c">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                           strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l6 6L20 6" /></svg>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rawbox" ref={boxEl}>
        <div className="rawwrap" ref={wrap} onScroll={edge}>
          <table className={`raw${tight ? ' raw--tight' : ''}`}>
            <thead><tr>
              {shownCols.map((i) => {
                const col = cols[i]
                const active = sort?.i === i
                return (
                  <th key={col.key} scope="col"
                      className={col.type === 'number' ? 'num' : undefined}
                      aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                      onClick={() => setSort(active
                        ? { i, dir: sort!.dir === 1 ? -1 : 1 }
                        : { i, dir: col.type === 'date' ? -1 : 1 })}>
                    {col.label}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
                         strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 11l6-6 6 6" /></svg>
                  </th>
                )
              })}
            </tr></thead>
            <tbody>
              {order.map((n) => (
                <tr key={n}>
                  {shownCols.map((i) => (
                    <td key={i} className={cols[i].type === 'number' ? 'num' : undefined}>
                      {shown(data!, n, i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="rawnote">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        <span>Hopper keeps the most recent rows rather than the whole sheet — the source is still
          the source, and this is what it said when Hopper last looked.</span>
      </p>
    </div>
  )
}

/**
 * What one cell prints.
 *
 * The sheet's own formatting first, because a sheet already knows whether a
 * column is money, a percentage or a year — and a year re-derived from the raw
 * number comes out as "2,026". Falling back to Intl only where the source had
 * no format of its own.
 */
function shown(data: Rows, n: number, i: number) {
  const d = data.display?.[n]?.[i]
  if (d != null && d !== '') return d
  const v = data.rows[n]?.[i]
  if (v == null) return ''
  return typeof v === 'number' ? nf.format(v) : String(v)
}

/**
 * Export takes what you are looking at, sorted the way you sorted it. A CSV
 * that comes back in a different order from the table you exported it from is a
 * CSV somebody has to re-sort.
 */
function toCsv(name: string, data: Rows) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = [data.columns.map((c) => esc(c.label)).join(',')]
    .concat(data.rows.map((r) => r.map(esc).join(',')))
    .join('\n')
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[^\w -]/g, '').trim() || 'report'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

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
