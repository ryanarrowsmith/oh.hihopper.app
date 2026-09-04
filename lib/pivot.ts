/**
 * The pivot: one spec, read by the table and by the chart.
 *
 * Reporting used to insist that one axis was a date. That was never a rule
 * about charts, it was a rule about the ONE shape the builder could describe:
 * a date column, some measures, and an implied "one row per day". The moment
 * any field may go on any axis, the thing being described is a pivot -- rows,
 * columns, values, filters -- and a chart is one of the two ways to draw it.
 *
 * So this file holds the spec and the arithmetic, and nothing that draws. The
 * table and the chart both read what pivot() returns, which is why they cannot
 * disagree about what the report says.
 *
 * No 'use client' on purpose: a server action has to be able to validate a
 * spec before it writes one, and a Server Component may not import a plain
 * value out of a client module -- that mistake has cost this app two live 500s
 * already.
 */

export type FieldType = 'text' | 'number' | 'date'
export type Col = { key: string; label: string; type: FieldType }
export type Cell = string | number | null

/** The tab as hopper.report_rows keeps it. */
export type Tab = { columns: Col[]; rows: Cell[][] }

/** How a date is cut when it goes down the side or across the top. */
export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year'
export const GRAINS: Grain[] = ['day', 'week', 'month', 'quarter', 'year']
export const GRAIN_WORD: Record<Grain, string> = {
  day: 'by day', week: 'by week', month: 'by month', quarter: 'by quarter', year: 'by year',
}

/**
 * How a value is added up.
 *
 * 'as-is' is the one that has to explain itself: it takes the LAST row that
 * lands in a cell, which is what a sheet means when the same day appears twice
 * -- the lower row is the correction. It is also what Hopper has always done,
 * which is why every report that existed before the pivot migrates onto it
 * rather than onto Sum. Silently adding two corrections together would change
 * four live reports' numbers without anybody asking for it.
 */
export type Agg = 'sum' | 'avg' | 'count' | 'countd' | 'min' | 'max' | 'as-is'
export const AGGS: Agg[] = ['sum', 'avg', 'count', 'countd', 'min', 'max', 'as-is']
export const AGG_WORD: Record<Agg, string> = {
  sum: 'Sum', avg: 'Average', count: 'Count', countd: 'Count distinct',
  min: 'Min', max: 'Max', 'as-is': 'Value as it is',
}
export const AGG_SHORT: Record<Agg, string> = {
  sum: 'Sum', avg: 'Avg', count: 'Count', countd: 'Distinct',
  min: 'Min', max: 'Max', 'as-is': 'As it is',
}
export const AGG_SAY: Record<Agg, string> = {
  sum: 'Adds the rows in the cell together.',
  avg: 'The mean of the rows in the cell.',
  count: 'How many rows land in the cell.',
  countd: 'How many different answers land in the cell.',
  min: 'The smallest.',
  max: 'The largest.',
  'as-is': 'The value itself. When two rows land in the same cell it takes the last one, and the cell says so.',
}
/** Which aggregations a text or date field can carry. Nothing else is arithmetic. */
export const AGGS_FOR = (t: FieldType): Agg[] =>
  t === 'number' ? AGGS : ['count', 'countd']

export type Placed = { field: string; grain?: Grain }
export type Value = { field: string; agg: Agg }

export type FilterOp = 'is' | 'not' | 'has' | 'gte' | 'lte' | 'empty' | 'filled'
export const OP_WORD: Record<FilterOp, string> = {
  is: 'is', not: 'is not', has: 'contains', gte: 'is at least', lte: 'is at most',
  empty: 'is empty', filled: 'is not empty',
}
export type Filter = {
  field: string
  op: FilterOp
  a?: string
  /**
   * Ask the reader rather than deciding for them.
   *
   * A report's filters are part of what the report IS -- change one and you
   * have changed it for everybody. But some of them are not the report, they
   * are the question somebody has while looking at it: which rep, which
   * location, count the fuel surcharge or not. Marked ask, a filter becomes a
   * control above the chart instead of a setting inside it, and the answer
   * lives in that person's screen rather than on the report.
   */
  ask?: boolean
}

