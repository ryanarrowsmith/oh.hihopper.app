/**
 * The pricer, checked against figures worked out a second way.
 *
 *   npx tsx lib/price.check.ts
 *
 * Not a test suite — there is no runner in this repo — but the thing a test
 * suite would be for: `lib/price.ts` is the file where a quiet arithmetic bug
 * becomes a number somebody signs, so the fixture below is a real job (1,016 ft
 * of six-foot chain link, 100 line posts, 8 terminal, 3 corner, two gates, 4%
 * waste) and the expected figures were derived INDEPENDENTLY in SQL against the
 * seeded book, not by running this file and writing down what it said.
 *
 * Expected, and what SQL gives for the same job:
 *   sell   17800.71     cost 11804.68     margin 33.7%     $17.52 a foot
 *   fabric 1056.64 lf   (1016 × 1.04)
 *   concrete 200 / 24 / 9 by line, terminal and corner post
 *
 * It also checks the three things that are not arithmetic: a rule written
 * against another spec or another class must not appear; a person who may not
 * read costs gets a null cost and a null margin and the SAME sell; and a recipe
 * row naming a rate the book does not have becomes a named gap rather than a
 * silent zero.
 */
import { priceIt } from '@/lib/price'
const takeoff = { planFt: 1030, slopeFt: 1036, openingFt: 20, fenceFt: 1016,
  linePosts: 100, terminalPosts: 8, cornerPosts: 3, runs: [] } as any
const gates = [
  { id:'1', type_code:'G-VD-16', rate_code:'GATE-VD', qty:1, name:"16' double drive",
    name_es:null, width_ft:16, priced:true, leg_id:null, at_pct:null },
  { id:'2', type_code:'G-WK-4', rate_code:'GATE-WK', qty:1, name:"4' walk gate",
    name_es:null, width_ft:4, priced:true, leg_id:null, at_pct:null },
]
const spec = { code:'CL-6-9-3', cls:'permanent', name_en:"6' chain link", name_es:null,
  height_ft:6, spacing_ft:10, note:null }
const R = (cls:string, spec_code:string|null, rate_code:string, per:string, qty:number, waste=false, sort=0) =>
  ({ cls, spec_code, rate_code, per, qty, waste, note:null, sort })
const recipe = [
  R('permanent','CL-6-9-3','CL-FAB6','foot',1,true,10),
  R('permanent',null,'CL-RAIL','foot',1,true,20),
  R('permanent',null,'CL-TIE','foot',1.2,false,30),
  R('permanent',null,'CL-LINE','line_post',1,false,40),
  R('permanent',null,'CL-LOOP','line_post',1,false,50),
  R('permanent',null,'CL-CONC','line_post',2,false,60),
  R('permanent',null,'CL-TERM','terminal_post',1,false,70),
  R('permanent',null,'CL-TBAR','terminal_post',1,false,80),
  R('permanent',null,'CL-TBND','terminal_post',3,false,90),
  R('permanent',null,'CL-CONC','terminal_post',3,false,100),
  R('permanent',null,'CL-TERM','corner_post',1,false,110),
  R('permanent',null,'CL-TBAR','corner_post',2,false,120),
  R('permanent',null,'CL-TBND','corner_post',3,false,130),
  R('permanent',null,'CL-CONC','corner_post',3,false,140),
  R('permanent',null,'LAB-CL','foot',0.025,false,150),
  R('permanent',null,'EQ-AUG','job',1,false,160),
  R('permanent','WD-6-CED','WD-CEDAR','foot',2.18,true,200),   // wrong spec: must not appear
  R('temporary',null,'TF-PNL','foot',0.0834,false,300),        // wrong class: must not appear
]
const rate = (code:string, name_en:string, uom:string, sell:number, cost:number, markup:number) =>
  ({ id:code, code, kind:'material', grp:null, cls:null, name_en, name_es:null, uom,
     sell, verified_on:null, source:'placeholder', active:true, cost, markup })
