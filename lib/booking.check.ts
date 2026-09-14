/* Dates, run against fixtures. Every one of these is a number somebody plans a
   crew's week around, and the 811 window is the one that is the law. */
import { workdays, endsOn, digWindow, daysFromHours, laborHours } from '@/lib/booking'

let bad = 0
const ok = (what: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want)
  if (!good) bad++
  console.log(`${good ? 'ok  ' : 'FAIL'}  ${what}:`, got, good ? '' : `(wanted ${JSON.stringify(want)})`)
}

// Tue 15 Sep 2026 → Thu 1 Oct 2026. Weekends are not dug on.
ok('working days across two weekends', workdays('2026-09-15', '2026-10-01'), 12)
ok('a window that is one day is one day', workdays('2026-09-15', '2026-09-16'), 1)
ok('nothing without both ends', workdays('', '2026-10-01'), 0)

// Three days from a Thursday finishes on the Monday.
ok('a run of days skips the weekend', endsOn('2026-09-17', 3), '2026-09-21')
ok('one day finishes the day it starts', endsOn('2026-09-17', 1), '2026-09-17')
ok('no duration, no finish', endsOn('2026-09-17', null), null)

const w = { digFrom: '2026-09-17', locateExpires: '2026-10-01' }
ok('inside the window is clear',
   digWindow({ ...w, startsOn: '2026-09-22' }), { state: 'clear', off: 0, room: 10 })
ok('before the ticket matures is early',
   digWindow({ ...w, startsOn: '2026-09-15' }), { state: 'early', off: 2, room: 10 })
/* THE ONE THAT MATTERS. Past the expiry the ticket is dead and the marks on the
   ground are somebody's guess -- and the screen books it anyway and keeps
   saying so, because a refusal gets worked around. */
ok('past the expiry is expired, and says by how far',
   digWindow({ ...w, startsOn: '2026-10-06' }), { state: 'expired', off: 5, room: 10 })
ok('the first allowed day is clear, not early',
   digWindow({ ...w, startsOn: '2026-09-17' }).state, 'clear')
ok('the last allowed day is clear, not expired',
   digWindow({ ...w, startsOn: '2026-10-01' }).state, 'clear')
ok('no survey dates, nothing to say',
   digWindow({ startsOn: '2026-09-22', digFrom: null, locateExpires: null }).state, 'unknown')
ok('no start date, nothing to say either',
   digWindow({ ...w, startsOn: null }).state, 'unknown')

const lines = [{ uom: 'hr', qty: 28.4 }, { uom: 'ft', qty: 1145 },
               { uom: 'Hours', qty: 4 }, { uom: null, qty: 9 }]
ok('only the hours count as hours', laborHours(lines), 32.4)
ok('a crew of three, eight-hour days', daysFromHours(32.4, 3), 2)
ok('a crew of two takes longer', daysFromHours(32.4, 2), 3)
ok('a crew nobody sized is assumed to be three', daysFromHours(32.4, null), 2)
ok('no hours, no answer', daysFromHours(0, 3), null)

console.log(bad ? `\n${bad} FAILED` : '\nall good')