/**
 * What decides the order of the row axis.
 *
 * 'value' -- biggest first, which is what somebody scanning a list of regions
 * is asking for, and what this did before there was a choice.
 * 'label'  -- alphabetical.
 * 'by'     -- by another column entirely. This is the one a real sheet needs:
 * DASH-Revenue Activity carries a PL Display Order beside every account name,
 * because the order those five lines belong in is a fact about the business
 * and not a fact about this month's numbers.
 */
export type Sort = 'value' | 'label' | 'by'
export const SORT_WORD: Record<Sort, string> = {
  value: 'Biggest first', label: 'A to Z', by: 'By another column',
}

export type Spec = {
  v: 1
  rows: Placed[]
  columns: Placed[]
  values: Value[]
  filters: Filter[]
  sort: Sort
  /** The column 'by' sorts on. Ignored otherwise. */
  sortBy: string | null
  /** What `points` cuts becomes one "Others" row rather than disappearing.
   *  Only offered when every value is one that can be added up -- an average
   *  of averages is not an average, and Others must not quietly become one. */
  other: boolean
  /** Which mark. Kept here so the whole of "what this report draws" is one object. */
  type: string
  /** The most recent this many row keys. Null draws every one. */
  points: number | null
  /** Keep the plots on one scale anyway. */
  together: boolean
}

export const EMPTY: Spec = {
  v: 1, rows: [], columns: [], values: [], filters: [],
  sort: 'value', sortBy: null, other: false,
  type: 'line', points: null, together: false,
}

/** Whether "Others" is even offerable: adding up what was cut only means
 *  something when the values are sums and counts. */
export const canRollUp = (s: Spec) =>
  s.values.length > 0 && s.values.every((v) => v.agg === 'sum' || v.agg === 'count')

/** A spec that will not draw anything yet, said in one sentence, or null. */
export function whyNothing(s: Spec): string | null {
  if (s.values.length === 0) return 'Nothing is being measured — drop a field into Values.'
  if (s.rows.length === 0) return 'Nothing runs down the side — drop a field into Rows.'
  return null
}

/**
 * A spec off the wire, made safe.
 *
 * Everything that comes back from the database or a form has been through
 * here, so the rest of the file may assume its shape. An unknown aggregation
 * or grain is dropped rather than guessed at: a chart drawing something
 * nobody chose is worse than a chart drawing nothing.
 */
export function readSpec(raw: unknown): Spec {
  const o = (raw ?? {}) as Record<string, unknown>
  const placed = (v: unknown): Placed[] => Array.isArray(v)
    ? v.map((p) => {
        const q = (p ?? {}) as Record<string, unknown>
        const field = typeof q.field === 'string' ? q.field : ''
        const grain = GRAINS.includes(q.grain as Grain) ? (q.grain as Grain) : undefined
        return field ? { field, ...(grain ? { grain } : {}) } : null
      }).filter((p): p is Placed => p !== null)
    : []
  const values: Value[] = Array.isArray(o.values)
    ? o.values.map((p) => {
        const q = (p ?? {}) as Record<string, unknown>
        const field = typeof q.field === 'string' ? q.field : ''
        const agg = AGGS.includes(q.agg as Agg) ? (q.agg as Agg) : 'sum'
        return field ? { field, agg } : null
      }).filter((p): p is Value => p !== null)
    : []
  const filters: Filter[] = Array.isArray(o.filters)
    ? o.filters.map((p) => {
        const q = (p ?? {}) as Record<string, unknown>
        const field = typeof q.field === 'string' ? q.field : ''
        const ops: FilterOp[] = ['is', 'not', 'has', 'gte', 'lte', 'empty', 'filled']
        const op = ops.includes(q.op as FilterOp) ? (q.op as FilterOp) : 'is'
        const a = typeof q.a === 'string' ? q.a : undefined
        return field
          ? { field, op, ...(a === undefined ? {} : { a }), ...(q.ask === true ? { ask: true } : {}) }
          : null
      }).filter((p): p is Filter => p !== null)
    : []
  const pts = Number(o.points)
  const sort: Sort = o.sort === 'label' || o.sort === 'by' ? o.sort : 'value'
  return {
    v: 1,
    rows: placed(o.rows),
    columns: placed(o.columns),
    values,
    filters,
    sort,
    sortBy: sort === 'by' && typeof o.sortBy === 'string' && o.sortBy ? o.sortBy : null,
    other: o.other === true,
    type: typeof o.type === 'string' && o.type ? o.type : 'line',
    points: Number.isFinite(pts) && pts >= 2 ? Math.round(pts) : null,
    together: o.together === true,
  }
}