const rates = [
  rate('CL-FAB6','fabric','lf',4.4020,3.10,1.42),
  rate('CL-RAIL','rail','lf',1.6330,1.15,1.42),
  rate('CL-TIE','tie','ea',0.1705,0.11,1.55),
  rate('CL-LINE','line post','ea',20.1640,14.20,1.42),
  rate('CL-LOOP','loop cap','ea',1.8600,1.20,1.55),
  rate('CL-CONC','concrete','ea',8.6400,6.40,1.35),
  rate('CL-TERM','terminal','ea',45.1560,31.80,1.42),
  rate('CL-TBAR','tension bar','ea',7.1300,4.60,1.55),
  rate('CL-TBND','tension band','ea',1.3175,0.85,1.55),
  rate('LAB-CL','chain link install','crew-hr',177.60,96.00,1.85),
  rate('EQ-AUG','auger truck','day',476.00,340.00,1.40),
  rate('GATE-VD','vehicle gate','ea',1098.16,742.00,1.48),
  rate('GATE-WK','walk gate','ea',275.28,186.00,1.48),
] as any

const withCost = priceIt({ takeoff, gates, spec, recipe: recipe as any, rates, wastePct: 4, seesCost: true })
console.log('lines:', withCost.lines.length, 'gaps:', withCost.gaps)
console.log('sell:', withCost.sell, 'cost:', withCost.cost, 'margin:', withCost.margin, 'perFoot:', withCost.perFoot)
console.log('fabric qty (want 1056.64):', withCost.lines.find(l=>l.code==='CL-FAB6')?.qty)
console.log('concrete lines:', withCost.lines.filter(l=>l.code==='CL-CONC').map(l=>[l.per,l.qty]))
console.log('wrong-spec/class rows present?', withCost.lines.some(l=>['WD-CEDAR','TF-PNL'].includes(l.code)))

const noCost = priceIt({ takeoff, gates, spec, recipe: recipe as any, rates, wastePct: 4, seesCost: false })
console.log('without cost -> cost:', noCost.cost, 'margin:', noCost.margin, 'sell same:', noCost.sell === withCost.sell)

const short = priceIt({ takeoff, gates, spec, recipe: [...recipe, R('permanent',null,'CL-GHOST','foot',1)] as any,
  rates, wastePct: 4, seesCost: true })
console.log('with a missing rate -> gaps:', short.gaps, 'whole:', short.whole, 'cost still:', short.cost)

// ---------------------------------------------------------------- the view
// A quote map has to pick the same frame every time or the picture changes
// under a quote that did not.
import { viewFit, toPixel, feetPerPixel } from '@/lib/geo'
const line: [number, number][] = [[-95.9900, 36.1500], [-95.9880, 36.1500], [-95.9880, 36.1512]]
const v1 = viewFit(line, 1200, 700), v2 = viewFit(line, 1200, 700)
console.log('view is stable:', JSON.stringify(v1) === JSON.stringify(v2))
const px = line.map((p) => toPixel(v1, p))
console.log('every point inside the frame:',
  px.every(([x, y]) => x > 0 && x < 1200 && y > 0 && y < 700))
console.log('aspect matches the image:',
  Math.abs(((v1.y1 - v1.y0) / (v1.x1 - v1.x0)) - (700 / 1200)) < 1e-9)
const straight = viewFit([[-95.99, 36.15], [-95.988, 36.15]], 1200, 700)
console.log('a dead straight run still has a frame:',
  Number.isFinite(feetPerPixel(straight)) && straight.y1 > straight.y0)

/* ==========================================================================
   THE SAME JOB, PRICED ONE LEG AT A TIME.

   The point of the leg model is that a side can differ. The point of THIS
   section is that when no side differs, the answer is the one above — and when
   one does, only that side moves.
   ========================================================================== */
import { priceLegs } from '@/lib/price'
import { legsOf, totalOf, type LegRow } from '@/lib/legs'
import type { LngLat } from '@/lib/geo'

let bad = 0
const ok = (what: string, got: unknown, want: unknown, tol = 0) => {
  const fine = typeof got === 'number' && typeof want === 'number'
    ? Math.abs(got - want) <= tol : got === want
  console.log(`${fine ? 'ok  ' : 'FAIL'}  ${what}: ${got}${fine ? '' : ` (wanted ${want})`}`)
  if (!fine) bad++
}

