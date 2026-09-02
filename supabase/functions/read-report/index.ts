/**
 * read-report — the thing that actually goes and looks.
 *
 * A report in Hopper is a pointer, not data: a source, one named tab inside it,
 * and a schedule. This is the only code that dereferences that pointer. It runs
 * here, as an edge function, rather than in the Next app for one reason worth
 * stating: the app deliberately holds no service-role key — every query it makes
 * goes through the caller's own session so RLS is the single answer to "what may
 * this person see". Writing readings needs to reach past RLS (nobody may
 * fabricate a number by hand, so `reading` and `report_check` have no INSERT
 * policy at all), and the place to hold a key that can do that is here, next to
 * the data, not in a web server.
 *
 * Three ways in:
 *
 *   POST { report_id }   a person pressed Refresh. Their JWT comes with it, and
 *                        it decides whether they were allowed to ask: the report
 *                        is re-read through THEIR token, so a report they cannot
 *                        see is a report they cannot refresh. Only then does the
 *                        service client do the writing.
 *
 *   POST { peek }        the add form, looking before it saves. Reads and
 *                        returns; writes nothing.
 *
 *   POST { due: true }   the schedule. Called by pg_cron, proving itself with a
 *                        secret the DATABASE generated and nobody has ever seen
 *                        — no key was copied out of a dashboard to make this
 *                        work. It takes its list from hopper.cron_sweep_due(),
 *                        so "when is this due" is answered in one place, the
 *                        database, rather than half here and half there.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const URL_ = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** How many rows we keep. Hopper is not a copy of your spreadsheet and must not
 *  grow into one; the card and the table both read from what is kept, and the
 *  table says so when it has been cut. */
const KEEP = 500

/** How many reports one sweep will read. An edge function has a wall clock, and
 *  anything not reached is still due fifteen minutes from now. */
const SWEEP_MAX = 25

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hopper-cron',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------- the source

type Col = { key: string; label: string; type: 'text' | 'number' | 'date' }
type Sheet = { columns: Col[]; rows: (string | number | null)[][] }

/**
 * Pull the spreadsheet id and the tab's gid out of whatever was pasted.
 * People paste the whole address bar, including `#gid=0`, which is where the
 * gid lives on a normal share link.
 */
