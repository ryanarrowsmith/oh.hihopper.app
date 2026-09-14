/* ==========================================================================
   THE CUSTOMER'S ESTIMATE.

   Pure arithmetic and plain words over a frozen option, so the same figures
   render on the screen sales sees and on the page the customer signs, and so
   lib/estimate.check.ts can run it without a database.

   THE ROLL-UP IS THE BILLING SHEET'S, NOT A SECOND OPINION. Gates that bill on
   their own line come off the top, everything else is ONE installed line, and
   the lines total to the frozen price to the cent by construction rather than
   by arithmetic that might not. A customer never reads a bill of materials:
   tension bands and tie wire are how we build it, not what they bought.

   NOTHING HERE KNOWS A COST. The frozen takeoff carries quantities and sell;
   cost lives in fence_option_cost behind its own policy, and this file is
   rendered to a person outside the company.
   ========================================================================== */

export type FrozenLine = {
  code: string; name: string; uom: string | null; per: string
  qty: number; sell: number | null; extended: number | null
  gap: boolean; type_code: string | null
}

export type Frozen = {
  priced_on: string | null
  spec: string | null
  cls: string | null
  measure: {
    plan_ft: number; slope_ft: number; opening_ft: number; fence_ft: number
    line_posts: number; terminal_posts: number; corner_posts: number; runs: number
  }
  lines: FrozenLine[]
  sell: number
  per_foot: number | null
}

export type QuoteLine = {
  what: string
  detail: string
  qty: string
  amount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * What the customer reads: the gates by name, then one line for the fence.
 *
 * The fence line is the REMAINDER, never a re-price. Whatever the gates come to
 * is taken off the frozen price and the rest is the installed fence, so the
 * three lines add to the price they were quoted no matter what the rate book
 * did or did not carry that day.
 */
export function quoteLines(f: Frozen, gateName: (code: string) => string): QuoteLine[] {
  const gates = new Map<string, { n: number; amount: number }>()
  for (const l of f.lines) {
    if (!l.type_code) continue
    const had = gates.get(l.type_code) ?? { n: 0, amount: 0 }
    had.n += Number(l.qty ?? 0)
    had.amount += Number(l.extended ?? 0)
    gates.set(l.type_code, had)
  }

  const gateTotal = round2([...gates.values()].reduce((s, g) => s + g.amount, 0))
  const fence = round2(Number(f.sell) - gateTotal)

  const out: QuoteLine[] = [{
    what: `${f.spec ? specWords(f.spec) : 'Fence'}, installed`,
    detail: 'Fabric, rail, posts, concrete and labor',
    qty: `${f.measure.fence_ft.toLocaleString('en-US')} ft`,
    amount: fence,
  }]

  for (const [code, g] of [...gates.entries()].sort((a, b) => b[1].amount - a[1].amount)) {
    out.push({
      what: gateName(code),
      detail: 'Frame, hardware and posts',
      qty: String(g.n),
      amount: round2(g.amount),
    })
  }
  return out
}

/** A spec code said out loud. `CL6` is a six-foot chain link to the book and
 *  nothing at all to a customer. */
export function specWords(code: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(code.trim().toUpperCase())
  if (!m) return code
  const fabric = ({ CL: 'chain link', WP: 'wood privacy', OR: 'ornamental iron',
                    VP: 'vinyl privacy' } as Record<string, string>)[m[1]]
  if (!fabric) return code
  return `${m[2]}′ ${fabric}`
}

/** The five plain lines under "what we'll build". Counts, never a recipe. */
export function whatWeBuild(f: Frozen, gates: { name: string; n: number }[]): {
  label: string; says: string
}[] {
  const m = f.measure
  const posts = m.line_posts + m.terminal_posts + m.corner_posts
  const gateSays = gates.length === 0
    ? 'No gates on this estimate.'
    : gates.map((g) => `${g.n === 1 ? 'One' : g.n} ${g.name.toLowerCase()}${g.n === 1 ? '' : 's'}`)
        .join(' and ') + ', hung, swung and latched.'

  return [
    { label: 'Fence',
      says: `About ${m.fence_ft.toLocaleString('en-US')} feet of `
        + `${f.spec ? specWords(f.spec) : 'fence'}, run to the line we measured.` },
    { label: 'Posts',
      says: `Around ${posts.toLocaleString('en-US')} posts set in concrete — `
        + `${m.line_posts} line, ${m.terminal_posts} terminal and ${m.corner_posts} corner.` },
    { label: 'Gates', says: gateSays },
    { label: 'Grade',
      says: 'The line follows the grade. Where it falls away we step the fabric rather '
        + 'than leave a gap under it.' },
    { label: 'When we leave',
      says: 'Spoil hauled off, the yard raked, and every gate swung and latched with you '
        + 'standing there.' },
  ]
}

export const money = (n: number | null | undefined) =>
  n == null ? '—'
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US',
    { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

/** An estimate is good for this long unless somebody says otherwise. */
export const GOOD_FOR_DAYS = 30

export function goodThrough(from: string | Date, days = GOOD_FOR_DAYS): string {
  const d = typeof from === 'string' ? new Date(from) : from
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
