/**
 * The guard between a model and a document somebody signs.
 *
 *   npx tsx lib/sow-ai.check.ts
 *
 * lib/sow-ai.ts decides what Claude is told and what is done with what comes
 * back. The three things worth checking are not about prose at all:
 *
 *   1. NO MONEY reaches the prompt. A scope of work carries no prices and the
 *      crew must never see one, so the facts object is built field by field and
 *      this asserts that nothing priced slipped in.
 *   2. AN INVENTED FIGURE IS CAUGHT. A post spacing the model made up is a fence
 *      built wrong at the customer's expense, so a draft carrying one is thrown
 *      away rather than saved with a warning.
 *   3. A FIGURE THE PERSON TYPED IS NOT AN INVENTION. "Hand-dig posts 41 through
 *      46" came from the project manager; handing it back must not refuse.
 *
 * It also prints the prompts, because a prompt is code and reading it is the
 * only review it gets.
 */
import { figureCheck, mustKeepOf, numbersEverywhere, numbersIn, factsFor, englishPrompt, spanishPrompt, SYSTEM } from '@/lib/sow-ai'
const facts = factsFor({
  job: { ref: 'FB-1042', name: 'Redbud Logistics', customer: 'Redbud Logistics LLC',
         site_address: '4120 N Peoria Ave, Tulsa OK 74106', cls: 'permanent' },
  spec: { code: 'CL-6-9-3', name_en: '6\' chain link, 9 ga, 3" mesh', name_es: 'malla ciclónica',
          height_ft: 6, spacing_ft: 10, note: null },
  takeoff: { planFt: 1030, slopeFt: 1036, openingFt: 20, fenceFt: 1016,
    linePosts: 100, terminalPosts: 8, cornerPosts: 3,
    runs: [{ label: 'Run 1', planFt: 576, corners: 3, closed: false },
           { label: 'Run 2', planFt: 454, corners: 0, closed: false }] },
  gates: [{ name: "16' double drive", name_es: 'portón doble', qty: 1, width_ft: 16 },
          { name: "4' walk gate", name_es: 'puerta peatonal', qty: 1, width_ft: 4 }],
  notes: ['Irrigation line inside the south run — hand dig the last 3 ft.'],
})
const allowed = numbersEverywhere(facts).join(' ')
const keep = mustKeepOf(facts)
console.log('no money in the facts:',
  !/price|cost|margin|sell|\$/i.test(JSON.stringify(facts)))
console.log('numbers seen:', numbersIn('1,016 ft of 6\' fence, 100 posts').join(' '))

const good = 'Build 1,016 ft of 6\' chain link with line posts at 10 ft centers. 100 line posts, 8 terminal, 3 corner. Two gates.'
console.log('a faithful draft:', figureCheck({ allowed, mustKeep: keep, wrote: good }))
const bad = 'Build 1,016 ft of 6\' chain link with line posts at 8 ft centers and 42 bags of concrete.'
console.log('an invented figure:', figureCheck({ allowed, mustKeep: keep, wrote: bad }))
const short = 'Build some fence. Posts as specified.'
console.log('a draft that dropped the figures:', figureCheck({ allowed, mustKeep: keep, wrote: short }).missing)
const typed = allowed + ' posts 41 through 46'
console.log('a figure the PM typed is not an invention:',
  figureCheck({ allowed: typed, mustKeep: keep, wrote: 'Hand-dig posts 41 through 46.' }).invented)
console.log('\\n--- system prompt\\n' + SYSTEM)
console.log('\\n--- english prompt (first 900)\\n' + englishPrompt(facts, []).slice(0, 900))