function googleParts(url: string) {
  const id = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null
  const gid = url.match(/[#&?]gid=([0-9]+)/)?.[1] ?? null
  return { id, gid }
}

/**
 * The free door: the visualization endpoint. It answers for any link-shared
 * sheet with no credential at all, which is why it is tried first and why a key
 * is never the price of admission to a public sheet — the mistake the first
 * version made.
 *
 * A sheet that is NOT shared answers with Google's sign-in HTML instead of the
 * wrapped JSON, and that is the tell: the wrapper is missing, so we say "not
 * shared" rather than "couldn't reach Google".
 */
async function readGoogle(url: string, tab: string | null): Promise<Sheet> {
  const { id, gid } = googleParts(url)
  if (!id) throw new Fail('bad_url', 'That does not look like a Google Sheets address.')

  // headers=1 rather than letting Google guess where the header row is. The
  // whole model assumes one — the column names ARE the header row — and a guess
  // that changes when somebody types a number into row 1 is a report that
  // renames its own columns.
  const q = new URLSearchParams({ tqx: 'out:json', headers: '1' })
  if (tab) q.set('sheet', tab)
  else if (gid) q.set('gid', gid)

  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${q}`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Hopper/1.0 (+https://oh.hihopper.app)' },
  })
  const text = await res.text()

  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (!text.startsWith('/*O_o*/') || open < 0 || close < 0) {
    // Two different problems that both arrive as HTML, told apart so the person
    // reading the message knows whether to fix the address or the sharing.
    if (res.status === 404) {
      throw new Fail('no_sheet', 'There is no sheet at that address.')
    }
    throw new Fail('not_shared',
      'The sheet is not shared. In Google Sheets: Share → General access → Anyone with the link → Viewer.')
  }

  let body: any
  try { body = JSON.parse(text.slice(open, close + 1)) }
  catch { throw new Fail('unreadable', 'Google answered with something that was not a table.') }

  if (body.status === 'error') {
    const e = body.errors?.[0] ?? {}
    const detail: string = e.detailed_message ?? e.message ?? 'Google refused the request.'
    // The one that bites most often, said plainly instead of in Google's words.
    if (/invalid.*sheet|unknown sheet|could not find/i.test(detail)) {
      throw new Fail('no_such_tab',
        `There is no tab called “${tab}” in that sheet. Tab names are case-sensitive.`)
    }
    throw new Fail('refused', strip(detail))
  }

  const t = body.table
  if (!t?.cols?.length) throw new Fail('empty', 'That tab has no columns in it.')

  const columns: Col[] = t.cols.map((c: any, i: number) => ({
    key: c.id || `c${i}`,
    label: (c.label || '').trim() || c.id || `Column ${i + 1}`,
    type: c.type === 'number' ? 'number'
        : (c.type === 'date' || c.type === 'datetime') ? 'date' : 'text',
  }))

  const rows = (t.rows ?? []).map((r: any) =>
    columns.map((_, i) => cell(r.c?.[i], columns[i].type)))

  return { columns, rows }
}

/**
 * gviz hands dates back as the literal string `Date(2026,7,30)` — a JavaScript
 * constructor call, months zero-based — which is not a date any database will
 * take. It becomes an ISO day here, once, so nothing downstream has to know
 * this.
 */
function cell(c: any, type: Col['type']): string | number | null {
  if (c == null || c.v == null || c.v === '') return null
  if (type === 'number') {
    const n = typeof c.v === 'number' ? c.v : Number(String(c.v).replace(/[^0-9.eE+-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  if (type === 'date') {
    const m = String(c.v).match(/^Date\((\d+),(\d+),(\d+)/)
    if (m) {
      const [, y, mo, d] = m
      return `${y}-${String(+mo + 1).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
    }
    return c.f ?? String(c.v)
  }
  return c.f ?? String(c.v)
}

const strip = (s: string) => s.replace(/<[^>]*>/g, '').trim().slice(0, 400)

class Fail extends Error {
  constructor(public code: string, message: string) { super(message) }
}

// ---------------------------------------------------------------- the writing

/**
 * What a look produces: the rows as they came back, and one reading per date
 * per measure. The readings are the series the card draws; the rows are what
 * you open when you want to argue with it.
 */
async function store(admin: any, rep: any, sheet: Sheet) {
  const kept = sheet.rows.slice(-KEEP)

  await admin.schema('hopper').from('report_rows').upsert({
    report_id: rep.report_id ?? rep.id,
    account_id: rep.account_id,
    columns: sheet.columns,
    rows: kept,
    row_count: sheet.rows.length,
    truncated: sheet.rows.length > kept.length,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'report_id' })

  const id = rep.report_id ?? rep.id
  const dateCol = rep.date_column as string | null
  const measures: string[] = rep.chart_measures ?? []

  // No date column, or no measure chosen yet, means there is no series to keep.
  // That is not a failure — a report registered ten seconds ago is in exactly
  // this state — so the rows are stored and the check still reads ok.
  if (!dateCol || measures.length === 0) return { readings: 0 }

  const di = sheet.columns.findIndex((c) => c.key === dateCol || c.label === dateCol)
  if (di < 0) throw new Fail('no_date_column',
    `The sheet no longer has a “${dateCol}” column to date the rows by.`)

  const out: any[] = []
  for (const m of measures) {
    const mi = sheet.columns.findIndex((c) => c.key === m || c.label === m)
    if (mi < 0) continue
    // Last write per (date, measure) wins, which is what a sheet means when the
    // same day appears twice: the lower row is the correction.
    const byDay = new Map<string, number>()
    for (const r of kept) {
      const d = r[di], v = r[mi]
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) continue
      if (typeof v !== 'number') continue
      byDay.set(d.slice(0, 10), v)
    }
    for (const [day, value] of byDay) {
      out.push({
        account_id: rep.account_id, report_id: id,
        observed_on: day, measure: sheet.columns[mi].label, value,
        last_seen: new Date().toISOString(),
      })
    }
  }

  if (out.length) {
    await admin.schema('hopper').from('reading')
      .upsert(out, { onConflict: 'report_id,measure,observed_on' })
  }
  return { readings: out.length }
}

