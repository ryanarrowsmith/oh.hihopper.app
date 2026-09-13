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
    name_es:null, width_ft:16, priced:true },
  { id:'2', type_code:'G-WK-4', rate_code:'GATE-WK', qty:1, name:"4' walk gate",
    name_es:null, width_ft:4, priced:true },
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
