/**
 * The roll-up, checked against the pricer it rolls up.
 *
 *   npx tsx lib/handoff.check.ts
 *
 * The one bug in this module that costs real money is a billing sheet that has
 * drifted from the quote — so the first and loudest check here is that the sheet
 * TOTALS to what was sold, over the same job lib/price.check.ts prices (1,016 ft
 * of six-foot chain link, 100 line posts, 8 terminal, 3 corner, two gates, 4%
 * waste). The rate figures here are stand-ins rather than the seeded book: what
 * is being checked is that the roll-up cannot disagree with the pricer it rolls
 * up, whatever the pricer said, which is a stronger claim than one total.
 *
 * The rest are the rules that are not arithmetic:
 *  · a gate whose TYPE names a charge code bills on its own line
 *  · a class with no gate rule rolls its gates INTO the fence line, and the total
 *    is the same either way — which is the real test of the roll-up, because a
 *    gate counted twice or dropped is invisible in a per-line reading
 *  · a class with no fence rule is a named gap, not a silent zero
 *  · a hand-corrected line survives, and the tally then follows the correction
 *  · nothing releases while a punch item is open
 */
import { priceIt } from '@/lib/price'
import { buildSheet, mergeSheet, whatBlocks, keyingMessage,
         type Sold, type SheetLine } from '@/lib/handoff'