/**
 * Whether this spec is the old shape wearing new clothes: one date down the
 * side, day by day, and every value taken as it is.
 *
 * Those, and only those, still keep a reading series -- which is what the card,
 * the favorites and the history draw, and what the nightly reader writes. A
 * pivot that is not this shape stores its rows and draws from them; it has no
 * headline figure on a card until the reader learns to speak spec, which is
 * the next piece of work rather than this one.
 */
export function dateShaped(s: Spec): { date: string; measures: string[] } | null {
  if (s.rows.length !== 1 || s.columns.length > 0) return null
  const r = s.rows[0]
  if (r.grain && r.grain !== 'day') return null
  if (!s.values.length || s.values.some((v) => v.agg !== 'as-is')) return null
  return { date: r.field, measures: s.values.map((v) => v.field) }
}

// ------------------------------------------------------------------ the keys

const ISO = /^\d{4}-\d{2}-\d{2}/

/** A date cut to its grain, as a sortable key. */
export function bucket(iso: string, g: Grain): string {
  const d = iso.slice(0, 10)
  if (g === 'day') return d
  const [y, m, day] = d.split('-').map(Number)
  if (g === 'year') return `${y}`
  if (g === 'quarter') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
  if (g === 'month') return `${y}-${String(m).padStart(2, '0')}`
  // The week its Monday falls in, so a week is one key and not seven.
  const t = new Date(Date.UTC(y, m - 1, day))
  const back = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - back)
  return t.toISOString().slice(0, 10)
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How a key is written where a person reads it. */
export function keyWord(k: string, g?: Grain): string {
  if (k === OTHERS_KEY) return 'Others'
  if (!g) return k
  if (g === 'year') return k
  if (g === 'quarter') return k.replace('-', ' ')
  if (g === 'month') {
    const [y, m] = k.split('-').map(Number)
    return `${MONTH[m - 1] ?? m} ${String(y).slice(2)}`
  }
  if (!ISO.test(k)) return k
  const [, m, d] = k.split('-').map(Number)
  const w = `${MONTH[m - 1] ?? m} ${d}`
  return g === 'week' ? `w/c ${w}` : w
}

const num = (v: Cell) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/[$,\s]/g, ''))
    return v.trim() !== '' && Number.isFinite(n) ? n : null
  }
  return null
}

const text = (v: Cell) => (v === null || v === undefined ? '' : String(v))

// --------------------------------------------------------------- the pivoting

export type Pivot = {
  /** Down the side, in order, already cut to `points`. */
  rowKeys: string[]
  /** Across the top, in order. Empty means the values are the only columns. */
  colKeys: string[]
  values: Value[]
  rowGrain?: Grain
  colGrain?: Grain
  cell: (r: string, c: string, v: number) => number | null
  rowTotal: (r: string, v: number) => number | null
  colTotal: (c: string, v: number) => number | null
  grand: (v: number) => number | null
  /** How many source rows survived the filters, and how many row keys they
   *  made before `points` cut the tail off. */
  kept: number
  matched: number
  /** How many cells quietly held more than one row under an 'as-is' value.
   *  Said out loud rather than swallowed: dropping rows without saying so is
   *  the one thing a chart must never do. */
  collided: number
}

const ALL = ' all'
export const ALL_KEY = ALL
/** The row that stands for everything the window cut. A leading space so it
 *  can never collide with a real key out of a spreadsheet. */
export const OTHERS_KEY = ' others'

function keyOf(row: Cell[], at: number[], grains: (Grain | undefined)[]): string {
  if (at.length === 0) return ALL
  return at.map((i, n) => {
    const raw = row[i]
    const g = grains[n]
    if (g && typeof raw === 'string' && ISO.test(raw)) return bucket(raw, g)
    return text(raw)
  }).join(' · ')
}

/** The two keys joined, for a Set. The separator is a control character, so it
 *  cannot collide with anything a spreadsheet can hold. */
export const cellKey = (rk: string, ck: string) => `${rk}\u0001${ck}`

/** And back again. A key with no column half stands for the whole row -- every
 *  column of it -- which is what a chart that cannot separate its series can
 *  honestly say was clicked. */
export function cellParts(k: string): { rk: string; ck: string } {
  const i = k.indexOf('\u0001')
  return i < 0 ? { rk: k, ck: ALL } : { rk: k.slice(0, i), ck: k.slice(i + 1) }
}

