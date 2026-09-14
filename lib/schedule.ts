import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { loadMeasure, loadRecipe } from '@/lib/takeoff'
import { loadRates } from '@/lib/fence'
import { priceJob } from '@/lib/price'
import { laborHours, daysFromHours, digWindow, endsOn } from '@/lib/booking'
import type { Section } from '@/lib/fence'

/* ==========================================================================
   BOOKING IT, AND CLOSING IT OUT.

   The two screens at either end of the crew's week. What they have in common is
   that neither of them is allowed to invent a number: the duration comes off the
   same labor the price came from, the load list comes off the same takeoff, and
   what was built is compared against what was walked rather than replacing it.

   NOTHING HERE IS A PRICE except where the screen is explicitly about money —
   the load list is quantities, because it is read in a yard.
   ========================================================================== */

export type Crew = {
  id: string; name: string; foreman: string | null
  lang: string; badged: boolean; size: number | null
  /** The jobs already in this crew's diary that overlap the dates being asked
   *  for. Empty is the answer that lets somebody book without thinking. */
  busy: { ref: string; name: string; from: string; to: string | null }[]
}

export type LoadLine = {
  group: string; name: string; qty: string; from: string
}

/** Everything the schedule screen books with. */
export async function loadSchedule(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const [measure, recipe, book, survey, crews, foremen, links, others] = await Promise.all([
    loadMeasure(accountId, jobId),
    loadRecipe(accountId),
    loadRates(accountId),
    h().from('fence_survey')
      .select('locate_ticket, dig_from, locate_expires, access, ask_for, utilities, closed_at')
      .eq('account_id', accountId).eq('job_id', jobId).maybeSingle(),
    h().from('fence_crew')
      .select('id, name, foreman_id, lang, badged, size')
      .eq('account_id', accountId).eq('active', true).order('name'),
    h().from('person').select('id, full_name').eq('account_id', accountId),
    h().from('fence_ticket_link')
      .select('id, token, issued_at, expires_on, revoked, lang')
      .eq('account_id', accountId).eq('job_id', jobId)
      .order('issued_at', { ascending: false }),
    /* WHO ELSE IS ON THAT DAY. A crew is free or it is not, and finding out on
       the morning is a wasted day for three people. */
    h().from('fence_job')
      .select('id, ref, name, crew, starts_on, ends_on')
      .eq('account_id', accountId).eq('complete', false).not('crew', 'is', null),
  ])

  const job: any = measure.job
  const jobRow = await h().from('fence_job')
    .select('days_on_site, ends_on, booked_at, starts_on, crew, sold_price, sold_on')
    .eq('account_id', accountId).eq('id', jobId).maybeSingle()
  const booking = (jobRow.data ?? {}) as any

  const named = new Map(((foremen.data ?? []) as any[]).map((p) => [p.id, p.full_name as string]))
  const diary = ((others.data ?? []) as any[]).filter((j) => j.id !== jobId)

  const crewRows: Crew[] = ((crews.data ?? []) as any[]).map((c) => ({
    id: c.id, name: c.name,
    foreman: c.foreman_id ? named.get(c.foreman_id) ?? null : null,
    lang: c.lang, badged: !!c.badged,
    size: c.size == null ? null : Number(c.size),
    busy: diary.filter((j) => j.crew === c.name && j.starts_on)
      .map((j) => ({ ref: j.ref, name: j.name, from: j.starts_on, to: j.ends_on }))
      .sort((a, b) => a.from.localeCompare(b.from)),
  }))

  /* THE DURATION FALLS OUT OF THE PRICE. The recipe sells labor by the hour and
     the takeoff already holds the quantity, so the days come from the same
     arithmetic the customer's figure did rather than from a separate guess. */
  const priced = priceJob({
    takeoff: measure.sums, legs: measure.legs, gates: measure.gates, spec: measure.spec,
    recipe, rates: book.rates, wastePct: measure.wastePct, seesCost: false,
  })
  const rateBook = new Map(book.rates.map((r) => [r.code, r]))
  const hours = laborHours(priced.lines.map((l) => ({
    uom: rateBook.get(l.code)?.uom ?? l.uom, qty: l.qty,
  })))

  const crew = crewRows.find((c) => c.name === (booking.crew ?? job?.crew)) ?? null
  const suggested = daysFromHours(hours, crew?.size ?? null)

  const s: any = survey.data ?? null
  const window = digWindow({
    startsOn: booking.starts_on ?? null,
    digFrom: s?.dig_from ?? null,
    locateExpires: s?.locate_expires ?? null,
  })

  /* WHAT TO HAVE ON THE TRUCK. Straight off the priced lines, grouped the way a
     yard is walked rather than the way a bill is written. The last group is the
     one worth having: fabric and posts come off any takeoff, but "bring a rock
     bit" comes from somebody standing on the site three weeks ago, and a crew
     that arrives without it loses the morning. */
  const found = await h().from('fence_survey_condition')
    .select('condition_id, qty, detail').eq('account_id', accountId).eq('job_id', jobId)
  const cat = await h().from('fence_condition')
    .select('id, code, name_en, rate_code, wants_qty')
    .eq('account_id', accountId).eq('active', true).order('sort')
  const conditions = new Map(((cat.data ?? []) as any[]).map((c) => [c.id, c]))

  /* THE BOOK ALREADY GROUPS ITSELF. `fence_rate.grp` is how the rate book is
     organised on the admin screen, so the load list uses it rather than a
     regular expression over rate codes — which is what the first version did,
     and which filed the auger truck under "fabric and rail".

     LABOR IS NOT LOADED ON A TRUCK. Every `kind = 'labor'` line comes off: the
     crew is the labor, and a list of things to bring that includes eight hours
     of installation is a list nobody finishes reading.

     ONE ROW PER THING. The recipe counts concrete against line posts and again
     against corner posts, which is right for a price and wrong for a yard —
     somebody loading a truck wants "39 bags", not two rows of the same bag. So
     the lines merge by rate code and the reasons join. */
  const merged = new Map<string, { name: string; grp: string; uom: string
                                   qty: number; why: string[] }>()
  for (const l of priced.lines) {
    const rate = rateBook.get(l.code)
    if (rate?.kind === 'labor') continue
    const had = merged.get(l.code)
    const why = l.note ?? l.per.replace(/_/g, ' ')
    if (had) {
      had.qty += l.qty
      if (!had.why.includes(why)) had.why.push(why)
      continue
    }
    merged.set(l.code, {
      name: l.name, grp: rate?.grp ?? 'Everything else',
      uom: l.uom ?? rate?.uom ?? '', qty: l.qty, why: [why],
    })
  }

  const load: LoadLine[] = [...merged.values()].map((m) => ({
    group: m.grp,
    name: m.name,
    qty: `${Math.round(m.qty).toLocaleString('en-US')}${m.uom ? ` ${m.uom}` : ''}`,
    from: m.why.join(' · '),
  }))
  for (const f of ((found.data ?? []) as any[])) {
    const c = conditions.get(f.condition_id)
    if (!c) continue
    load.push({
      group: 'Because of what the survey found',
      name: c.name_en,
      qty: f.qty != null ? `${Number(f.qty).toLocaleString('en-US')}` : '—',
      from: f.detail || 'found at the survey',
    })
  }
  /* Read in the order a truck is loaded: what the fence is made of, then what
     holds it up, then what it is dug with — and the survey's own group last,
     because that is the one worth checking twice. */
  const ORDER = ['Fabric', 'Rail', 'Hardware', 'Posts', 'Concrete', 'Gates',
                 'Security line', 'Detection', 'Temporary fence', 'Rental',
                 'Equipment', 'Because of what the survey found']
  const rank = (g: string) => {
    const i = ORDER.indexOf(g)
    return i === -1 ? ORDER.length - 1 : i
  }
  load.sort((a, b) => rank(a.group) - rank(b.group))

  const live = ((links.data ?? []) as any[]).find((l) => !l.revoked) ?? null

  return {
    job, measure, survey: s, crews: crewRows, crew, load,
    booking: {
      startsOn: (booking.starts_on ?? null) as string | null,
      days: booking.days_on_site == null ? null : Number(booking.days_on_site),
      endsOn: (booking.ends_on ?? null) as string | null,
      bookedAt: (booking.booked_at ?? null) as string | null,
      soldPrice: booking.sold_price == null ? null : Number(booking.sold_price),
    },
    hours, suggested, window,
    ticket: live as null | { id: string; token: string; issued_at: string
                            expires_on: string | null; lang: string },
    tickets: ((links.data ?? []) as any[]).length,
  }
}