const LAT = 36.10, LNG = -95.96
const dLat = 186 / 364000
const dLng = 392 / (364000 * Math.cos((LAT * Math.PI) / 180))
const box: LngLat[] = [[LNG, LAT], [LNG + dLng, LAT], [LNG + dLng, LAT + dLat], [LNG, LAT + dLat]]
const tall = { ...spec, code: 'CL-8', name_en: "8' chain link", height_ft: 8, spacing_ft: 8 }
const legRun = { id: 'r1', label: 'Run 1', points: box, plan_ft: 0, grade_pct: null,
                 closed_loop: true, measured_by: 'aerial', sort: 0 } as any
const legRows: LegRow[] = [0, 1, 2, 3].map((i) =>
  ({ id: `l${i}`, run_id: 'r1', sort: i, label: null, spec_code: null }))
const twoGates = [{ ...gates[0], leg_id: 'l0', at_pct: 0.5 },
                  { ...gates[1], leg_id: 'l1', at_pct: 0.45 }] as any

const plain = legsOf({ run: legRun, legs: legRows, gates: twoGates,
                       jobSpec: spec as any, specs: [spec, tall] as any })
const byLeg = priceLegs({ legs: plain, recipe: recipe as any, rates, wastePct: 4, seesCost: true })

/* Priced as ONE job from the same quantities, so the only thing that can differ
   is how many times the recipe was walked. THIS COMPARISON EARNED ITS KEEP: the
   first version of priceLegs charged the auger truck once per leg rather than
   once per job — $1,428 of invented equipment on a four-sided lot — and nothing
   else would have noticed. */
const asOne = priceIt({ takeoff: totalOf(plain), gates: twoGates, spec: spec as any,
                        recipe: recipe as any, rates, wastePct: 4, seesCost: true })

console.log('by leg  sell:', byLeg.sell, 'cost:', byLeg.cost, 'margin:', byLeg.margin)
console.log('as one  sell:', asOne.sell, 'cost:', asOne.cost, 'margin:', asOne.margin)
ok('four legs come back priced', byLeg.legs.length, 4)
ok('nothing is a gap', byLeg.gaps.length, 0)
/* Leg by leg and job at once agree to within a dollar or two: the same
   quantities through the same recipe, with rounding applied four times instead
   of once. A larger gap would mean a rule is being counted per leg that should
   be counted per job — the auger truck is the one to watch, since `per: job`
   means ONE truck however many sides there are. */
/* A dollar of tolerance, not a thousand: the same quantities through the same
   recipe, with rounding applied four times instead of once. Anything larger
   means a rule is being counted per leg that belongs to the job. */
ok('and the two ways agree to the dollar',
   Math.abs(byLeg.sell - asOne.sell) < 1, true)
console.log('  the difference is:', Math.round((byLeg.sell - asOne.sell) * 100) / 100,
            '— four roundings against one')

ok('each leg carries its own feet',
   byLeg.legs.map((l) => Math.round(l.planFt)).join('/'), '393/186/393/186')
ok('the merged list has one row per rate code',
   new Set(byLeg.lines.map((l) => `${l.code}|${l.per}|${l.typeCode ?? ''}`)).size,
   byLeg.lines.length)
ok('and both gates survive the merge',
   byLeg.lines.filter((l) => l.per === 'gate').length, 2)

// ------------------------------------------------------------- one side taller
const over = legsOf({
  run: legRun,
  legs: legRows.map((l) => (l.sort === 1 ? { ...l, spec_code: 'CL-8' } : l)),
  gates: twoGates, jobSpec: spec as any, specs: [spec, tall] as any,
})
const priced = priceLegs({ legs: over, recipe: recipe as any, rates, wastePct: 4, seesCost: true })
ok('only one leg is marked as overriding', priced.legs.filter((l) => l.overrides).length, 1)
ok('the other three are unchanged to the cent',
   [0, 2, 3].map((i) => priced.legs[i].sell).join(','),
   [0, 2, 3].map((i) => byLeg.legs[i].sell).join(','))
console.log('  east leg at 6ft spec:', byLeg.legs[1].sell,
            '· at 8ft spec:', priced.legs[1].sell)
/* The 8-foot spec has no fabric rule of its own in this fixture, so the fabric
   line drops out and the leg gets CHEAPER. That is not a bug in the pricer, it
   is the named-gap rule working: a spec the book cannot price is a hole the
   screen must show, not a number to invent. */
