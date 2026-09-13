import type { Job, Location, Task } from '@/lib/fence'

/* ==========================================================================
   THE BILLING HANDOFF

   PURE, ON PURPOSE. Nothing in this file touches a database, for the same reason
   lib/price.ts does not: these are the figures that leave the building, and
   arithmetic that can be run against fixtures is arithmetic that can be checked
   line by line. Loading lives in lib/billing.ts. See lib/handoff.check.ts.

   Fence Builder does not invoice. It writes accounting one message laid out to
   be keyed from, with the whole job attached — and everything in this file
   exists to make that message DERIVED rather than retyped.

   Two rules run through it.

   THE SHEET TOTALS TO WHAT WAS SOLD. Every charge line comes out of the sold
   option's frozen takeoff, and the arithmetic is a roll-up, never a re-price:
   the gates that bill on their own line come off the top and the rest is one
   install line. If the total ever disagrees with the sold price, the screen says
   so loudly rather than quietly billing whichever number it likes better. A
   billing sheet that has drifted from the quote is the one bug in this module
   that costs real money.

   A LINE THAT CANNOT BE KEYED IS A GAP, NOT A GUESS. The same rule as the rate
   book. A class with no charge rule, a code that is not in the book, a gate type
   pointing at nothing — each comes back named, and the release gate refuses to
   let the job go until somebody has fixed it. The seeded codes are provisional
   because Navusoft publishes no import schema, and provisional codes that pass
   for confirmed are how a month of billing gets rejected at once.
   ========================================================================== */

export type ChargeRule = {
  cls: string; takes: 'fence' | 'gate'; charge_code: string
  note: string | null; active: boolean
}

export type ChargeCode = {
  code: string; description: string; recurring: boolean
  cycle_days: number | null; provisional: boolean; sort: number
}

/** The sold quote. One per job, enforced by a partial unique index (0133). */
export type Sold = {
  id: string; label: string; price: number; spec_code: string | null
  priced_at: string | null; note: string | null
  takeoff: any
  belowFloor: boolean
  released: boolean
}

export type SheetLine = {
  /** The saved row, when this line has been written down. Null while derived. */
  id: string | null
  code: string
  description: string
  qty: number | null
  uom: string | null
  amount: number | null
  recurring: boolean
  cycleDays: number | null
  note: string | null
  /** Somebody changed this line by hand, so a rebuild leaves it alone. */
  edited: boolean
  /** Added by the biller rather than derived from the quote. */
  byHand: boolean
  /** The book cannot key this: no rule, or a code that is not in it. */
  gap: string | null
  sort: number
}

export type Sheet = {
  lines: SheetLine[]
  total: number
  /** What the customer bought, for the total to be checked against. */
  sold: number
  /** Whether those two agree to the cent. */
  tallies: boolean
  gaps: string[]
  recurring: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The sheet, rolled up out of the sold quote.
 *
 * Gates first, because they are the lines that come OFF the install: a gate that
 * bills on its own line must not also be inside the foot rate, and the only way
 * to be sure of that is to take it out here rather than to add it there.
 *
 * A gate bills on its own line when its type names a charge code, or when the
 * class has a gate rule to fall back on. Neither is an accident: a temporary
 * fence rental includes its panel gates, and a class with no gate rule is saying
 * exactly that.
 */
export function buildSheet(o: {
  sold: Sold
  cls: string
  rules: ChargeRule[]
  codes: ChargeCode[]
  gateTypes: { code: string; charge_code: string | null; name_en: string }[]
}): Sheet {
  const { sold, cls, rules, codes, gateTypes } = o
  const book = new Map(codes.map((c) => [c.code, c]))
  const byType = new Map(gateTypes.map((g) => [g.code, g.charge_code]))
  const rule = (takes: 'fence' | 'gate') =>
    rules.find((r) => r.cls === cls && r.takes === takes && r.active) ?? null

  const fenceRule = rule('fence')
  const gateRule = rule('gate')
  const frozen: any[] = Array.isArray(sold.takeoff?.lines) ? sold.takeoff.lines : []
  const fenceFt = Number(sold.takeoff?.measure?.fence_ft ?? 0) || null

  const lines: SheetLine[] = []
  const gaps: string[] = []
  let intoFence = 0

  const decorate = (code: string, base: Omit<SheetLine, 'recurring' | 'cycleDays' | 'gap' | 'sort'>)
  : SheetLine => {
    const c = book.get(code)
    if (!c) gaps.push(code)
    return {
      ...base,
      recurring: c?.recurring ?? false,
      cycleDays: c?.cycle_days ?? null,
      gap: c ? null : `${code} is not in the charge code book`,
      sort: c?.sort ?? 900,
    }
  }

  for (const l of frozen) {
    if (l.per === 'gate') {
      const code = (l.type_code ? byType.get(l.type_code) : null) ?? gateRule?.charge_code ?? null
      if (code) {
        lines.push(decorate(code, {
          id: null, code,
          description: String(l.name ?? 'Gate'),
          qty: Number(l.qty) || 0, uom: 'ea',
          amount: l.extended == null ? null : round2(Number(l.extended)),
          note: null, edited: false, byHand: false,
        }))
        continue
      }
    }
    intoFence += Number(l.extended ?? 0)
  }

  if (!fenceRule) {
    gaps.push(`no install code for a ${cls} job`)
    lines.unshift({
      id: null, code: '—',
      description: `Everything except the gates — ${cls} work`,
      qty: fenceFt, uom: 'ft', amount: round2(intoFence),
      recurring: false, cycleDays: null, note: null, edited: false, byHand: false,
      gap: `A ${cls} job has no charge rule, so this cannot be keyed`,
      sort: -1,
    })
  } else {
    lines.unshift(decorate(fenceRule.charge_code, {
      id: null, code: fenceRule.charge_code,
      description: book.get(fenceRule.charge_code)?.description
        ?? `Everything except the gates — ${cls} work`,
      qty: fenceFt, uom: 'ft', amount: round2(intoFence),
      note: null, edited: false, byHand: false,
    }))
  }

  lines.sort((a, b) => a.sort - b.sort)
  const total = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0))

  return {
    lines, total, sold: round2(Number(sold.price) || 0),
    tallies: Math.abs(total - (Number(sold.price) || 0)) < 0.01,
    gaps: [...new Set(gaps)],
    recurring: lines.some((l) => l.recurring),
  }
}