/** One report, start to finish. Never throws — a failure is a result. */
async function look(admin: any, rep: any) {
  const id = rep.report_id ?? rep.id
  const started = Date.now()
  try {
    if (rep.source_kind !== 'google_sheet') {
      throw new Fail('unsupported', `Hopper cannot read a ${rep.source_kind} source yet.`)
    }
    const sheet = await readGoogle(rep.source_url, rep.source_tab)
    const { readings } = await store(admin, rep, sheet)

    await admin.schema('hopper').from('report_check').insert({
      account_id: rep.account_id, report_id: id, ok: true, failure: null,
      row_count: sheet.rows.length, took_ms: Date.now() - started,
    })
    return { report_id: id, ok: true, rows: sheet.rows.length, readings }
  } catch (err) {
    const failure = err instanceof Fail ? err.message : String((err as Error)?.message ?? err)
    // A failed look is KEPT as a failure rather than overwriting the last good
    // number. The card goes on showing what it last knew, and says it is behind.
    await admin.schema('hopper').from('report_check').insert({
      account_id: rep.account_id, report_id: id, ok: false,
      failure: failure.slice(0, 500), row_count: null, took_ms: Date.now() - started,
    })
    return { report_id: id, ok: false, failure }
  }
}

// ---------------------------------------------------------------- the door

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })
  let body: any = {}
  try { body = await req.json() } catch { /* an empty body is the due sweep */ }

  // ---- the schedule
  if (body.due) {
    // Two ways to be the sweep. pg_cron sends the shared secret; a person
    // invoking it by hand from the dashboard sends the service key. Anything
    // else is refused before a single outbound fetch is made, because an open
    // sweep is an open invitation to make this server fetch things all day.
    const nonce = req.headers.get('x-hopper-cron')
    const auth = req.headers.get('Authorization') ?? ''
    let allowed = auth === `Bearer ${SERVICE}`
    if (!allowed && nonce) {
      const { data: ok } = await admin.schema('hopper').rpc('cron_check', { candidate: nonce })
      allowed = ok === true
    }
    if (!allowed) return json({ error: 'The sweep is not open to callers.' }, 403)

    // hopper.cron_sweep_due and not internal.hopper_reports_due: PostgREST is
    // configured for public, graphql_public, beebee, site and hopper, so the
    // internal schema is unreachable from out here by design. The door is in
    // hopper and is open to the service role only.
    const { data: due, error } = await admin.schema('hopper').rpc('cron_sweep_due')
    if (error) return json({ error: error.message }, 500)

    // A bounded batch. An edge function has a wall clock, and thirty slow
    // sheets in one call is a sweep that dies halfway and leaves no record of
    // the half it did. Whatever is left is still due on the next knock.
    const batch = (due ?? []).slice(0, SWEEP_MAX)
    const results = []
    for (const rep of batch) results.push(await look(admin, rep))
    return json({ looked: results.length, left: Math.max(0, (due ?? []).length - batch.length), results })
  }

  // ---- the form, looking before it saves
  //
  // "What came back" is a step of its own on the add form because that is
  // exactly where a wrong tab, or a header row that is really data, gets
  // caught -- it used to be caught after the save. It reads through the SAME
  // parser the scheduled look uses, deliberately: a preview drawn by a second
  // implementation is a preview that can disagree with what gets stored, and
  // then the form has lied. Nothing is written here.
  if (body.peek) {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Not signed in.' }, 401)
    const who = createClient(URL_, ANON, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    })
    const { data: { user } } = await who.auth.getUser()
    if (!user) return json({ error: 'Not signed in.' }, 401)

    try {
      const sheet = await readGoogle(body.peek.url ?? '', body.peek.tab ?? null)
      return json({
        ok: true,
        columns: sheet.columns,
        rows: sheet.rows.slice(0, 8),
        row_count: sheet.rows.length,
      })
    } catch (err) {
      return json({ ok: false, failure: err instanceof Fail ? err.message : String(err) })
    }
  }

  // ---- somebody pressed Refresh
  if (!body.report_id) return json({ error: 'Which report?' }, 400)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Not signed in.' }, 401)

  // Their token, their answer. RLS decides whether this report exists for them;
  // if it does not, the reply is the same as for a report that does not exist,
  // because a locked door is still a door somebody can see.
  const asUser = createClient(URL_, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })
  const { data: rep } = await asUser.schema('hopper').from('report')
    .select('id, account_id, source_kind, source_url, source_tab, date_column, chart_measures')
    .eq('id', body.report_id).maybeSingle()
  if (!rep) return json({ error: 'No such report.' }, 404)

  const result = await look(admin, rep)
  return json(result)
})
