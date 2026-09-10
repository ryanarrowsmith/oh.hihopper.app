import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { allowedFor } from '@/lib/freshness'

export type CalKind =
  | 'sched' | 'late' | 'birthday' | 'anniversary' | 'feed' | 'event' | 'todo' | 'oneonone'

export type Ev = {
  id: string; kind: CalKind; title: string; sub: string | null
  /** ISO day for an all-day entry. */
  day: string
  /** Set only for something with a clock on it, which today means a feed. */
  at: string | null; mins: number | null
  href: string | null; colour: string
}

export type Celebrant = { id: string; name: string; where: string | null; day: number | null; years?: number }

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/* Four palette colours are already as many as separate reliably for every kind
   of colour vision, so the fifth kind does not get a fifth colour. It gets ink
   -- which is also the honest signal: everything else on this calendar is
   worked out, and an event is the one thing a person typed.

   To-do dates are one colour and one switch for the same reason, even though a
   task and a subtask are different things: which it is goes in the line under
   the name, where a word can say it, rather than into a sixth colour nobody can
   name. */
const COLOUR: Record<CalKind, string> = {
  sched: '--s1', late: '--amber', birthday: '--amber',
  anniversary: '--s2', feed: '--s3', event: '--ink-2', todo: '--steel',
  /* The eighth kind does get its own colour, against the rule three lines up,
     because it is the only one on this calendar that is nobody else's business
     -- and a one-to-one wearing the same ink as a typed event would be a
     private thing dressed as a public one. Plum is out of Hopper's own palette
     rather than invented, and it never carries the meaning alone: the legend
     names it and every entry says "one-to-one" in the line beneath. */
  oneonone: '--s4',
}

/**
 * Everything Hopper can put on a date, for a window.
 *
 * Assembled here rather than in a view because two of these are DERIVED -- when
 * a report is next due is arithmetic on its schedule, and a birthday is a month
 * and a day projected onto whichever year is being looked at. Neither is a row
 * anywhere, and inventing rows for them would mean a table that has to be
 * regenerated every time somebody scrolls to next March.
 */