/**
 * Lines as they stand: what has been written down, or what would be.
 *
 * A saved line wins over its derived twin, because the biller's correction is
 * the point of letting them correct it. A derived line that was never saved is
 * still shown, so the sheet reads the same before and after it is built — the
 * button writes down what you were already looking at.
 */
export function mergeSheet(derived: Sheet, saved: SheetLine[]): Sheet {
  if (saved.length === 0) return derived
  const total = round2(saved.reduce((s, l) => s + (l.amount ?? 0), 0))
  const gaps = saved.filter((l) => l.gap).map((l) => l.gap as string)
  return {
    lines: [...saved].sort((a, b) => a.sort - b.sort),
    total,
    sold: derived.sold,
    tallies: Math.abs(total - derived.sold) < 0.01,
    gaps: [...new Set([...derived.gaps, ...gaps])],
    recurring: saved.some((l) => l.recurring),
  }
}

/* ==========================================================================
   THE RELEASE GATE

   Nothing releases while a change order is unpriced or a punch item is open.
   Said as a list rather than a boolean, because "not ready" is useless and
   "close-out has three steps open and the location has no account number" is
   a morning's work somebody can go and do.
   ========================================================================== */

export type Blocker = { what: string; why: string; where?: string }

export function whatBlocks(o: {
  sold: Sold | null
  place: Location | null
  tasks: Task[]
  sheet: Sheet | null
  openRevisions: number
  jobId: string
}): Blocker[] {
  const { sold, place, tasks, sheet, openRevisions, jobId } = o
  const out: Blocker[] = []

  if (!sold) {
    out.push({
      what: 'No quote is marked sold',
      why: 'There is nothing to bill until somebody says which option the customer bought.',
      where: `/fence/${jobId}/estimate`,
    })
  } else if (sold.belowFloor && !sold.released) {
    out.push({
      what: 'The sold quote is under the margin floor and was never released',
      why: 'It went out thin. Billing it would make the release a formality nobody performed.',
      where: `/fence/${jobId}/estimate`,
    })
  }

  if (openRevisions > 0) {
    out.push({
      what: openRevisions === 1 ? 'A change order is unpriced' : `${openRevisions} change orders are unpriced`,
      why: 'The site said otherwise and the new price has not been worked out. Billing the old one bills work nobody agreed to.',
      where: `/fence/${jobId}/estimate`,
    })
  }

  if (!String(place?.navusoft_account ?? '').trim()) {
    out.push({
      what: 'The service location has no Navusoft account number',
      why: 'Accounting keys against the account, and the account belongs to the address.',
      where: `/fence/${jobId}`,
    })
  }

  const open = (section: string) => tasks.filter((t) => t.section === section && !t.done).length
  const ticket = open('ticket')
  const closeout = open('closeout')
  if (ticket > 0) {
    out.push({
      what: ticket === 1 ? 'The crew ticket has a step open' : `The crew ticket has ${ticket} steps open`,
      why: 'The work is not finished, so what it comes to is not settled.',
      where: `/fence/${jobId}`,
    })
  }
  if (closeout > 0) {
    out.push({
      what: closeout === 1 ? 'Close-out has a step open' : `Close-out has ${closeout} steps open`,
      why: 'A punch item open is work still owed. It bills after it is done, not before.',
      where: `/fence/${jobId}`,
    })
  }

  if (sheet) {
    const unkeyable = sheet.lines.filter((l) => l.gap).length
    const unpriced = sheet.lines.filter((l) => l.amount == null).length
    if (unkeyable > 0) {
      out.push({
        what: unkeyable === 1 ? 'A line has no charge code' : `${unkeyable} lines have no charge code`,
        why: 'Nobody can key a line the book does not name.',
        where: '/admin/fence?s=billing',
      })
    }
    if (unpriced > 0) {
      out.push({
        what: unpriced === 1 ? 'A line has no amount' : `${unpriced} lines have no amount`,
        why: 'A blank amount is not nothing; it is a figure that was never worked out.',
      })
    }
    if (!sheet.tallies) {
      out.push({
        what: 'The sheet does not add up to what was sold',
        why: `The lines come to $${sheet.total.toLocaleString('en-US')} and the quote was`
          + ` $${sheet.sold.toLocaleString('en-US')}. One of the two is wrong and it is not safe to guess which.`,
      })
    }
  }

  return out
}

