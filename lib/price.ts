import type { GateRow, Takeoff, Spec, Recipe } from '@/lib/takeoff'
import type { Rate } from '@/lib/fence'

/**
 * What the measure comes to.
 *
 * The pricer walks the recipe — the trade rules in `hopper.fence_recipe` — and
 * multiplies each rule's quantity by the thing it is counted against. Nothing in
 * this file decides what a foot of fence is made of; that is a table, managed on
 * a screen, for the same reason the rate book is.
 *
 * Two rules it does not bend:
 *
 * A LINE THE BOOK CANNOT PRICE IS A GAP, NOT A ZERO. A recipe row naming a rate
 * that does not exist, or a gate with no rate behind it, comes back as a gap with
 * a name. A missing figure quietly treated as nought is how a quote goes out
 * under cost, and it is invisible in the total.
 *
 * There is no `server-only` here and no database client: this file is pure
 * arithmetic over values somebody else fetched, which is what lets it be run
 * against fixtures and checked line by line. Loading lives in lib/takeoff.ts.
 *
 * COST IS NOT INFERRED FROM SELL. `cost` is null for a person who may not read
 * costs, so every cost figure here is null too — and so is the margin. It is not
 * computed from the markup, because a margin the database refused to show you is
 * not a margin you may work out from what it did show you.
 */

export type PriceLine = {
  code: string
  name: string
  uom: string
  per: string
  /** How many, after waste where the rule says waste applies. */
  qty: number
  sell: number | null
  cost: number | null
  extended: number | null
  extendedCost: number | null
  note: string | null
  /** The book has no line for this, so it measures and does not price. */
  gap: boolean
}

export type Priced = {
  lines: PriceLine[]
  sell: number
  cost: number | null
  margin: number | null
  perFoot: number | null
  gaps: string[]
  /** True when the whole job priced with nothing missing. */
  whole: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** How many of a thing the takeoff holds, for each `per` the recipe can name. */
function countOf(per: string, t: Takeoff, gates: GateRow[]): number {
  switch (per) {
    case 'foot': return t.fenceFt
    case 'line_post': return t.linePosts
    case 'terminal_post': return t.terminalPosts
    case 'corner_post': return t.cornerPosts
    case 'gate': return gates.reduce((s, g) => s + g.qty, 0)
    case 'job': return 1
    default: return 0
  }
}

export function priceIt(o: {
  takeoff: Takeoff
  gates: GateRow[]
  spec: Spec | null
  recipe: Recipe[]
  rates: Rate[]
  wastePct: number
  seesCost: boolean
}): Priced {
  const { takeoff: t, gates, spec, recipe, rates, wastePct, seesCost } = o
  const book = new Map(rates.map((r) => [r.code, r]))
  const lines: PriceLine[] = []
  const gaps: string[] = []

  const rows = recipe
    .filter((r) => r.cls === (spec?.cls ?? 'permanent'))
    // A rule written against a spec applies to that spec only; one written
    // against the class applies to every spec in it.
    .filter((r) => !r.spec_code || r.spec_code === spec?.code)
    .sort((a, b) => a.sort - b.sort)

  for (const r of rows) {
    const n = countOf(r.per, t, gates)
    if (n <= 0) continue
    const qty = n * Number(r.qty) * (r.waste ? 1 + wastePct / 100 : 1)
    const rate = book.get(r.rate_code)

    if (!rate) {
      gaps.push(r.rate_code)
      lines.push({
        code: r.rate_code, name: r.rate_code, uom: '', per: r.per,
        qty: round2(qty), sell: null, cost: null, extended: null, extendedCost: null,
        note: 'No line in the rate book', gap: true,
      })
      continue
    }

    const sell = rate.sell == null ? null : Number(rate.sell)
    const cost = seesCost && rate.cost != null ? Number(rate.cost) : null
    lines.push({
      code: rate.code, name: rate.name_en, uom: rate.uom, per: r.per,
      qty: round2(qty),
      sell, cost,
      extended: sell == null ? null : round2(qty * sell),
      extendedCost: cost == null ? null : round2(qty * cost),
      note: r.note, gap: sell == null,
    })
    if (sell == null) gaps.push(rate.code)
  }

  // The gates themselves, priced off whatever the catalog points at. They are not
  // recipe rows because the quantity is a decision somebody made on the screen
  // rather than a rule about a foot of fence.
  for (const g of gates) {
    if (!g.qty) continue
    const rate = g.rate_code ? book.get(g.rate_code) : undefined
    if (!rate) {
      gaps.push(g.name ?? g.type_code ?? 'a gate')
      lines.push({
        code: g.rate_code ?? g.type_code ?? '—', name: g.name ?? 'Gate', uom: 'ea',
        per: 'gate', qty: g.qty, sell: null, cost: null, extended: null,
        extendedCost: null, note: 'No line in the rate book', gap: true,
      })
      continue
    }
    const sell = rate.sell == null ? null : Number(rate.sell)
    const cost = seesCost && rate.cost != null ? Number(rate.cost) : null
    lines.push({
      code: rate.code, name: g.name ?? rate.name_en, uom: rate.uom, per: 'gate',
      qty: g.qty, sell, cost,
      extended: sell == null ? null : round2(g.qty * sell),
      extendedCost: cost == null ? null : round2(g.qty * cost),
      note: null, gap: sell == null,
    })
  }

  const sell = round2(lines.reduce((s, l) => s + (l.extended ?? 0), 0))
  // One unreadable cost makes the whole cost unreadable. A total that silently
  // leaves a line out is worse than no total.
  const costKnown = seesCost && lines.every((l) => l.gap || l.extendedCost != null)
  const cost = costKnown
    ? round2(lines.reduce((s, l) => s + (l.extendedCost ?? 0), 0)) : null

  return {
    lines, sell, cost,
    margin: cost != null && sell > 0 ? Math.round(((sell - cost) / sell) * 1000) / 10 : null,
    perFoot: t.fenceFt > 0 ? round2(sell / t.fenceFt) : null,
    gaps: [...new Set(gaps)],
    whole: gaps.length === 0 && sell > 0,
  }
}