export async function loadCalendar(from: Date, to: Date, mePersonId?: string | null) {
  const db = supabaseServer()

  const [{ data: reps }, { data: people }, { data: feeds }, { data: events }, { data: mine },
         { data: tasks }, { data: lists }, { data: ones }, { data: named }] =
    await Promise.all([
    db.schema('hopper').from('report_state')
      .select('report_id, name, refresh, last_look, value_on, snapshot_at, last_look_ok, entity_id'),
    db.schema('hopper').from('directory')
      .select('id, full_name, entity_name, department_name, birth_month, birth_day, start_month, start_year')
      .eq('active', true),
    db.schema('hopper').from('calendar_feed').select('id, name, colour, last_ok, failure, url'),
    db.schema('hopper').from('feed_event')
      .select('id, feed_id, title, starts_at, ends_at, all_day, location, url')
      .gte('starts_at', from.toISOString()).lte('starts_at', to.toISOString())
      .order('starts_at'),
    db.schema('hopper').from('event')
      .select('id, title, day, start_min, end_min, location, notes')
      .gte('day', iso(from)).lte('day', iso(to)).order('day'),
    // Tasks, but only YOURS. Everybody's tasks on one calendar is not a
    // calendar, it is a wall. Subtasks come too: a step with a date of its own
    // is a thing somebody has to do on a day, which is all a calendar asks.
    db.schema('hopper').from('task')
      .select('id, name, due_on, done_at, list_id, parent_id, assignee_id')
      .gte('due_on', iso(from)).lte('due_on', iso(to)).is('done_at', null),
    db.schema('hopper').from('list')
      .select('id, name, due_on')
      .gte('due_on', iso(from)).lte('due_on', iso(to)),
    /* One-to-ones. staff_meeting_read narrows this to lines the viewer may
       open, and the filter below narrows it again to the ones they HELD --
       because a calendar is the answer to "what is on me", and somebody
       else's one-to-one is not on you even where you are allowed to read it. */
    db.schema('hopper').from('staff_meeting')
      .select('id, person_id, manager_id, day, start_min, end_min, agenda, held')
      .gte('day', iso(from)).lte('day', iso(to)),
    /* Names for the above, from person rather than from `directory`. The view
       is built for the People page and a person with no organization on their
       record does not survive its joins -- which showed up as a one-to-one
       entry titled "One-to-one" instead of the name of the person it was
       with. person_read already admits your own line of report, so this
       returns exactly the names a one-to-one could be about. */
    db.schema('hopper').from('person').select('id, full_name'),
  ])

  const evs: Ev[] = []

  /* ── when each report is next due, and every time it is due again inside
        the window. A weekly report looked at once is due 52 times a year, and
        showing only the next one would make a month view lie about the month. */
  for (const r of reps ?? []) {
    if (!r.refresh || r.refresh === 'none' || r.snapshot_at) continue
    const step = allowedFor(r.refresh) === 9 * 86_400_000 ? 7
      : r.refresh === 'hourly' || r.refresh === 'twice_daily' ? 1
      : r.refresh === 'daily' ? 1 : 1
    let when = new Date(r.last_look ?? Date.now())
    when.setHours(0, 0, 0, 0)
    // Wind forward to the window rather than emitting from the last look: a
    // report untouched since July should not draw eight weeks of past dots.
    let guard = 0
    while (when < from && guard++ < 800) when = new Date(when.getTime() + step * 86_400_000)
    while (when <= to && guard++ < 800) {
      evs.push({
        id: `due-${r.report_id}-${iso(when)}`, kind: 'sched', title: r.name,
        sub: 'due to be read', day: iso(when), at: null, mins: null,
        href: `/reporting/${r.report_id}`, colour: COLOUR.sched,
      })
      when = new Date(when.getTime() + step * 86_400_000)
    }

    // The day it went behind, marked once, on the day the allowance ran out.
    if (r.value_on) {
      const over = new Date(new Date(`${r.value_on}T00:00:00`).getTime() + allowedFor(r.refresh))
      if (over >= from && over <= to && Date.now() > over.getTime()) {
        evs.push({
          id: `late-${r.report_id}`, kind: 'late', title: r.name,
          sub: 'stopped moving', day: iso(over), at: null, mins: null,
          href: `/reporting/${r.report_id}`, colour: COLOUR.late,
        })
      }
    }
  }

  /* ── birthdays and anniversaries, projected onto the years in view ── */
  const years = new Set<number>()
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) years.add(y)

  for (const p of people ?? []) {
    for (const y of years) {
      if (p.birth_month && p.birth_day) {
        // A 29 February birthday in a year that has no 29 February lands on the
        // 28th rather than rolling into March, which is what a person would do.
        const last = new Date(y, p.birth_month, 0).getDate()
        const d = new Date(y, p.birth_month - 1, Math.min(p.birth_day, last))
        if (d >= from && d <= to) {
          evs.push({
            id: `bday-${p.id}-${y}`, kind: 'birthday', title: p.full_name,
            sub: 'birthday', day: iso(d), at: null, mins: null,
            href: `/people/${p.id}`, colour: COLOUR.birthday,
          })
        }
      }
      if (p.start_month && p.start_year && y > p.start_year) {
        const d = new Date(y, p.start_month - 1, 1)
        if (d >= from && d <= to) {
          const n = y - p.start_year
          evs.push({
            id: `anni-${p.id}-${y}`, kind: 'anniversary', title: p.full_name,
            sub: `${n} year${n === 1 ? '' : 's'}`, day: iso(d), at: null, mins: null,
            href: `/people/${p.id}`, colour: COLOUR.anniversary,
          })
        }
      }
    }
  }

  /* ── whatever the subscribed calendars said ── */
  const feedColour = new Map((feeds ?? []).map((f: any) => [f.id, f.colour]))
  for (const e of events ?? []) {
    const start = new Date(e.starts_at)
    evs.push({
      id: `fe-${e.id}`, kind: 'feed', title: e.title, sub: e.location ?? null,
      day: iso(start),
      at: e.all_day ? null : e.starts_at,
      mins: e.all_day || !e.ends_at ? null
        : Math.max(15, Math.round((+new Date(e.ends_at) - +start) / 60000)),
      href: e.url ?? null, colour: feedColour.get(e.feed_id) ?? COLOUR.feed,
    })
  }

  /* ── and the ones somebody typed ──
        The day and the minutes are put back together as a LOCAL time string
        with no zone on it, which is what `new Date` reads in the browser's own
        reckoning. Nine o'clock is nine o'clock wherever you open it, which is
        the whole reason the column is a date and not a moment. */
  for (const e of mine ?? []) {
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    evs.push({
      id: `ev-${e.id}`, kind: 'event', title: e.title, sub: e.location ?? null,
      day: e.day,
      at: e.start_min == null ? null : `${e.day}T${hhmm(e.start_min)}:00`,
      mins: e.start_min == null || e.end_min == null ? null : e.end_min - e.start_min,
      href: null, colour: COLOUR.event,
    })
  }

  /* ── to-do dates ── */
  // A whole list falling due is a date everybody working on it is working
  // towards, which is exactly what a calendar is for. RLS decides who sees it.
  const listName = new Map((lists ?? []).map((l: any) => [l.id, l.name]))
  for (const l of lists ?? []) {
    evs.push({
      id: `ls-${l.id}`, kind: 'todo', title: l.name, sub: 'List · due',
      day: l.due_on, at: null, mins: null,
      href: `/todo/${l.id}`, colour: COLOUR.todo,
    })
  }
  // Only the ones that are actually mine. loadCalendar has no person to compare
  // against, so the caller passes one -- and passing none means no tasks rather
  // than everybody's, which is the safe way round for a mistake to fall.
  for (const t of tasks ?? []) {
    if (!mePersonId || t.assignee_id !== mePersonId) continue
    evs.push({
      id: `tk-${t.id}`, kind: 'todo', title: t.name,
      sub: `${listName.get(t.list_id) ?? 'List'}${t.parent_id ? ' · subtask' : ''}`,
      day: t.due_on, at: null, mins: null,
      href: `/todo/${t.list_id}`, colour: COLOUR.todo,
    })
  }

  /* ── one-to-ones, on the calendar of the manager who holds them ──
        The DATE crosses out of Staffing and nothing else does: no notes, no
        agenda body, no score. The title is the person, because that is what
        makes the entry useful at a glance and it is already a name the holder
        of this calendar can read. */
  const personName = new Map((named ?? []).map((p: any) => [p.id, p.full_name]))
  for (const m of ones ?? []) {
    if (!mePersonId || m.manager_id !== mePersonId) continue
    const hhmm = (n: number) =>
      `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
    evs.push({
      id: `1on1-${m.id}`, kind: 'oneonone',
      title: personName.get(m.person_id) ?? 'One-to-one',
      sub: m.held ? 'One-to-one · held' : 'One-to-one',
      day: m.day,
      at: m.start_min == null ? null : `${m.day}T${hhmm(m.start_min)}:00`,
      mins: m.start_min == null || m.end_min == null ? null : m.end_min - m.start_min,
      href: `/staffing/${m.person_id}`, colour: COLOUR.oneonone,
    })
  }

  return { events: evs, feeds: feeds ?? [] }
}

/** Who to congratulate this month. */
export function celebrants(people: any[], month: number) {
  const bdays: Celebrant[] = []
  const annis: Celebrant[] = []
  for (const p of people) {
    const where = p.department_name ?? p.entity_name ?? null
    if (p.birth_month === month) {
      bdays.push({ id: p.id, name: p.full_name, where, day: p.birth_day ?? null })
    }
    if (p.start_month === month && p.start_year) {
      annis.push({ id: p.id, name: p.full_name, where, day: null,
        years: new Date().getFullYear() - p.start_year })
    }
  }
  bdays.sort((a, b) => (a.day ?? 99) - (b.day ?? 99))
  annis.sort((a, b) => (b.years ?? 0) - (a.years ?? 0))
  return { bdays, annis }
}