/**
 * Who carried the job. There is no project_manager column, and inventing one
 * would be a second answer to a question the task list already answers: the
 * person who ticked the first survey step is the person who picked it up.
 */
export function whoCarriedIt(tasks: Task[], names: Map<string, string>): string | null {
  const first = tasks
    .filter((t) => t.done && t.done_by && ['survey', 'schedule', 'sow'].includes(t.section))
    .sort((a, b) => String(a.done_at ?? '').localeCompare(String(b.done_at ?? '')))[0]
  return first?.done_by ? names.get(first.done_by) ?? null : null
}

/** When the work was finished: the last crew or close-out step ticked. */
export function finishedOn(tasks: Task[]): string | null {
  const done = tasks
    .filter((t) => t.done && ['ticket', 'closeout'].includes(t.section) && t.done_at)
    .map((t) => String(t.done_at))
    .sort()
  return done.length ? done[done.length - 1] : null
}

/**
 * The message, as plain text somebody pastes into Outlook.
 *
 * Not HTML and not a mail template, for the reason lib/invite-mail.ts gives at
 * length: mail written by an app gets eaten by corporate filters and the person
 * waiting never learns there was anything to wait for. Accounting also has no
 * Hopper account, so a link would be a door they cannot open. So Hopper lays the
 * message out and a person sends it with their own hands, which is also why the
 * handoff is RECORDED as a separate act from composing it.
 */
export function keyingMessage(o: {
  job: Job; place: Location | null; sheet: Sheet; sold: Sold | null
  navusoft: string | null; pm: string | null; finished: string | null
  note: string | null; instructions: string | null; origin: string
}): { subject: string; body: string } {
  const { job, place, sheet, navusoft, pm, finished, note, instructions, origin } = o
  const money = (n: number | null) =>
    n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const where = place
    ? [place.line1, place.line2, [place.city, place.region].filter(Boolean).join(', '), place.postcode]
        .filter(Boolean).join(', ')
    : job.site_address ?? '—'

  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
  const table = [
    `${pad('CODE', 10)}${pad('DESCRIPTION', 40)}${pad('QTY', 12)}AMOUNT`,
    '-'.repeat(74),
    ...sheet.lines.map((l) =>
      pad(l.code, 10) + pad(l.description.slice(0, 38), 40)
      + pad(l.qty == null ? '—' : `${l.qty.toLocaleString('en-US')} ${l.uom ?? ''}`.trim(), 12)
      + money(l.amount)),
    '-'.repeat(74),
    pad('', 62) + money(sheet.total),
  ].join('\n')

  const body = [
    `${job.ref} — ${job.name} is complete and ready to key.`,
    '',
    'KEY THIS IN',
    `  Navusoft account   ${navusoft ?? '— none on file —'}`,
    `  Service location   ${where}`,
    `  Work completed     ${finished ? finished.slice(0, 10) : '—'}`,
    `  Project manager    ${pm ?? '—'}`,
    `  Billing type       ${sheet.recurring ? 'Recurring — bills again every cycle' : 'One time'}`,
    '',
    table,
    '',
    ...(note ? ['NOTE FROM THE PROJECT MANAGER', `  ${note}`, ''] : []),
    ...(instructions ? [instructions, ''] : []),
    `The whole job — the measure, the signed scope of work and the photographs — is at`,
    `${origin}/fence/${job.id}`,
    '',
  ].join('\n')

  return { subject: `${job.ref} · ${job.name} · ready to key`, body }
}
