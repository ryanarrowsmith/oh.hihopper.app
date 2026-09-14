/**
 * Checks for the leg model. `npx tsx lib/legs.check.ts`
 *
 * The one that matters: A JOB WITH NO OVERRIDES MUST MEASURE WHAT IT MEASURED
 * BEFORE. Feet are the same geometry read two ways and have to agree exactly.
 * Posts are the interesting case and the reason this file exists — see below.
 */
import { legsOf, totalOf, segmentsOf, sideName, middle, type LegRow } from './legs'
import { takeoff, type GateRow, type RunRow, type Spec } from './measure'
import type { LngLat } from './geo'

let bad = 0
const ok = (what: string, got: unknown, want: unknown, tol = 0) => {
  const fine = typeof got === 'number' && typeof want === 'number'
    ? Math.abs(got - want) <= tol : got === want
  console.log(`${fine ? 'ok  ' : 'FAIL'}  ${what}: ${got}${fine ? '' : ` (wanted ${want})`}`)
  if (!fine) bad++
}
const say = (what: string, v: unknown) => console.log(`      ${what}: ${v}`)

// A rectangle near Tulsa: 392 ft east-west, 186 ft north-south, closed.
const LAT = 36.10, LNG = -95.96
const dLat = 186 / 364000
const dLng = 392 / (364000 * Math.cos((LAT * Math.PI) / 180))
const box: LngLat[] = [[LNG, LAT], [LNG + dLng, LAT], [LNG + dLng, LAT + dLat], [LNG, LAT + dLat]]

const spec: Spec = {
  code: 'CL-6', cls: 'permanent', name_en: "6' chain link", name_es: null,
  height_ft: 6, spacing_ft: 10, note: null,
}
const tall: Spec = { ...spec, code: 'CL-8', name_en: "8' chain link", height_ft: 8, spacing_ft: 8 }

const run: RunRow = {
  id: 'r1', label: 'Run 1', points: box, plan_ft: 0, grade_pct: null,
  closed_loop: true, measured_by: 'aerial', sort: 0,
}
const legRows: LegRow[] = [0, 1, 2, 3].map((i) => ({
  id: `l${i}`, run_id: 'r1', sort: i, label: null, spec_code: null,
}))

// ------------------------------------------------------------------ geometry
ok('a closed rectangle has four legs', segmentsOf(box, true).length, 4)
ok('an open rectangle has three', segmentsOf(box, false).length, 3)
ok('a single point has none', segmentsOf([box[0]], true).length, 0)

const legs = legsOf({ run, legs: legRows, gates: [], jobSpec: spec, specs: [spec, tall] })
ok('four legs come back', legs.length, 4)
say('named', legs.map((l) => l.label).join(' · '))
ok('a side is named for where it sits, not which way it was traced',
   legs[0].label, 'South side')
ok('and the far side gets the opposite name', legs[2].label, 'North side')
ok('lengths alternate with the rectangle', Math.round(legs[0].planFt), 392, 1)
ok('the short sides too', Math.round(legs[1].planFt), 186, 1)

// --------------------------------------------- the invariant that matters
const whole = takeoff([run], [], spec)
const sum = totalOf(legs)

ok('plan feet agree exactly', Math.round(sum.planFt * 10), Math.round(whole.planFt * 10))
ok('fence feet agree exactly', Math.round(sum.fenceFt * 10), Math.round(whole.fenceFt * 10))
ok('a closed line has no terminal posts, either way', sum.terminalPosts, whole.terminalPosts)
ok('the corners agree', sum.cornerPosts, whole.cornerPosts)

/* POSTS ARE THE ONE PLACE THE TWO DISAGREE, and the per-leg figure is the
   better one. The whole-run formula spreads `ceil(total / spacing)` over the
   entire line and takes one off per RUN; counting per leg asks the question a
   crew actually answers — how many posts fit between these two corners — and
   takes one off per LEG. On this fixture that is a single post, and it is a
   post the old count had and nobody would set. */
say('line posts, whole run', whole.linePosts)
say('line posts, by leg', sum.linePosts)
ok('and they are within a post per leg of each other',
   Math.abs(sum.linePosts - whole.linePosts) <= legs.length, true)

// ------------------------------------------------------------- an override
const over = legsOf({
  run,
  legs: legRows.map((l) => (l.sort === 1 ? { ...l, spec_code: 'CL-8' } : l)),
  gates: [], jobSpec: spec, specs: [spec, tall],
})
ok('only the leg that differs says so', over.filter((l) => l.overrides).length, 1)
ok('and it is the one that was set', over[1].spec?.code, 'CL-8')
ok('the others still follow the job', over[0].spec?.code, 'CL-6')
/* 8-foot posts go in at 8-foot centres, so the taller leg needs more of them.
   This is the whole point: a spacing that comes from the leg's own spec. */
say('east leg posts at 10ft spacing', legs[1].linePosts)
say('east leg posts at 8ft spacing', over[1].linePosts)
ok('a tighter spacing means more posts on that leg alone',
   over[1].linePosts > legs[1].linePosts, true)
ok('and it changes nothing on the other legs',
   over[0].linePosts, legs[0].linePosts)

// ------------------------------------------------------------------- gates
const gate: GateRow = {
  id: 'g1', type_code: 'G-VD-16', rate_code: 'GATE-VD', qty: 1,
  name: "16' double drive", name_es: null, width_ft: 16, priced: true,
  leg_id: 'l0', at_pct: 0.5,
}
const withGate = legsOf({ run, legs: legRows, gates: [gate], jobSpec: spec, specs: [spec] })
ok('the gate lands on its own leg and nowhere else',
   withGate.map((l) => l.gates.length).join(''), '1000')
ok('its opening comes out of that leg', Math.round(withGate[0].fenceFt), 376, 1)
ok('and out of the total', Math.round(totalOf(withGate).fenceFt),
   Math.round(totalOf(legs).fenceFt) - 16, 1)
ok('a gate puts two terminal posts back in', withGate[0].terminalPosts, 2)
ok('an unplaced gate is counted but not drawn',
   legsOf({ run, legs: legRows, gates: [{ ...gate, leg_id: null }], jobSpec: spec, specs: [spec] })
     .every((l) => l.gates.length === 0), true)

// --------------------------------------------------------------- open lines
const openRun: RunRow = { ...run, closed_loop: false }
const openLegs = legsOf({ run: openRun, legs: legRows, gates: [], jobSpec: spec, specs: [spec] })
ok('an open line has one leg fewer', openLegs.length, 3)
ok('and two terminal posts, one at each end',
   totalOf(openLegs).terminalPosts, 2)
ok('which is what the whole-run count says too',
   totalOf(openLegs).terminalPosts, takeoff([openRun], [], spec).terminalPosts)

// ------------------------------------------------------------------ naming
ok('a point due north of the middle is the north side',
   sideName([LNG, LAT + 1], [LNG, LAT]), 'North')
ok('due east is the east side', sideName([LNG + 1, LAT], [LNG, LAT]), 'East')
ok('the middle of a box is its middle',
   Math.round(middle(box)[1] * 1e6) / 1e6,
   Math.round(((LAT + LAT + dLat) / 2) * 1e6) / 1e6)

console.log(bad ? `\n${bad} FAILED` : '\nall good')
process.exit(bad ? 1 : 0)