const say = (what: string, ok: boolean, extra = '') =>
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? ` — ${extra}` : ''}`)

/* The same job lib/price.check.ts prices. -------------------------------- */
const takeoff = { planFt: 1030, slopeFt: 1036, openingFt: 20, fenceFt: 1016,
  linePosts: 100, terminalPosts: 8, cornerPosts: 3, runs: [] } as any
const gates = [
  { id: '1', type_code: 'G-VD-16', rate_code: 'GATE-VD', qty: 1, name: "16' double drive",
    name_es: null, width_ft: 16, priced: true },
  { id: '2', type_code: 'G-WK-4', rate_code: 'GATE-WK', qty: 1, name: "4' walk gate",
    name_es: null, width_ft: 4, priced: true },
]
const spec = { code: 'CL-6-9-3', cls: 'permanent', name_en: "6' chain link", name_es: null,
  height_ft: 6, spacing_ft: 10, note: null }
const R = (cls: string, spec_code: string | null, rate_code: string, per: string,
           qty: number, waste = false, sort = 0) =>
  ({ cls, spec_code, rate_code, per, qty, waste, note: null, sort })
const recipe = [
  R('permanent', 'CL-6-9-3', 'CL-FAB6', 'foot', 1, true, 10),
  R('permanent', null, 'CL-RAIL', 'foot', 1, true, 20),
  R('permanent', null, 'CL-TIE', 'foot', 1.2, false, 30),
  R('permanent', null, 'CL-LP', 'line_post', 1, false, 40),
  R('permanent', null, 'CL-TP', 'terminal_post', 1, false, 50),
  R('permanent', null, 'CL-CP', 'corner_post', 1, false, 60),
  R('permanent', null, 'CONC-80', 'line_post', 2, false, 70),
  R('permanent', null, 'CONC-80', 'terminal_post', 3, false, 80),
  R('permanent', null, 'CONC-80', 'corner_post', 3, false, 90),
  R('permanent', null, 'LAB-INST', 'foot', 0.08, false, 100),
  R('permanent', null, 'EQ-AUGER', 'job', 1, false, 110),
]
const rate = (code: string, sell: number, uom: string, name = code) =>
  ({ id: code, code, kind: 'material', grp: null, cls: null, name_en: name, name_es: null,
     uom, sell, verified_on: null, source: null, active: true, cost: null, markup: null })
const rates = [
  rate('CL-FAB6', 4.1, 'lf', "6' chain link fabric"),
  rate('CL-RAIL', 1.85, 'lf', 'Top rail'),
  rate('CL-TIE', 0.22, 'ea', 'Ties'),
  rate('CL-LP', 14.5, 'ea', 'Line post'),
  rate('CL-TP', 26, 'ea', 'Terminal post'),
  rate('CL-CP', 31, 'ea', 'Corner post'),
  rate('CONC-80', 7.4, 'bag', 'Concrete, 80 lb'),
  rate('LAB-INST', 62, 'hr', 'Install labor'),
  rate('EQ-AUGER', 185, 'day', 'Auger'),
  rate('GATE-VD', 1850, 'ea', 'Vehicle gate'),
  rate('GATE-WK', 420, 'ea', 'Walk gate'),
] as any

const priced = priceIt({ takeoff, gates, spec, recipe: recipe as any, rates,
                         wastePct: 4, seesCost: false })

/* Frozen exactly as putOnQuote freezes it. ------------------------------- */
const sold: Sold = {
  id: 'opt-1', label: "6' chain link · 1,016 ft", price: priced.sell,
  spec_code: 'CL-6-9-3', priced_at: '2026-09-01T00:00:00Z', note: null,
  belowFloor: false, released: false,
  takeoff: {
    spec: 'CL-6-9-3', cls: 'permanent', waste_pct: 4,
    measure: { fence_ft: 1016, plan_ft: 1030, slope_ft: 1036, opening_ft: 20,
               line_posts: 100, terminal_posts: 8, corner_posts: 3, runs: [] },
    lines: priced.lines.map((l) => ({
      code: l.code, name: l.name, uom: l.uom, per: l.per, qty: l.qty,
      sell: l.sell, extended: l.extended, gap: l.gap, type_code: l.typeCode,
    })),
    sell: priced.sell, per_foot: priced.perFoot, gaps: [], below_floor: false,
  },
}

const codes = [
  { code: 'INST-CL', description: 'Chain link install', recurring: false,
    cycle_days: null, provisional: true, sort: 10 },
  { code: 'GATE-VD', description: 'Vehicle gate, supply and hang', recurring: false,
    cycle_days: null, provisional: true, sort: 20 },
  { code: 'GATE-WK', description: 'Walk gate, supply and hang', recurring: false,
    cycle_days: null, provisional: true, sort: 30 },
  { code: 'RENT-TF', description: 'Temporary fence, per 28-day cycle', recurring: true,
    cycle_days: 28, provisional: true, sort: 40 },
]
const gateTypes = [
  { code: 'G-VD-16', charge_code: 'GATE-VD', name_en: "16' double drive" },
  { code: 'G-WK-4', charge_code: 'GATE-WK', name_en: "4' walk gate" },
  { code: 'G-TF-PNL', charge_code: null, name_en: 'Panel gate' },
]
const RULE = (cls: string, takes: 'fence' | 'gate', charge_code: string) =>
  ({ cls, takes, charge_code, note: null, active: true })

/* 1 — it totals to what was sold. --------------------------------------- */
const sheet = buildSheet({
  sold, cls: 'permanent',
  rules: [RULE('permanent', 'fence', 'INST-CL'), RULE('permanent', 'gate', 'GATE-VD')],
  codes, gateTypes,
})
say('the sheet totals to what was sold', sheet.tallies,
    `${sheet.total} billed against ${sheet.sold} sold`)
say('it comes to three lines: the fence and two gates', sheet.lines.length === 3,
    sheet.lines.map((l) => l.code).join(', '))
say('the fence line is billed by the foot',
    sheet.lines[0].code === 'INST-CL' && sheet.lines[0].qty === 1016
      && sheet.lines[0].uom === 'ft')
say('each gate bills under the code its TYPE names, not the one the class falls back to',
    sheet.lines.some((l) => l.code === 'GATE-VD') && sheet.lines.some((l) => l.code === 'GATE-WK'))
say('the gates come OFF the install line rather than being added to it',
    Math.abs((sheet.lines[0].amount ?? 0) - (priced.sell - 1850 - 420)) < 0.01,
    `install ${sheet.lines[0].amount}`)
say('nothing on the sheet is a gap', sheet.gaps.length === 0)
say('a one-time job is not marked recurring', sheet.recurring === false)

/* 2 — no gate rule and no type code: the gates ride inside the fence line.
       The TOTAL has to be identical, which is the only check that catches a
       gate counted twice or dropped. ----------------------------------- */
const noGateTypes = gateTypes.map((g) => ({ ...g, charge_code: null }))
const inside = buildSheet({
  sold, cls: 'permanent', rules: [RULE('permanent', 'fence', 'INST-CL')],
  codes, gateTypes: noGateTypes,
})
say('with no gate rule it is one line', inside.lines.length === 1)
say('and the total is unchanged', inside.tallies && Math.abs(inside.total - sheet.total) < 0.01,
    `${inside.total} vs ${sheet.total}`)

/* 3 — a class with no fence rule is a named gap, not a zero. ------------ */
const secure = buildSheet({ sold, cls: 'secure', rules: [], codes, gateTypes })
say('a class with no install code is a named gap', secure.gaps.length === 1
    && /secure/.test(secure.gaps[0]), secure.gaps.join('; '))
say('the gap line still carries the money rather than swallowing it',
    Math.abs(secure.total - sheet.sold) < 0.01)
say('a code that is not in the book is its own gap',
    buildSheet({ sold, cls: 'permanent', rules: [RULE('permanent', 'fence', 'NOPE')],
                 codes, gateTypes }).gaps.includes('NOPE'))

/* 4 — a recurring code makes the whole sheet recurring. ----------------- */
const rental = buildSheet({
  sold, cls: 'temporary', rules: [RULE('temporary', 'fence', 'RENT-TF')], codes, gateTypes,
})
say('a rental bills again every cycle', rental.recurring === true)

/* 5 — a hand-corrected line survives, and the tally follows it. --------- */
const saved: SheetLine[] = sheet.lines.map((l, i) => ({
  ...l, id: `row-${i}`, sort: (i + 1) * 10,
  amount: l.code === 'GATE-WK' ? 500 : l.amount,
  edited: l.code === 'GATE-WK',
}))
const merged = mergeSheet(sheet, saved)
say('a corrected line is the one that counts',
    merged.lines.find((l) => l.code === 'GATE-WK')?.amount === 500)
say('and the sheet then says it no longer matches the quote', merged.tallies === false,
    `${merged.total} against ${merged.sold}`)

/* 6 — the release gate. ------------------------------------------------- */
const T = (section: string, done: boolean) =>
  ({ id: section + done, section, en: 'a step', es: null, due_on: null, done,
     from_plan: true } as any)
const place = { navusoft_account: '55-1029' } as any
const open = whatBlocks({
  sold, place, tasks: [T('ticket', true), T('closeout', false)],
  sheet, openRevisions: 0, jobId: 'j1',
})
say('a punch item open blocks the handoff',
    open.length === 1 && /Close-out/.test(open[0].what), open.map((b) => b.what).join('; '))
const clear = whatBlocks({
  sold, place, tasks: [T('ticket', true), T('closeout', true)],
  sheet, openRevisions: 0, jobId: 'j1',
})
say('a finished job with an account number releases', clear.length === 0,
    clear.map((b) => b.what).join('; '))
say('an unpriced change order blocks it',
    whatBlocks({ sold, place, tasks: [], sheet, openRevisions: 1, jobId: 'j1' })
      .some((b) => /change order/.test(b.what)))
say('no account number blocks it',
    whatBlocks({ sold, place: null, tasks: [], sheet, openRevisions: 0, jobId: 'j1' })
      .some((b) => /Navusoft/.test(b.what)))
say('a thin quote nobody released blocks it',
    whatBlocks({ sold: { ...sold, belowFloor: true }, place, tasks: [], sheet,
                 openRevisions: 0, jobId: 'j1' }).some((b) => /margin floor/.test(b.what)))
say('nothing sold blocks it',
    whatBlocks({ sold: null, place, tasks: [], sheet, openRevisions: 0, jobId: 'j1' })
      .some((b) => /marked sold/.test(b.what)))
say('a sheet that does not tally blocks it',
    whatBlocks({ sold, place, tasks: [], sheet: merged, openRevisions: 0, jobId: 'j1' })
      .some((b) => /add up/.test(b.what)))

/* 7 — the message carries no cost and every figure it claims to. -------- */
const msg = keyingMessage({
  job: { id: 'j1', ref: 'FB-1042', name: 'Redbud Logistics', customer: 'Redbud',
         site_address: '1200 N Mingo Rd' } as any,
  place: { line1: '1200 N Mingo Rd', line2: null, city: 'Tulsa', region: 'OK',
           postcode: '74116' } as any,
  sheet, sold, navusoft: '55-1029', pm: 'Dana Ruiz', finished: '2026-09-10T17:00:00Z',
  note: 'Two gates on the north drive.', instructions: 'Key to the yard, not the office.',
  origin: 'https://oh.hihopper.app',
})
say('the message names the account', msg.body.includes('55-1029'))
say('the message carries the total',
    msg.body.includes(sheet.total.toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 })))
say('the message carries every code', sheet.lines.every((l) => msg.body.includes(l.code)))
say('the message says who to ask', msg.body.includes('Dana Ruiz'))
say('and it never mentions cost or margin', !/cost|margin/i.test(msg.body))