ok('a spec the book cannot price becomes a gap rather than a guess',
   priced.gaps.length > 0, true)
ok('and the gap names the leg that caused it',
   priced.legs[1].lines.some((l) => l.gap), true)

console.log(bad ? `\n${bad} LEG CHECKS FAILED` : '\nleg checks all good')

/* ==========================================================================
   WHICH PRICER ANSWERS, AND WHAT THE CUSTOMER READS.

   Two questions, and both of them are about a number NOT changing. priceJob
   picks between the legs and the whole job, and on a job with no override the
   pick must not be visible in the total. quoteLines splits the customer's fence
   line across sides, and however it splits it, the lines must still add to the
   figure that was quoted — which is the entire discipline of that function.
   ========================================================================== */
import { priceJob, sidesOf } from '@/lib/price'
import { quoteLines, type Frozen } from '@/lib/estimate'

const all = { takeoff: totalOf(plain), gates: twoGates, spec: spec as any,
              recipe: recipe as any, rates, wastePct: 4, seesCost: true }

const byLegs = priceJob({ ...all, legs: plain })
ok('with the legs covering the line, the legs answer', byLegs.byLeg, true)
ok('and the answer is the legs’ own figure', byLegs.sell, byLeg.sell)

/* A RUN SOMEBODY TYPED HAS NO GEOMETRY. 200 feet off a wheel with nothing drawn
   is 200 feet the legs know nothing about, so pricing by leg would quietly drop
   it. The plan length is what catches it. */
const partly = priceJob({
  ...all,
  takeoff: { ...totalOf(plain), planFt: totalOf(plain).planFt + 200 },
  legs: plain,
})
ok('a typed run the legs do not cover sends it back to the whole job',
   partly.byLeg, false)
ok('and the sides are still worked out, for the table', partly.legs.length, 4)

// ------------------------------------------------- what the customer is told
ok('no override, so the document names no sides', sidesOf(byLeg.legs).length, 0)

const sides = sidesOf(priced.legs)
ok('one side taller makes two things to buy', sides.length, 2)
console.log('  sides:', sides.map((x) => `${x.label} @ ${x.specName}`).join(' | '))
ok('and the three plain sides are said as one line',
   sides.some((x) => /and/.test(x.label)), true)

/* THE REMAINDER RULE SURVIVES THE SPLIT. Whatever the gates come to comes off
   the top and the rest is divided between the sides — so three lines add to the
   quoted price exactly as one line did. A cent out here is a customer adding up
   a column and finding it wrong. */
const frozen: Frozen = {
  priced_on: '2026-09-14', spec: 'CL6', cls: 'permanent',
  measure: { plan_ft: 1158, slope_ft: 1158, opening_ft: 20, fence_ft: 1138,
             line_posts: 100, terminal_posts: 8, corner_posts: 4, runs: 1 },
  lines: priced.lines.map((l) => ({
    code: l.code, name: l.name, uom: l.uom, per: l.per, qty: l.qty,
    sell: l.sell, extended: l.extended, gap: l.gap, type_code: l.typeCode,
  })),
  sell: priced.sell, per_foot: priced.perFoot,
  sides: sides.map((x) => ({ spec: x.spec, spec_name: x.specName, label: x.label,
                             fence_ft: x.fenceFt, amount: x.amount })),
}
const shown = quoteLines(frozen, (c) => c)
const adds = Math.round(shown.reduce((s, l) => s + l.amount, 0) * 100) / 100
ok('the customer’s lines add to the quoted price', adds, priced.sell, 0.01)
ok('and there is a line for each thing being built',
   shown.filter((l) => /installed/.test(l.what)).length, 2)

const oneSide = quoteLines({ ...frozen, sides: [] }, (c) => c)
ok('with nothing different, it is one installed line',
   oneSide.filter((l) => /installed/.test(l.what)).length, 1)
ok('and that still adds to the quoted price',
   Math.round(oneSide.reduce((s, l) => s + l.amount, 0) * 100) / 100, priced.sell, 0.01)

console.log(bad ? `\n${bad} CHECKS FAILED` : '\njob and document checks all good')