/**
 * Which cell of the pivot a source row falls in, or null if it falls in none.
 *
 * The same two decisions pivot() makes -- does this row survive the filters,
 * and what are its two keys -- so the rows behind a bar are found by the
 * arithmetic that drew the bar rather than by a second, weaker implementation
 * of "which cell is this row in". A row the spec filtered out belongs to no
 * cell, which is exactly true and needs no separate idea.
 *
 * A closure because the column indices are resolved once per spec rather than
 * once per row.
 */
export function cellOf(tab: Tab, spec: Spec) {
  const at = (label: string) => tab.columns.findIndex((c) => c.key === label || c.label === label)
  const rowAt = spec.rows.map((p) => at(p.field)).filter((i) => i >= 0)
  const colAt = spec.columns.map((p) => at(p.field)).filter((i) => i >= 0)
  const rowGrains = spec.rows.map((p) => p.grain)
  const colGrains = spec.columns.map((p) => p.grain)
  const live = spec.filters
    .map((f) => ({ f, i: at(f.field) }))
    .filter((x) => x.i >= 0)
  return (row: Cell[]): { rk: string; ck: string } | null => {
    if (!live.every((x) => passes(row, x.f, x.i))) return null
    return { rk: keyOf(row, rowAt, rowGrains), ck: keyOf(row, colAt, colGrains) }
  }
}

function passes(row: Cell[], f: Filter, i: number): boolean {
  const raw = row[i]
  const s = text(raw).trim()
  const want = (f.a ?? '').trim().toLowerCase()
  // A question nobody has answered filters nothing. Without this, an empty
  // "Sales Rep is ___" would mean "rows with no sales rep", which is the
  // opposite of what an empty box looks like it means.
  if (f.ask && want === '' && f.op !== 'empty' && f.op !== 'filled') return true
  switch (f.op) {
    case 'empty': return s === ''
    case 'filled': return s !== ''
    case 'is': return s.toLowerCase() === want
    case 'not': return s.toLowerCase() !== want
    case 'has': return s.toLowerCase().includes(want)
    case 'gte': { const n = num(raw), b = Number(f.a); return n !== null && Number.isFinite(b) && n >= b }
    case 'lte': { const n = num(raw), b = Number(f.a); return n !== null && Number.isFinite(b) && n <= b }
  }
}

/**
 * The whole of the arithmetic.
 *
 * It runs in the browser, over the tab hopper.report_rows already stores, so
 * moving a chip is instant and costs no round trip. That holds to a few
 * thousand rows; past that this same spec has to go to the database, which is
 * a job for the day a sheet actually gets that big rather than for today.
 */
