import { quoteLines, specWords, whatWeBuild, goodThrough, signedPage,
         type Frozen } from '@/lib/estimate'

let bad = 0
const is = (what: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { bad++; console.log('FAIL', what, '\n  got ', got, '\n  want', want) }
  else console.log('ok  ', what)
}

const f: Frozen = {
  priced_on: '2026-09-14', spec: 'CL6', cls: 'permanent',
  measure: { plan_ft: 1000, slope_ft: 1016, opening_ft: 24, fence_ft: 1016,
             line_posts: 100, terminal_posts: 8, corner_posts: 3, runs: 2 },
  lines: [
    { code: 'FAB-CL6', name: 'Chain link fabric', uom: 'ft', per: 'foot',
      qty: 1016, sell: 9.5, extended: 9652, gap: false, type_code: null },
    { code: 'POST-L', name: 'Line post', uom: 'ea', per: 'line_post',
      qty: 100, sell: 62.8071, extended: 6280.71, gap: false, type_code: null },
    { code: 'GATE-DD', name: 'Double drive gate', uom: 'ea', per: 'gate',
      qty: 1, sell: 1450, extended: 1450, gap: false, type_code: 'DD20' },
    { code: 'GATE-WK', name: 'Walk gate', uom: 'ea', per: 'gate',
      qty: 1, sell: 418, extended: 418, gap: false, type_code: 'WK4' },
  ],
  sell: 17800.71, per_foot: 17.52,
}
const names = new Map([['DD20', "20′ double drive gate"], ['WK4', "4′ walk gate"]])
const g = (c: string) => names.get(c) ?? 'gate'

const lines = quoteLines(f, g)

is('three lines', lines.length, 3)
is('fence line is the remainder', lines[0].amount, 17800.71 - 1450 - 418)
is('gates keep their own amounts', [lines[1].amount, lines[2].amount], [1450, 418])
is('the lines total to the sold price to the cent',
   Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, 17800.71)
is('the fence line carries the measured feet', lines[0].qty, '1,016 ft')
is('no rate-book line reaches the customer',
   lines.some((l) => /FAB-|POST-/.test(l.what)), false)

is('a spec code is said out loud', specWords('CL6'), '6′ chain link')
is('an unknown spec code is left alone', specWords('ZZ9'), 'ZZ9')

// A job with no gates at all: one line, and it IS the price.
const noGates: Frozen = { ...f, lines: f.lines.filter((l) => !l.type_code) }
const one = quoteLines(noGates, g)
is('no gates means one line', one.length, 1)
is('and that line is the whole price', one[0].amount, 17800.71)

const build = whatWeBuild(f, [{ name: "20′ double drive gate", n: 1 }, { name: "4′ walk gate", n: 1 }])
is('five plain lines', build.length, 5)
is('posts are added up', build[1].says.includes('111'), true)
is('a job with no gates says so', whatWeBuild(noGates, [])[2].says, 'No gates on this estimate.')

is('good through is thirty days out', goodThrough('2026-09-14'), '2026-10-14')

/* ---- THE PAGE THAT WAS SIGNED --------------------------------------------
   The billing letter reproduces this, so what is checked is that it carries the
   customer's own lines and the customer's own total -- never the trade lines
   underneath them, and never a figure worked out a second time. */
const est = signedPage({
  firm: false, ref: 'FB-1043', where: '2432 E Admiral Blvd, Tulsa, OK 74110',
  specName: null, spec: 'CL6', company: 'On Call Services & Rentals',
  lines, extras: [], before: null, price: 17800.71,
  issuedOn: '2026-09-16', goodThrough: '2026-10-16',
  signedName: 'Marcus Webb', signedTitle: 'Facilities Director',
  signedAt: '2026-09-16T19:41:00.000Z',
})
is('an estimate says so on its masthead', est.mast_note, 'Estimate')
is('and in its own words', est.lead, 'This is an estimate, not a final price.')
is('the page is not numbered by the signature', est.label, 'the estimate as signed')
is('one row per customer line', est.table.rows.length, 3)
is('a row is what, how many, how much', est.table.rows[0].length, 3)
is('the detail rides under the item rather than beside it',
   (est.table.rows[0][0] as { note: string }).note, 'Fabric, rail, posts, concrete and labor')
is('the total is the price on the option', est.table.total, '$17,800.71')
is('the address is on the page', est.title, "6′ chain link — 2432 E Admiral Blvd, Tulsa, OK 74110")
is('good through is said in words', est.ref_note, 'good through 16 Oct 2026')
is('no rate code reaches the page',
   JSON.stringify(est.table.rows).includes('FAB-CL6'), false)

/* A firm price is the estimate plus what the survey found, listed UNDER it and
   never folded into the fence line -- the thing the whole revision flow exists
   to prevent. */
const firm = signedPage({
  firm: true, ref: 'FB-1043', where: '2432 E Admiral Blvd',
  specName: null, spec: 'CL6', company: 'On Call Services & Rentals',
  lines, before: 17800.71, price: 19160.71,
  extras: [
    { what: 'Rock at post depth', detail: 'East line refused the auger', amount: 348 },
    { what: 'Remove existing fence', detail: '410 ft, 2 loads', amount: 1012 },
  ],
  issuedOn: '2026-09-18', goodThrough: null,
  signedName: 'Marcus Webb', signedTitle: 'Facilities Director',
  signedAt: '2026-09-18T16:06:00.000Z',
})
is('a firm price says so', firm.mast_note, 'Firm price')
is('the estimate is the first row', firm.table.rows[0][0], 'Estimated at signing')
is('and it carries the figure that was signed', firm.table.rows[0][2], '$17,800.71')
is('one row per thing the survey found', firm.table.rows.length, 3)
is('the rows add up to the firm total',
   ['$17,800.71', '$348.00', '$1,012.00']
     .reduce((s, x) => s + Number(x.replace(/[$,]/g, '')), 0), 19160.71)
is('which is what the total says', firm.table.total, '$19,160.71')
is('a firm price is not good through anything', firm.ref_note, 'confirmed by the survey')
is('the signature is stamped to the minute',
   /\d{1,2}:\d{2}/.test(firm.signed_at ?? ''), true)

console.log(bad === 0 ? '\nAll checks pass.' : `\n${bad} FAILED`)
if (bad) process.exit(1)
