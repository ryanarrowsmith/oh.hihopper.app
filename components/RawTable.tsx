'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cell } from '@/lib/pivot'

/**
 * The rows behind a report.
 *
 * Self-contained on purpose: it fetches its own rows, keeps its own sort, its
 * own hidden columns and its own density, and carries its own Export. It is
 * used in two places -- the popover on the reporting list, and the report's own
 * page -- and threading that state up through two different parents is how the
 * two copies start behaving differently.
 *
 * Four things make a wide table readable, and they matter in this order:
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
 */

export type Rows = {
  columns: { key: string; label: string; type: 'text' | 'number' | 'date' }[]
  rows: (string | number | null)[][]
  /** What the sheet itself shows, cell for cell. A sheet already knows how it
   *  wants its numbers written; re-deriving that turned a Year of 2026 into
   *  "2,026". The table prints this; sorting and export use `rows`. */
  display: (string | null)[][] | null
  row_count: number; truncated: boolean; fetched_at: string | null
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** How many rows a drill-down brings back. A cell can hold eight thousand;
 *  putting all of them in the DOM is a page nobody can scroll, and the honest
 *  next step past a screenful is the export, which the note points at. */
const DIG = 1_000

/** A cell key, back into the two halves hopper.pivot_rows wants. */
const splitKey = (k: string) => {
  const i = k.indexOf('\u0001')
  return i < 0 ? { rk: k, ck: ' all' } : { rk: k.slice(0, i), ck: k.slice(i + 1) }
}

const dayLabel = (iso: string) =>
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

/** The sheet's own formatting first; Intl only where the source had none. */
function shown(data: Rows, n: number, i: number) {
  const d = data.display?.[n]?.[i]
  if (d != null && d !== '') return d
  const v = data.rows[n]?.[i]
  if (v == null) return ''
  return typeof v === 'number' ? nf.format(v) : String(v)
}

export default function RawTable({ reportId, name, everRead, bleed = true,
  dateColumn, cells, cellLabel, cellRows, spec, picked, expanded }: {
  reportId: string; name: string
  /** Which pivot cell a source row falls in, when the chart above is a pivot.
   *  Given, this replaces the date column as what a row and a mark have in
   *  common: a bar IS a cell, and every row carries the two fields it is
   *  grouped by. Null from it means the row is in no cell at all -- the spec
   *  filtered it out -- which is exactly what the pivot did with it. */
  /** Wider and taller, because the whole panel has gone full width. The control
   *  that does it lives on the chart -- one button for both halves, since they
   *  are one panel now and expanding half of it would be a strange offer. */
  cells?: ((row: (string | number | null)[]) => string | null) | null
  /** How a chosen cell is written in the filter bar. */
  cellLabel?: (key: string) => string
  /** How many rows the SHEET holds in a chosen cell, as opposed to how many of
   *  them are in the sample. Without it a cell worth three quarters of a
   *  million looks like four rows. */
  cellRows?: (key: string) => number | null
  /** The spec the chart is drawn from, so the rows behind a chosen cell can be
   *  asked for from the whole sheet rather than found in the sample. */
  spec?: unknown
  /** The column the chart's days come from. Without it there is no
   *  correspondence between a point and a row, and the linking is not offered
   *  at all rather than offered and wrong. */
  dateColumn?: string | null
  picked?: { days: Set<string>; pick: (day: string, extend: boolean) => void; clear: () => void }
  expanded?: boolean
  /** Nothing read yet is a state, not a failure, and it gets its own sentence
   *  rather than an empty table that looks broken. */
  everRead: boolean
  /** Edge to edge inside its container. Padding around a fifteen-column table
   *  costs two columns for nothing. */
  bleed?: boolean
}) {
  const [data, setData] = useState<Rows | null>(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [tight, setTight] = useState(false)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  /** The rows behind the chosen cells, read from the whole sheet rather than
   *  found in the sample. Null while there is nothing chosen, or while the
   *  sample IS the sheet and there is nothing to go and get. */
  const [deep, setDeep] = useState<{ rows: Cell[][]; for: string } | null>(null)
  const [digging, setDigging] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const boxEl = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/report/${reportId}/rows`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ columns: [], rows: [], display: null,
        row_count: 0, truncated: false, fetched_at: null }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reportId])

  const cols = data?.columns ?? []
  // What this table is actually drawing. The drill-down replaces the rows and
  // nothing else -- same columns, same counts at the top -- so no part of the
  // table below here has to know where a row came from. It carries no display
  // strings: the ledger keeps values, and the sheet's own formatting lives on
  // the sample.
  const view = useMemo(
    () => (deep && data ? { ...data, rows: deep.rows, display: null } : data),
    [deep, data])

  // Which column carries the day the chart is drawn along. -1 means this table
  // and that chart have nothing in common to link by.
  const di = dateColumn ? cols.findIndex((c) => c.label === dateColumn) : -1
  const linked = !!picked && (di >= 0 || !!cells)
  const chosen = picked?.days ?? new Set<string>()
  // What this row and a mark on the chart have in common. A pivot says which
  // cell; everything else says which day.
  const keyOf = (n: number) => {
    const row = view?.rows[n]
    if (!row) return null
    if (cells) return cells(row)
    const v = row[di]
    return typeof v === 'string' ? v.slice(0, 10) : null
  }
  const wordFor = (k: string) => (cells ? (cellLabel?.(k) ?? k) : dayLabel(k))
  // How many rows the SHEET holds in what is chosen, when the chart knows --
  // the pivot counts them anyway. Null where nothing can say.
  const inSheet = cellRows && chosen.size > 0
    ? [...chosen].reduce<number | null>((sum, k) => {
        const n = cellRows(k)
        return sum === null || n === null ? null : sum + n
      }, 0)
    : null

  // Sort the INDEXES, not the rows, so the display strings travel with the
  // values they belong to. Sorting two parallel arrays separately is how a
  // table ends up showing one row's numbers under another row's label.
  const all = useMemo(() => {
    const ix = (view?.rows ?? []).map((_, n) => n)
    if (!sort || !view) return ix
    const { i, dir } = sort
    const t = cols[i]?.type
    return ix.sort((a, b) => {
      const x = view.rows[a][i], y = view.rows[b][i]
      if (x == null) return 1
      if (y == null) return -1
      if (t === 'number') return ((x as number) - (y as number)) * dir
      return String(x).localeCompare(String(y)) * dir
    })
  }, [view, sort, cols])

  /**
   * Choosing on the chart filters here; choosing here feeds back to the chart.
   *
   * The table FILTERS while the chart only emphasises, and that is not an
   * inconsistency: a table showing six of twenty-six rows is exactly true,
   * whereas a line drawn through six non-adjacent days would invent the
   * segments between them -- a picture of something that never happened.
   */
  // What the chart says was clicked, in the shape hopper.pivot_rows wants.
  const asked = cells && chosen.size > 0 ? [...chosen].sort().join('\u0002') : null
  useEffect(() => {
    if (!asked || !spec || !data?.truncated) { setDeep(null); return }
    let alive = true
    setDigging(true)
    const want = asked
    fetch('/api/report/pivot/rows', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report: reportId, spec,
        cells: want.split('\u0002').map(splitKey),
        limit: DIG,
      }),
    })
      .then((r) => r.json())
      .then((r) => {
        if (!alive || want !== asked) return
        // The keys the sheet had, back into the positional rows this table
        // draws -- the same shape report_rows keeps, so nothing below here has
        // to know where a row came from.
        setDeep(r.ok
          ? { for: want, rows: (r.rows as { cells: Record<string, Cell> }[])
                .map((x) => cols.map((c) => x.cells?.[c.key] ?? null)) }
          : null)
      })
      .catch(() => { if (alive) setDeep(null) })
      .finally(() => { if (alive) setDigging(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, reportId, data?.truncated, cols.length])

  const order = useMemo(() => {
    if (!linked || chosen.size === 0) return all
    // A drill-down is already only the chosen cells -- filtering it again would
    // be asking the same question twice and getting a slower answer.
    if (deep) return all
    return all.filter((n) => {
      const row = view?.rows[n]
      if (!row) return false
      if (cells) { const k = cells(row); return k != null && chosen.has(k) }
      const v = row[di]
      return typeof v === 'string' && chosen.has(v.slice(0, 10))
    })
  }, [all, linked, chosen, view, di, cells, deep])

  // The right-edge hint must not lie: it goes out once you have actually
  // reached the last column. A pinned column casts a shadow only once it is
  // floating over something.
  const edge = () => {
    const w = wrap.current, b = boxEl.current
    if (!w || !b) return
    b.classList.toggle('at-end', w.scrollWidth - w.clientWidth - w.scrollLeft <= 2)
    b.classList.toggle('is-scrolled', w.scrollLeft > 2)
  }
  useEffect(edge, [data, hidden, tight])

  if (loading) return <p className="empty">Reading…</p>
  if (!data || !view || cols.length === 0) {
    return <p className="empty">
      {everRead ? 'The last look brought back no rows.'
                : 'Nothing has been read yet. Refresh it and the rows appear here.'}
    </p>
  }

  const shownCols = cols.map((_, i) => i).filter((i) => !hidden.has(i))

  /**
   * Every row, not the five hundred this browser happens to hold.
   *
   * Export was built when the table WAS the data, so it wrote out what was in
   * memory -- right while that was everything, and quietly wrong the day a
   * report had eighty-four thousand rows and a sample of five hundred. A
   * button that says Export and gives you 0.6% of the sheet is worse than no
   * button.
   *
   * The columns you hid stay hidden and a chosen cell still filters, because
   * both of those are things you asked for. The SORT does not travel: the
   * table's sort runs over what it holds, and re-sorting the whole sheet by an
   * arbitrary spreadsheet column costs a full sort per page with no index that
   * could help. Sheet order, and the button says so rather than handing back
   * an order that is neither.
   */
  async function toCsv() {
    setSaving(true)
    try {
      const r = await fetch(`/api/report/${reportId}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cols: shownCols.map((i) => cols[i].key),
          spec: cells && chosen.size > 0 ? spec : undefined,
          cells: cells && chosen.size > 0
            ? [...chosen].map(splitKey) : undefined,
        }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.replace(/[^\w -]/g, '').trim() || 'report'}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Falling back to what is on screen is worse than saying nothing
      // happened: a file named after the report, holding a fraction of it, is
      // one nobody will question later.
      setFailed('Hopper could not put that file together. Try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`${bleed ? 'rawpane rawpane--bleed' : 'rawpane'}${expanded ? ' rawpane--tall' : ''}`}>
      <div className="rawbar">
        <span className="rawbar__l">
          {/* What Hopper HOLDS. What a filter is showing is the bar below;
              two counts in two places had better not be counting the same
              thing differently. */}
          {data.truncated
            ? <>The most recent <b>{data.rows.length.toLocaleString()}</b> rows of <b>{data.row_count.toLocaleString()}</b></>
            : <><b>{data.rows.length.toLocaleString()}</b> row{data.rows.length === 1 ? '' : 's'}</>}
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
                    disabled={i === 0} title={i === 0 ? 'The key column stays' : undefined}
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
        <button className="btn" type="button" onClick={toCsv} disabled={saving}
                title={data.truncated
                  ? `All ${data.row_count.toLocaleString()} rows, in sheet order`
                  : 'Every row, in sheet order'}>
          {saving ? 'Putting it together…' : 'Export CSV'}
        </button>
      </div>

      {linked && (chosen.size > 0
        // What a filter is hiding, said where the rows are, with the way out
        // next to it. A filtered table that does not say it is filtered is a
        // table that lies about how much data there is.
        ? <p className="pickbar">
            {/* Three different true sentences, and which one is true depends on
                where the rows came from. A drill-down holds the sheet's rows
                and is capped; the sample holds whatever of them it happened to
                keep; a small sheet holds all of them either way. Saying the
                wrong one of these is how a correct table looks broken. */}
            {digging
              ? <>Fetching the rows behind{' '}{[...chosen].sort().map(wordFor).join(', ')}…</>
              : deep
              ? <>
                  <b>{order.length.toLocaleString()}</b>
                  {inSheet != null && inSheet > order.length
                    ? <> of {inSheet.toLocaleString()}</> : null} rows
                  {' '}&middot; {[...chosen].sort().map(wordFor).join(', ')}
                  {inSheet != null && inSheet > order.length && (
                    <span className="pickbar__all">&mdash; Export CSV takes all of them</span>
                  )}
                </>
              : <>
                  <b>{order.length}</b> of {data.rows.length}{data.truncated ? ' sampled' : ''} rows
                  {' '}&middot; {[...chosen].sort().map(wordFor).join(', ')}
                  {inSheet != null && data.truncated && (
                    <span className="pickbar__all">
                      &mdash; {inSheet.toLocaleString()} in the sheet
                    </span>
                  )}
                </>}
            <button className="lnk" type="button" onClick={picked!.clear}>Clear</button>
          </p>
        // The same slot when nothing is chosen yet, because the linking used to
        // be announced by the section heading above the table and that heading
        // is gone -- the rows sit directly under the chart now. An interaction
        // nobody is told about is an interaction nobody uses, and putting the
        // invitation where the filter state will appear means the table does
        // not jump when somebody accepts it.
        : <p className="pickbar pickbar--idle">
            {cells
              ? 'Click a bar on the chart, or a row here — the two follow each other.'
              : 'Click a point on the chart, or a row here — the two follow each other.'}
          </p>
      )}

      {failed && <p className="pickbar pickbar--bad">{failed}
        <button className="lnk" type="button" onClick={() => setFailed(null)}>Dismiss</button></p>}

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
              {order.map((n) => {
                const d = linked ? keyOf(n) : null
                return (
                <tr key={n} className={d && chosen.has(d) ? 'is-on' : undefined}
                    onClick={linked && d ? (e) => picked!.pick(d, e.shiftKey) : undefined}
                    style={linked && d ? { cursor: 'pointer' } : undefined}>
                  {shownCols.map((i, at) => (
                    <td key={i} className={cols[i].type === 'number' ? 'num' : undefined}
                        // The key column is clipped, so it has to be able to
                        // say the rest of itself somehow.
                        title={at === 0 ? String(shown(view!, n, i)) : undefined}>
                      {shown(view!, n, i)}
                    </td>
                  ))}
                </tr>
              )})}
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