export function pivot(tab: Tab, spec: Spec): Pivot {
  const at = (label: string) => tab.columns.findIndex((c) => c.key === label || c.label === label)
  const rowAt = spec.rows.map((p) => at(p.field)).filter((i) => i >= 0)
  const colAt = spec.columns.map((p) => at(p.field)).filter((i) => i >= 0)
  const rowGrains = spec.rows.map((p) => p.grain)
  const colGrains = spec.columns.map((p) => p.grain)
  const valAt = spec.values.map((v) => at(v.field))

  const live = spec.filters
    .map((f) => ({ f, i: at(f.field) }))
    .filter((x) => x.i >= 0)
  const rows = tab.rows.filter((r) => live.every((x) => passes(r, x.f, x.i)))

  // One bag per (row, column, value). Kept as parts rather than as a running
  // total, so an average is a real average and a distinct count is real.
  type Bag = {
    n: number; sum: number; min: number; max: number
    last: number | null; seen: Set<string>
  }
  const bags = new Map<string, Bag>()
  const bag = (k: string) => {
    let b = bags.get(k)
    if (!b) {
      b = { n: 0, sum: 0, min: Infinity, max: -Infinity, last: null, seen: new Set() }
      bags.set(k, b)
    }
    return b
  }
  const rowSeen = new Set<string>()
  const colSeen = new Set<string>()
  const rowSort = new Map<string, number>()
  const rowBy = new Map<string, number>()
  const byAt = spec.sortBy ? at(spec.sortBy) : -1
  let collided = 0

  const put = (k: string, v: Cell, agg: Agg, own: boolean) => {
    const b = bag(k)
    const s = text(v).trim()
    if (agg === 'count') { if (s !== '') b.n++; return }
    if (agg === 'countd') { if (s !== '') b.seen.add(s.toLowerCase()); return }
    const n = num(v)
    if (n === null) return
    if (agg === 'as-is' && own && b.last !== null) collided++
    b.n++; b.sum += n; b.last = n
    if (n < b.min) b.min = n
    if (n > b.max) b.max = n
  }

  for (const r of rows) {
    const rk = keyOf(r, rowAt, rowGrains)
    const ck = keyOf(r, colAt, colGrains)
    rowSeen.add(rk)
    colSeen.add(ck)
    // Sorting by another column: the SMALLEST value that column takes for this
    // key. PL Display Order is the same on every row of an account, so min is
    // just "what order is this one" -- and if a sheet is inconsistent about it,
    // taking the smallest is at least an answer that does not move.
    if (spec.sort === 'by' && byAt >= 0) {
      const n = num(r[byAt])
      if (n !== null) {
        const had = rowBy.get(rk)
        if (had === undefined || n < had) rowBy.set(rk, n)
      }
    }
    spec.values.forEach((v, vi) => {
      const i = valAt[vi]
      if (i < 0) return
      // The cell, its two margins and the grand total, each written ONCE.
      // With nothing in Columns the cell IS its own row margin, and adding the
      // row to both bags counted every number twice -- a doubled total that
      // looks entirely plausible, which is the worst kind of wrong.
      //
      // Only the cell itself reports a collision: the margins are supposed to
      // hold many rows, so counting them there would be noise.
      const seen = new Set<string>()
      const one = (k: string, own: boolean) => {
        if (seen.has(k)) return
        seen.add(k)
        put(k, r[i], v.agg, own)
      }
      one(`${rk} ${ck} ${vi}`, true)
      one(`${rk} ${ALL} ${vi}`, false)
      one(`${ALL} ${ck} ${vi}`, false)
      one(`${ALL} ${ALL} ${vi}`, false)
      // Biggest-first weight, from the first value. Only used when that is
      // what the spec asked for.
      if (vi === 0 && spec.sort === 'value') {
        const n = num(r[i])
        if (n !== null) rowSort.set(rk, (rowSort.get(rk) ?? 0) + Math.abs(n))
      }
    })
  }

  const read = (k: string, agg: Agg): number | null => {
    const b = bags.get(k)
    if (!b) return null
    switch (agg) {
      case 'count': return b.n
      case 'countd': return b.seen.size
      case 'sum': return b.n ? b.sum : null
      case 'avg': return b.n ? b.sum / b.n : null
      case 'min': return b.n ? b.min : null
      case 'max': return b.n ? b.max : null
      case 'as-is': return b.last
    }
  }

  const agg = (v: number) => spec.values[v]?.agg ?? 'sum'
  return order(spec, tab.columns, {
    rowSeen, colSeen, rowSort, rowBy,
    cell: (r, c, v) => read(`${r} ${c || ALL} ${v}`, agg(v)),
    rowTotal: (r, v) => read(`${r} ${ALL} ${v}`, agg(v)),
    colTotal: (c, v) => read(`${ALL} ${c || ALL} ${v}`, agg(v)),
    grand: (v) => read(`${ALL} ${ALL} ${v}`, agg(v)),
    kept: rows.length,
    collided,
  })
}

/** What the two producers hand over: the keys they saw and how to read a cell. */
type Parts = {
  rowSeen: Set<string>
  colSeen: Set<string>
  /** Biggest-first weight per row key, for sort: 'value'. */
  rowSort: Map<string, number>
  /** The sort column's value per row key, for sort: 'by'. */
  rowBy: Map<string, number>
  cell: (r: string, c: string, v: number) => number | null
  rowTotal: (r: string, v: number) => number | null
  colTotal: (c: string, v: number) => number | null
  grand: (v: number) => number | null
  kept: number
  collided: number
}

/**
 * Ordering, the window and the roll-up — written once and read by both
 * producers.
 *
 * The arithmetic can live in two places because it is checkable: the same
 * spec over the same rows has one right answer, and a test can hold the two
 * against each other. The ORDER of a text axis cannot be checked that way, it
 * is a decision, so it is made here and only here.
 */