/** Everything close-out compares against. */
export async function loadCloseout(accountId: string, jobId: string) {
  const db = supabaseServer()
  const h = () => db.schema('hopper')

  const [measure, closeout, built, walked, photos, tasks, jobRow] = await Promise.all([
    loadMeasure(accountId, jobId),
    h().from('fence_closeout')
      .select('id, walked_with, walked_on, they_said, note, price_held, closed_at')
      .eq('account_id', accountId).eq('job_id', jobId).maybeSingle(),
    h().from('fence_closeout_run')
      .select('run_id, built_ft, why')
      .eq('account_id', accountId).eq('job_id', jobId),
    h().from('fence_survey_run')
      .select('run_id, walked_ft')
      .eq('account_id', accountId).eq('job_id', jobId),
    /* THE PHOTOGRAPHS ARE ALREADY ON THE LOG. 0143 gave a note a file, the crew
       ticket writes notes, and the job page already shows them — so close-out
       renders the images off that one stream rather than a second table with a
       second uploader and a second place to look in March. */
    h().from('fence_note')
      .select('id, body, body_en, section, created_at, by_crew, file_name, file_mime')
      .eq('account_id', accountId).eq('job_id', jobId)
      .not('file_path', 'is', null)
      .order('created_at', { ascending: false }),
    h().from('fence_task')
      .select('id, section, en, es, due_on, done, from_plan, needs, done_by, done_at')
      .eq('account_id', accountId).eq('job_id', jobId).eq('section', 'closeout')
      .order('sort'),
    h().from('fence_job')
      .select('sold_price, sold_on, starts_on, ends_on, crew, complete')
      .eq('account_id', accountId).eq('id', jobId).maybeSingle(),
  ])

  const builtBy = new Map(((built.data ?? []) as any[]).map((r) => [r.run_id, r]))
  const walkedBy = new Map(((walked.data ?? []) as any[]).map((r) => [r.run_id, r]))

  /* THE THIRD MEASURE, BESIDE THE OTHER TWO AND NOT OVER THEM. Drawn off a
     photograph, walked at the survey, and built as the ground allowed — and the
     third genuinely differs from the second for reasons nobody could have known,
     like an oak nobody wanted to cut roots off. Each stays where it was made, so
     in November the record still says which number came from where. */
  const runs = measure.runs.map((r) => {
    const w = walkedBy.get(r.id)
    const b = builtBy.get(r.id)
    return {
      id: r.id, label: r.label,
      drawn: Number(r.plan_ft) || 0,
      walked: w?.walked_ft == null ? null : Number(w.walked_ft),
      built: b?.built_ft == null ? null : Number(b.built_ft),
      why: (b?.why ?? null) as string | null,
    }
  })

  const soldFt = runs.reduce((s, r) => s + (r.walked ?? r.drawn), 0)
  const builtFt = runs.reduce((s, r) => s + (r.built ?? 0), 0)
  const anyBuilt = runs.some((r) => r.built != null)

  return {
    job: measure.job, measure, runs,
    closeout: (closeout.data ?? null) as null | {
      id: string; walked_with: string | null; walked_on: string | null
      they_said: string | null; note: string | null
      price_held: boolean | null; closed_at: string | null },
    photos: ((photos.data ?? []) as any[])
      .filter((n) => String(n.file_mime ?? '').startsWith('image/'))
      .map((n) => ({
        id: n.id as string,
        section: (n.section ?? null) as Section | null,
        // Close-out is not the crew's own step, so the caption reads in English.
        caption: ((n.body_en ?? n.body) ?? null) as string | null,
        takenBy: (n.by_crew ?? null) as string | null,
        name: (n.file_name ?? 'photograph') as string,
        createdAt: n.created_at as string,
      })),
    tasks: ((tasks.data ?? []) as any[]),
    soldFt, builtFt, anyBuilt,
    short: anyBuilt ? Math.round((builtFt - soldFt) * 10) / 10 : 0,
    sold: {
      price: (jobRow.data as any)?.sold_price == null
        ? null : Number((jobRow.data as any).sold_price),
      on: ((jobRow.data as any)?.sold_on ?? null) as string | null,
      crew: ((jobRow.data as any)?.crew ?? null) as string | null,
      startsOn: ((jobRow.data as any)?.starts_on ?? null) as string | null,
      endsOn: ((jobRow.data as any)?.ends_on ?? null) as string | null,
      complete: !!(jobRow.data as any)?.complete,
    },
  }
}

export { endsOn }
