import type { GateRow, Takeoff, Spec, Recipe } from '@/lib/takeoff'
import { totalOf, type Leg } from '@/lib/legs'
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
  /** Which gate type this line is, on a gate line, and null on every other.
   *  Carried so the frozen quote can be rolled up into charge codes later:
   *  the charge code hangs off the gate TYPE, and two types share one rate. */
  typeCode: string | null
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
        note: 'No line in the rate book', gap: true, typeCode: null,
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
      note: r.note, gap: sell == null, typeCode: null,
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
        typeCode: g.type_code,
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
      note: null, gap: sell == null, typeCode: g.type_code,
    })
  }

  /* A SPEC THE BOOK HAS NO RULE OF ITS OWN FOR IS A HOLE, not a cheap fence.
     Found by lib/price.check.ts pricing an 8-foot leg whose spec had no fabric
     rule: the leg came back CHEAPER than the 6-foot one, silently, because a
     recipe with no matching row raises nothing at all — the gap rule only fires
     on a row naming a rate the book does not have. There is a difference
     between "the book cannot price this line" and "the book has no line for
     this at all", and the second was invisible.

     The test is narrow on purpose. When the recipe has SPEC-SCOPED rules in
     this class — which is where fabric lives, since fabric is the one thing
     that depends on which fence it is — and this spec is in none of them, the
     spec is not in the book. A recipe with no spec-scoped rules at all is a
     class priced entirely by class rules, which is fine and says nothing. */
  const scoped = recipe.filter((r) => r.spec_code)
  if (t.fenceFt > 0 && spec && scoped.length
      && !scoped.some((r) => r.spec_code === spec.code)) {
    gaps.push(spec.code)
    lines.push({
      code: spec.code, name: spec.name_en, uom: 'ft', per: 'foot',
      qty: round2(t.fenceFt), sell: null, cost: null, extended: null, extendedCost: null,
      note: 'The recipe has no rule written for this spec', gap: true, typeCode: null,
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

/* ==========================================================================
   THE SAME ARITHMETIC, ONE LEG AT A TIME.

   Ryan, 14 Sep: a side sometimes needs to be taller than the rest, and he wants
   to see the cost per side. Both need the same thing — the pricer run against a
   leg rather than a job, with that leg's own spec deciding its post spacing and
   what its fabric costs.

   IT CALLS priceIt PER LEG RATHER THAN REPLACING IT. The rules did not change:
   the recipe still decides what a foot of fence is made of, a line the book
   cannot price is still a gap with a name, and cost is still never inferred
   from sell. What changed is how many times the question is asked. Keeping the
   original function untouched is also what keeps lib/price.check.ts meaningful
   — it still proves the figure it always proved.

   THE MERGED LIST IS FOR EVERYTHING DOWNSTREAM. The bill, the handoff and the
   crew ticket want one line per rate code, not four; the screen and the
   customer's estimate want them per leg. So both come back, and neither is
   derived from the other at the call site where it would be got wrong.
   ========================================================================== */

export type LegPrice = {
  legId: string
  label: string
  specCode: string | null
  specName: string | null
  /** True only where this leg overrode the job. What earns it a line in front
   *  of a customer, and a mark on the screen. */
  overrides: boolean
  planFt: number
  fenceFt: number
  gates: { name: string; qty: number }[]
  lines: PriceLine[]
  sell: number
  cost: number | null
  perFoot: number | null
}

export type PricedLegs = Priced & { legs: LegPrice[] }

/** One leg's quantities, in the shape priceIt already reads. */
function takeoffOf(l: Leg): Takeoff {
  return {
    planFt: l.planFt, slopeFt: l.slopeFt, openingFt: l.openingFt, fenceFt: l.fenceFt,
    linePosts: l.linePosts, terminalPosts: l.terminalPosts, cornerPosts: l.cornerPosts,
    runs: [{
      id: l.id, label: l.label, planFt: l.planFt, slopeFt: l.slopeFt,
      corners: l.cornerPosts, drawn: true, closed: false,
    }],
  }
}

export function priceLegs(o: {
  legs: Leg[]
  recipe: Recipe[]
  rates: Rate[]
  wastePct: number
  seesCost: boolean
}): PricedLegs {
  /* A `per: job` RULE IS PRICED ONCE, FOR THE JOB. The auger truck is one truck
     however many sides a property has, and the first version of this charged it
     four times — $1,428 of invented equipment on a four-sided lot, caught by
     lib/price.check.ts comparing leg-by-leg against the same job priced whole.
     That comparison is the only reason it was caught, which is why it is a
     check and not a comment. */
  const perLeg = o.recipe.filter((r) => r.per !== 'job')
  const perJob = o.recipe.filter((r) => r.per === 'job')

  const priced: LegPrice[] = o.legs.map((l) => {
    const p = priceIt({
      takeoff: takeoffOf(l), gates: l.gates, spec: l.spec,
      recipe: perLeg, rates: o.rates, wastePct: o.wastePct, seesCost: o.seesCost,
    })
    return {
      legId: l.id, label: l.label,
      specCode: l.spec?.code ?? null, specName: l.spec?.name_en ?? null,
      overrides: l.overrides,
      planFt: round2(l.planFt), fenceFt: round2(l.fenceFt),
      gates: l.gates.map((g) => ({ name: g.name ?? g.type_code ?? 'Gate', qty: g.qty })),
      lines: p.lines, sell: p.sell, cost: p.cost, perFoot: p.perFoot,
    }
  })

  /* One line per rate code across every leg. A gate line keeps its type code so
     the charge code can still hang off the gate TYPE at handoff — two types
     sharing one rate must not merge into one bill line. */
  const merged = new Map<string, PriceLine>()
  for (const leg of priced) {
    for (const l of leg.lines) {
      const key = `${l.code}|${l.per}|${l.typeCode ?? ''}`
      const had = merged.get(key)
      if (!had) { merged.set(key, { ...l }); continue }
      had.qty = round2(had.qty + l.qty)
      had.extended = had.extended == null || l.extended == null
        ? null : round2(had.extended + l.extended)
      had.extendedCost = had.extendedCost == null || l.extendedCost == null
        ? null : round2(had.extendedCost + l.extendedCost)
      had.gap = had.gap || l.gap
    }
  }
  /* And the job-level rules, once, against the spec the JOB carries — which is
     the spec of whichever leg did not override, since a job-level rule belongs
     to the job rather than to any side of it. */
  const jobSpec = o.legs.find((l) => !l.overrides)?.spec ?? o.legs[0]?.spec ?? null
  const once = perJob.length
    ? priceIt({
        takeoff: totalOf(o.legs), gates: [], spec: jobSpec,
        recipe: perJob, rates: o.rates, wastePct: o.wastePct, seesCost: o.seesCost,
      })
    : null

  const lines = [...merged.values(), ...(once?.lines ?? [])]

  const sell = round2(priced.reduce((s, p) => s + p.sell, 0) + (once?.sell ?? 0))
  // One unreadable cost makes the whole cost unreadable, on a leg exactly as on
  // a job: a total that silently leaves a line out is worse than no total.
  const costKnown = o.seesCost && priced.every((p) => p.cost != null)
    && (once == null || once.cost != null)
  const cost = costKnown
    ? round2(priced.reduce((s, p) => s + (p.cost ?? 0), 0) + (once?.cost ?? 0)) : null
  const fenceFt = o.legs.reduce((s, l) => s + l.fenceFt, 0)
  const gaps = [...new Set([
    ...priced.flatMap((p) => p.lines.filter((l) => l.gap).map((l) => l.code)),
    ...(once?.gaps ?? []),
  ])]

  return {
    legs: priced,
    lines,
    sell,
    cost,
    margin: cost != null && sell > 0 ? Math.round(((sell - cost) / sell) * 1000) / 10 : null,
    perFoot: fenceFt > 0 ? round2(sell / fenceFt) : null,
    gaps,
    whole: gaps.length === 0 && sell > 0,
  }
}