function order(spec: Spec, cols: Col[], p: Parts): Pivot {
  const at = (label: string) => cols.findIndex((c) => c.key === label || c.label === label)
  const typeOf = (q?: Placed) => {
    if (!q) return undefined
    const i = at(q.field)
    return i < 0 ? undefined : cols[i].type
  }
  const rowGrain = spec.rows[0]?.grain
  const colGrain = spec.columns[0]?.grain
  const rowType = spec.rows.length === 1 ? typeOf(spec.rows[0]) : undefined
  const colType = spec.columns.length === 1 ? typeOf(spec.columns[0]) : undefined

  const sorted = (keys: Set<string>, type: FieldType | undefined, grain: Grain | undefined,
                  axis?: 'row') => {
    const ks = [...keys].filter((k) => k !== ALL)
    // A date and a number order themselves, whatever anybody asked for: there
    // is no reading of "A to Z" that puts October before June.
    if (grain || type === 'date') return ks.sort()
    if (type === 'number') return ks.sort((a, b) => Number(a) - Number(b))
    if (axis !== 'row' || spec.sort === 'label') return ks.sort((a, b) => a.localeCompare(b))
    if (spec.sort === 'by') {
      // A key the sort column says nothing about goes last rather than first:
      // an unranked row is not rank zero.
      const by = (k: string) => p.rowBy.get(k) ?? Number.POSITIVE_INFINITY
      return ks.sort((a, b) => by(a) - by(b) || a.localeCompare(b))
    }
    return ks.sort((a, b) => (p.rowSort.get(b) ?? 0) - (p.rowSort.get(a) ?? 0) || a.localeCompare(b))
  }

  let rowKeys = sorted(p.rowSeen, rowType, rowGrain, 'row')
  const colKeys = sorted(p.colSeen, colType, colGrain)
  const matched = rowKeys.length
  let rolled: string[] = []
  // The most recent this many, which on a date axis is the end of it and on
  // anything else is the head of whatever order was asked for -- taking the
  // TAIL of "biggest first" would be a window on the small ones, which is not
  // what anybody means.
  if (spec.points && rowKeys.length > spec.points) {
    const dated = Boolean(rowGrain) || rowType === 'date'
    const keep = dated ? rowKeys.slice(-spec.points) : rowKeys.slice(0, spec.points)
    rolled = rowKeys.filter((k) => !keep.includes(k))
    rowKeys = keep
  }

  return finish({
    rowKeys, colKeys, rolled, spec, values: spec.values, rowGrain, colGrain,
    cell: p.cell, rowTotal: p.rowTotal, colTotal: p.colTotal, grand: p.grand,
    kept: p.kept, matched, collided: p.collided,
  })
}

/**
 * The last step both producers share: roll up what the window cut, if the
 * spec asked and the arithmetic allows.
 *
 * Adding up what was cut only means something when the values are sums and
 * counts. An average of averages is not an average and a distinct count of
 * distinct counts is not one either, so Others is simply not offered there --
 * rather than offered and quietly wrong, which is the version of this feature
 * every spreadsheet ships.
 */
function finish(p: Omit<Pivot, 'rowKeys'> & { rowKeys: string[]; rolled: string[]; spec: Spec }): Pivot {
  const { rolled, spec, ...rest } = p
  const can = spec.other && rolled.length > 0 && canRollUp(spec)
  if (!can) return { ...rest, rowKeys: p.rowKeys }

  const add = (get: (k: string, v: number) => number | null, v: number) =>
    rolled.reduce<number | null>((n, k) => {
      const x = get(k, v)
      return x === null ? n : (n ?? 0) + x
    }, null)

  return {
    ...rest,
    rowKeys: [...p.rowKeys, OTHERS_KEY],
    cell: (r, c, v) => (r === OTHERS_KEY ? add((k, i) => p.cell(k, c, i), v) : p.cell(r, c, v)),
    rowTotal: (r, v) => (r === OTHERS_KEY ? add(p.rowTotal, v) : p.rowTotal(r, v)),
  }
}

/** The filters a reader gets to answer, with where they sit in the spec. */
export const asked = (s: Spec) =>
  s.filters.map((f, i) => ({ f, i })).filter((x) => x.f.ask === true)

/** What a value chip is called where it is read. */
export const valueWord = (v: Value) =>
  v.agg === 'as-is' ? v.field : `${AGG_WORD[v.agg]} of ${v.field}`

// ------------------------------------------------- the same shape, from SQL

/** One cell of hopper.pivot()'s answer. */
export type LongRow = {
  row_key: string
  col_key: string
  v_idx: number
  val: number | string | null
  /** How many numbers landed here. Only 'as-is' can collide. */
  hits: number
  /** How many source rows landed here, whatever they held. This is what makes
   *  a key that exists but holds nothing different from a key that does not. */
  rows_in: number
}

/**
 * The database's answer, assembled into the same Pivot object the browser
 * builds.
 *
 * This is the whole reason hopper.pivot() returns the long form rather than a
 * grid: every renderer, every ordering rule, the Others roll-up and the window
 * are written once and read both answers. Two pivots that could disagree about
 * the ORDER of a text axis would be two pivots, whatever they agreed about the
 * numbers.
 *
 * Every group the database saw comes back, including one whose every value is
 * null -- so a key that exists and holds nothing stays a different fact from a
 * key that does not exist, and the table can draw a dash.
 */
/** How many column keys one plot can color. Past three, a color can no longer
 *  say which is which -- only the first three separate for every kind of color
 *  vision. */
export const COLOR_CAP = 3

/**
 * Which column keys get drawn, and in which order.
 *
 * On a date axis the interesting three are the most recent three. On a category
 * axis the keys are already biggest-first, so the interesting three are the
 * first. Shared, because a card and the report it links to drawing a different
 * three would be two pictures of one report -- and a card is supposed to be the
 * small version of the thing you get when you click it.
 */
export function drawnCols(p: Pivot, spec: Spec, cols: Col[]): string[] {
  const at = (label: string) => cols.find((c) => c.key === label || c.label === label)
  const dated = Boolean(p.colGrain) || at(spec.columns[0]?.field ?? '')?.type === 'date'
  return p.colKeys.length > COLOR_CAP
    ? (dated ? p.colKeys.slice(-COLOR_CAP) : p.colKeys.slice(0, COLOR_CAP))
    : p.colKeys
}

export function fromLong(long: LongRow[], spec: Spec, cols: Col[]): Pivot {
  const at = new Map<string, number | null>()
  const hit = new Map<string, number>()
  const rowSeen = new Set<string>()
  const colSeen = new Set<string>()
  const rowSort = new Map<string, number>()
  const rowBy = new Map<string, number>()
  // The sort column rides along as one extra value chip the renderers never
  // see; the route appends it, so its index is always the one past the end.
  const byIdx = spec.sort === 'by' && spec.sortBy ? spec.values.length : -1
  let kept = 0

  for (const r of long) {
    const v = r.val === null ? null : Number(r.val)
    at.set(`${r.row_key} ${r.col_key} ${r.v_idx}`, v)
    hit.set(`${r.row_key} ${r.col_key} ${r.v_idx}`, Number(r.hits) || 0)
    // Every key the database saw, whether or not it held a number. A margin
    // row comes back for a key whose every value is null, which is how the
    // table knows to draw a dash rather than leave the row out.
    if (r.row_key !== ALL) rowSeen.add(r.row_key)
    if (r.col_key !== ALL) colSeen.add(r.col_key)
    if (r.row_key === ALL && r.col_key === ALL) kept = Number(r.rows_in) || 0
    if (r.col_key === ALL && r.row_key !== ALL) {
      if (r.v_idx === 0 && v !== null) rowSort.set(r.row_key, Math.abs(v))
      if (r.v_idx === byIdx && v !== null) rowBy.set(r.row_key, v)
    }
  }

  const read = (k: string) => at.get(k) ?? null
  return order(spec, cols, {
    rowSeen, colSeen, rowSort, rowBy,
    cell: (r, c, v) => read(`${r} ${c || ALL} ${v}`),
    rowTotal: (r, v) => read(`${r} ${ALL} ${v}`),
    colTotal: (c, v) => read(`${ALL} ${c || ALL} ${v}`),
    grand: (v) => read(`${ALL} ${ALL} ${v}`),
    kept,
    // Only 'as-is' can collide, and only in the cell itself.
    collided: spec.values.reduce((n, v, vi) => v.agg !== 'as-is' ? n : n + [...rowSeen]
      .reduce((m, r) => m + [...colSeen, ALL]
        .reduce((q, c) => q + Math.max(0, (hit.get(`${r} ${c} ${vi}`) ?? 0) - 1), 0), 0), 0),
  })
}
