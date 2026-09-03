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

/**
 * Google, for sheets that are NOT shared with anyone holding the link.
 *
 * Absent until somebody sets them, and everything below degrades to "Google is
 * not connected" rather than throwing -- a Hopper with no Google client is the
 * normal state, not a broken one.
 */
const G_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const G_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const G_REDIRECT = Deno.env.get('GOOGLE_REDIRECT_URI') ?? ''

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
type Sheet = { columns: Col[]; rows: (string | number | null)[][]; capped?: boolean }

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
/**
 * How many rows a look ever asks Google for.
 *
 * The reader used to ask for the tab and get the tab: a 5.8 MB spreadsheet
 * comes back as tens of megabytes of JSON, which is more than an edge worker
 * has, and the worker was killed for it -- a 546 with no message in it, which
 * arrived in the form as "Hopper could not read that." The size of somebody's
 * spreadsheet is not something Hopper gets to have an opinion about; how much
 * of it Hopper drags across the internet is.
 */
const ASK = KEEP
const PEEK_ROWS = 200

/** Bytes of gviz JSON we will hold. Well past ASK rows of anything sane, and
 *  a wall rather than a worker dying without saying why. */
const GVIZ_MAX = 12 * 1024 * 1024

/** Read a body, and stop reading it if it will not fit. */
async function capped(res: Response, max: number): Promise<string> {
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let out = '', n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > max) {
      await reader.cancel().catch(() => {})
      throw new Fail('too_big',
        'That tab is bigger than Hopper will read in one go. Give the report a date column and Hopper will ask Google for the most recent rows instead of all of them.')
    }
    out += dec.decode(value, { stream: true })
  }
  return out + dec.decode()
}

/**
 * One request to the visualization endpoint, bounded in time and in bytes.
 *
 * `tq` is the Google Visualization query -- the reason this is worth having:
 * the endpoint will do `order by` and `limit` at Google's end, so Hopper can
 * ask for five hundred rows out of forty thousand instead of receiving forty
 * thousand and throwing most of them away.
 */
async function gviz(id: string, tab: string | null, gid: string | null, tq: string) {
  const q = new URLSearchParams({ tqx: 'out:json', headers: '1', tq })
  if (tab) q.set('sheet', tab)
  else if (gid) q.set('gid', gid)

  let res: Response
  try {
    res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${q}`, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Hopper/1.0 (+https://oh.hihopper.app)' },
      signal: AbortSignal.timeout(25_000),
    })
  } catch (e) {
    if (e instanceof Fail) throw e
    throw new Fail('unreachable', (e as Error)?.name === 'TimeoutError'
      ? 'Google took more than twenty-five seconds to answer for that tab.'
      : 'Hopper could not reach Google.')
  }
  return { text: await capped(res, GVIZ_MAX), status: res.status }
}

/** The wrapped JSON turned into columns and rows, or a sentence about why not. */
function fromGviz(answer: { text: string; status: number }, tab: string | null): Sheet {
  const { text, status } = answer
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (!text.startsWith('/*O_o*/') || open < 0 || close < 0) {
    // Two different problems that both arrive as HTML, told apart so the person
    // reading the message knows whether to fix the address or the sharing.
    if (status === 404) throw new Fail('no_sheet', 'There is no sheet at that address.')
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
 * The free door: the visualization endpoint. It answers for any link-shared
 * sheet with no credential at all, which is why it is tried first and why a key
 * is never the price of admission to a public sheet — the mistake the first
 * version made.
 *
 * Two hops, not one, and the first is the cheap one.
 *
 *   1. `limit 1` — a few hundred bytes whatever the sheet weighs. It comes back
 *      with every column: its letter, its heading and its type. That is what
 *      makes the second hop askable.
 *   2. the rows. When the report already knows which column dates it, Google is
 *      asked to sort by that column DESCENDING and hand back the newest five
 *      hundred, which are then flipped back into reading order. Hopper keeps
 *      five hundred rows either way; the difference is whether they are the
 *      five hundred that matter or the five hundred at the top of the sheet.
 *
 * headers=1 rather than letting Google guess where the header row is. The whole
 * model assumes one — the column names ARE the header row — and a guess that
 * changes when somebody types a number into row 1 is a report that renames its
 * own columns.
 */
async function readGoogle(
  url: string, tab: string | null,
  opts: { limit?: number; dateKey?: string | null } = {},
): Promise<Sheet> {
  const { id, gid } = googleParts(url)
  if (!id) throw new Fail('bad_url', 'That does not look like a Google Sheets address.')

  const limit = opts.limit ?? ASK
  const head = fromGviz(await gviz(id, tab, gid, 'limit 1'), tab)

  // Only a real column letter is ever interpolated into the query. gviz names
  // columns A, B, C -- anything else is not a reference this endpoint knows,
  // and pasting an unknown string into a query language is how a query language
  // becomes an injection.
  const found = opts.dateKey
    ? head.columns.find((c) => c.key === opts.dateKey || c.label === opts.dateKey)?.key
    : undefined
  const dateId = found && /^[A-Z]{1,3}$/.test(found) ? found : null

  const answer = fromGviz(
    await gviz(id, tab, gid,
      dateId ? `select * order by ${dateId} desc limit ${limit}` : `limit ${limit}`),
    tab)

  const rows = dateId ? answer.rows.slice().reverse() : answer.rows
  return {
    columns: answer.columns.length ? answer.columns : head.columns,
    rows,
    // Exactly as many as we asked for almost certainly means there were more.
    capped: rows.length >= limit,
  }
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

/**
 * Every tab in a Google sheet, without a key.
 *
 * The form used to ask people to TYPE the tab name, case-sensitive, and said
 * so in its own hint -- a form asking somebody to be a database. It could not
 * do better because the visualization endpoint reads one NAMED tab and cannot
 * list them; the Sheets API can list them and wants a key.
 *
 * The way through is the workbook itself. `export?format=xlsx` answers for any
 * link-shared sheet with no credential -- the same open door gviz uses -- and
 * an xlsx is a zip whose `xl/workbook.xml` names every sheet in order.
 * Verified against a real link-shared workbook before this was written: four
 * tabs, read anonymously.
 *
 * Names only. Hopper does not want the workbook and must not become a copy of
 * one, so the single entry is inflated and everything else is dropped.
 */
async function googleTabs(url: string): Promise<string[]> {
  const { id } = googleParts(url)
  if (!id) throw new Fail('not_a_sheet', 'That is not a Google Sheets address.')

  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, {
    redirect: 'follow', signal: AbortSignal.timeout(12_000),
  })
  // Names only, so a workbook big enough to matter is not worth the download.
  // The timeout alone is not a size limit -- a fast connection will happily
  // pull sixty megabytes inside twelve seconds.
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > 24 * 1024 * 1024) {
    throw new Fail('too_big',
      'That workbook is too large for Hopper to list its tabs. Type the tab name instead.')
  }
  // Google answers a sheet you may not read with its SIGN-IN PAGE rather than
  // a 403, so the content type is what says whether we were let in.
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || /text\/html/i.test(type)) {
    throw new Fail('not_shared',
      'The sheet is not shared. In Google Sheets: Share → General access → Anyone with the link → Viewer.')
  }

  const buf = new Uint8Array(await res.arrayBuffer())
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

  // The central directory at the TAIL, not the local headers. Google streams
  // the zip, so every local header carries size 0 and defers to a data
  // descriptor -- walking from the front stops after one entry, which is
  // exactly how the first attempt at this quietly found nothing.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Fail('unreadable', 'Google answered with something that was not a workbook.')

  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  let wb: { method: number; csize: number; lho: number } | null = null
  for (let n = 0; n < count && !wb; n++) {
    const nlen = dv.getUint16(p + 28, true)
    const elen = dv.getUint16(p + 30, true)
    const clen = dv.getUint16(p + 32, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen))
    if (name === 'xl/workbook.xml') {
      wb = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true),
             lho: dv.getUint32(p + 42, true) }
    }
    p += 46 + nlen + elen + clen
  }
  if (!wb) throw new Fail('unreadable', 'That workbook has no sheet list in it.')

  const ln = dv.getUint16(wb.lho + 26, true), le = dv.getUint16(wb.lho + 28, true)
  const at = wb.lho + 30 + ln + le
  const data = buf.subarray(at, at + wb.csize)
  const xml = wb.method === 0
    ? new TextDecoder().decode(data)
    : await new Response(
        new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
      ).text()

  // Every sheet the workbook declares, with the state it declares it in.
  // Attribute order is not guaranteed -- Google writes state first and Excel
  // writes name first -- so the tag is matched whole and each attribute read
  // out of it, rather than assuming a running order.
  const all = [...xml.matchAll(/<sheet\s[^>]*?\/>/g)].map((m) => {
    const tag = m[0]
    const raw = tag.match(/\sname="([^"]*)"/)?.[1] ?? ''
    return {
      name: raw
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'),
      state: tag.match(/\sstate="([^"]*)"/)?.[1] ?? 'visible',
    }
  }).filter((t) => t.name !== '')

  if (all.length === 0) throw new Fail('unreadable', 'That workbook names no sheets.')

  // A hidden tab is one somebody took out of their own picker; offering it back
  // in Hopper's is Hopper overriding that decision on their behalf. If hiding
  // leaves nothing at all the whole workbook is hidden, and an empty list is a
  // worse answer than a full one -- so that case falls back to everything.
  const shown = all.filter((t) => t.state === 'visible')
  return (shown.length ? shown : all).map((t) => t.name)
}

// ------------------------------------------------------- the private door

/**
 * Reading a sheet nobody may open without signing in.
 *
 * The open door -- gviz, and the xlsx export -- works because a link-shared
 * sheet is readable by nobody in particular. A private sheet is readable by a
 * PERSON, so Hopper has to be one, which means holding a token, which is the
 * thing this codebase says it does not do. The exception is scoped by the scope
 * itself: drive.file is not "read my Drive", it is "read the files I handed you
 * through the picker", so this can only ever open sheets somebody explicitly
 * chose.
 *
 * A refresh token is long-lived and an access token is not, so the refresh
 * token stays in Vault and an access token is minted per call and never stored.
 * One fewer thing that can leak, and nothing to expire in a row somewhere.
 */
async function googleAccessToken(admin: any, accountId: string): Promise<string> {
  if (!G_ID || !G_SECRET) {
    throw new Fail('no_google', 'Google is not connected to Hopper yet.')
  }
  const { data: refresh } = await admin.schema('hopper').rpc('google_token', { p_account: accountId })
  if (!refresh) {
    throw new Fail('not_connected',
      'This account has not connected Google, so Hopper cannot open a private sheet.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: G_ID, client_secret: G_SECRET,
      refresh_token: refresh, grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    // A revoked or expired grant is a BROKEN connection, not a stale report, so
    // it is written down against the connection rather than left for somebody
    // to infer from every report going quiet at once.
    const why = body.error_description ?? body.error ?? `Google answered ${res.status}`
    await admin.schema('hopper').rpc('google_failed', { p_account: accountId, p_why: String(why) })
    throw new Fail('google_refused',
      /invalid_grant/.test(String(body.error))
        ? 'Google has revoked Hopper’s access. Connect Google again in Admin.'
        : `Google refused to renew the connection: ${why}`)
  }
  return body.access_token as string
}

/** Every tab in a private sheet, straight from the Sheets API. */
async function googleTabsPrivate(admin: any, accountId: string, fileId: string): Promise<string[]> {
  const token = await googleAccessToken(admin, accountId)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}`
    + '?fields=sheets.properties(title,hidden)',
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Fail('google_refused', gErr(body, res.status))

  const all = (body.sheets ?? []).map((sh: any) => ({
    title: String(sh?.properties?.title ?? ''),
    hidden: sh?.properties?.hidden === true,
  })).filter((t: any) => t.title !== '')
  if (all.length === 0) throw new Fail('empty', 'That spreadsheet has no tabs in it.')
  // Same rule as the open door: a hidden tab is one its owner took out of a
  // picker already.
  const shown = all.filter((t: any) => !t.hidden)
  return (shown.length ? shown : all).map((t: any) => t.title)
}

/**
 * A private sheet's rows.
 *
 * Values, not the grid: `values.get` hands back exactly the cells with anything
 * in them, which is the same shape gviz gives and lets one typing pass serve
 * both doors. UNFORMATTED_VALUE so a currency column arrives as a number rather
 * than as "$16,785" -- the formatting is the spreadsheet's opinion, and Hopper
 * is after the figure.
 */
async function readGooglePrivate(
  admin: any, accountId: string, fileId: string, tab: string | null,
): Promise<Sheet> {
  const token = await googleAccessToken(admin, accountId)
  const which = tab ?? (await googleTabsPrivate(admin, accountId, fileId))[0]

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}`
    + `/values/${encodeURIComponent(which)}`
    + '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING',
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Fail('google_refused', gErr(body, res.status))

  const values: any[][] = body.values ?? []
  if (values.length === 0) throw new Fail('empty', `The tab “${which}” is empty.`)

  const head = values[0].map((h: any, i: number) =>
    String(h ?? '').trim() || `Column ${i + 1}`)
  const columns: Col[] = head.map((label, i) => ({ key: `c${i}`, label, type: 'text' }))
  // Padded to the header's width: the API stops each row at its last non-empty
  // cell, so a row ending in blanks arrives short and would otherwise shift
  // every column after it.
  const rows = values.slice(1)
    .filter((r) => r.some((v) => String(v ?? '').trim() !== ''))
    .map((r) => columns.map((_, i) => String(r[i] ?? '').trim()))

  await admin.schema('hopper').from('google_grant')
    .update({ last_used: new Date().toISOString() }).eq('account_id', accountId)

  // Through the SAME typing pass the other doors use, so a private sheet and a
  // shared one cannot disagree about what a column is.
  return typed(columns, rows)
}

/** Google's error wording, unwrapped, without the HTML it sometimes arrives in. */
function gErr(body: any, status: number) {
  const m = body?.error?.message ?? body?.error_description ?? body?.error
  if (typeof m === 'string' && m) {
    if (/not found/i.test(m)) {
      return 'Google cannot find that spreadsheet, or it is no longer one of the files you picked.'
    }
    if (/permission|forbidden/i.test(m)) {
      return 'Google will not open that file for Hopper. Pick it again so the connection covers it.'
    }
    return strip(m)
  }
  return `Google answered ${status}.`
}

// ------------------------------------------------------- anything at a URL

/** A source that is not a spreadsheet is still a table, so it stops being
 *  anything else as early as possible and becomes columns and rows. */
const LINK_MAX = 8 * 1024 * 1024   // eight megabytes of text is already 500x KEEP

/**
 * A link is any https address that answers with a table.
 *
 * Deliberately not "a CSV endpoint" or "a JSON API": the useful thing is that
 * an export URL, a published sheet from a vendor who is not Google, and a small
 * internal endpoint are all the same shape once they arrive. So the content
 * type is a hint and the body is the evidence -- servers mislabel CSV as
 * text/plain and JSON as text/html often enough that trusting the header alone
 * would refuse things that work.
 *
 * No credentials, ever. Hopper does not hold somebody's API key and replay it,
 * because a stored credential is a thing that leaks and a thing that outlives
 * the person who added it. A source that needs a key needs a proper connector,
 * which is what the airtable and microsoft kinds are for.
 */
async function readLink(url: string, tab: string | null): Promise<Sheet> {
  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Hopper/1.0 (+https://oh.hihopper.app)', Accept: 'text/csv, application/json;q=0.9, */*;q=0.5' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new Fail('unreachable',
      (e as Error)?.name === 'TimeoutError'
        ? 'That address took more than twenty seconds to answer.'
        : 'Hopper could not reach that address.')
  }

  if (res.status === 401 || res.status === 403) {
    throw new Fail('not_shared',
      'That address needs a sign-in. Hopper reads it as nobody in particular, so it has to be readable without one.')
  }
  if (res.status === 404) throw new Fail('no_source', 'There is nothing at that address.')
  if (!res.ok) throw new Fail('refused', `That address answered ${res.status}.`)

  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  const size = Number(res.headers.get('content-length') ?? 0)
  if (size > LINK_MAX) {
    throw new Fail('too_big', 'That file is larger than Hopper will read. Export a narrower range.')
  }
  if (/^(image|video|audio)\//.test(type) || type.includes('pdf')) {
    throw new Fail('not_a_table', `That address answers with ${type.split(';')[0]}, which is not a table.`)
  }

  const text = await res.text()
  if (text.length > LINK_MAX) {
    throw new Fail('too_big', 'That file is larger than Hopper will read. Export a narrower range.')
  }
  return parseTable(text, type, tab)
}

/**
 * Text to table, whatever the text is.
 *
 * Shared by the link kind and by a snapshot somebody uploaded or pasted, so a
 * pasted CSV and a fetched one cannot end up shaped differently -- which they
 * would within a week if this existed twice.
 */
function parseTable(text: string, contentType = '', tab: string | null = null): Sheet {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Fail('empty', 'There was nothing in it.')

  const looksJson = trimmed.startsWith('[') || trimmed.startsWith('{')
  if (contentType.includes('json') || looksJson) {
    try { return fromJson(JSON.parse(trimmed), tab) }
    catch (e) {
      if (e instanceof Fail) throw e
      // A JSON content type that is not JSON is worth saying so plainly; a
      // body that merely started with a brace falls through to the CSV reader.
      if (contentType.includes('json')) {
        throw new Fail('unreadable', 'That address said it was JSON and sent something else.')
      }
    }
  }
  if (/<html|<!doctype/i.test(trimmed.slice(0, 200))) {
    throw new Fail('not_a_table',
      'That address answers with a web page rather than a file. If it is a sheet, use its export or publish-to-web address.')
  }
  return fromDelimited(trimmed)
}

/** Comma, semicolon, tab or pipe -- whichever divides the header most evenly. */
function sniff(line: string): string {
  const counts = [',', ';', '\t', '|'].map((d) => ({ d, n: countOutsideQuotes(line, d) }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].d : ','
}
function countOutsideQuotes(line: string, d: string) {
  let n = 0, inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i + 1] === '"') i++; else inQ = !inQ }
    else if (c === d && !inQ) n++
  }
  return n
}

/**
 * RFC 4180 rather than split(','), because the first address anybody pastes has
 * a company name with a comma in it and a quoted field with a newline inside.
 * Splitting on the delimiter gets both wrong and gets them wrong quietly --
 * columns shift by one and every number below lands under the wrong heading.
 */
function fromDelimited(text: string): Sheet {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  /**
   * A header with no delimiter in it is a file with one column, and a
   * one-column file must not be split at all. Defaulting to a comma there cut
   * "Aug 8, 2026" in half and threw the year away -- silently, because the
   * extra field had no column to land in. Found by a test, which is the only
   * way this is ever found: the file still parses, it just quietly loses the
   * back half of every value that contains a comma.
   */
  const d = countOutsideQuotes(firstLine, sniff(firstLine)) > 0 ? sniff(firstLine) : '\u0000'

  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === d) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  const head = rows.shift()
  if (!head?.length) throw new Fail('empty', 'There was no header row in it.')

  const columns: Col[] = head.map((h, i) => ({
    key: `c${i}`,
    label: h.trim() || `Column ${i + 1}`,
    type: 'text',
  }))

  // Ragged rows are normal in exported files: a trailing empty column, or a
  // last line with nothing on it. Padded rather than refused.
  const body = rows
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => columns.map((_, i) => (r[i] ?? '').trim()))

  return typed(columns, body)
}

/** An array of objects, an array of arrays, or one of those inside a wrapper. */
function fromJson(j: any, tab: string | null): Sheet {
  let arr: any = j
  if (!Array.isArray(arr)) {
    // A named tab picks the key when the body is an object of tables; otherwise
    // the first array-valued key wins, which is what every "data"/"rows"/
    // "results" envelope actually means.
    if (tab && Array.isArray(j?.[tab])) arr = j[tab]
    else {
      const key = ['data', 'rows', 'results', 'records', 'items', 'values']
        .find((k) => Array.isArray(j?.[k]))
        ?? Object.keys(j ?? {}).find((k) => Array.isArray(j[k]))
      arr = key ? j[key] : null
    }
  }
  if (!Array.isArray(arr)) throw new Fail('not_a_table', 'That JSON has no list of rows in it.')
  if (arr.length === 0) throw new Fail('empty', 'That list is empty.')

  if (Array.isArray(arr[0])) {
    const head = arr[0].map((h: any, i: number) => ({
      key: `c${i}`, label: String(h ?? '').trim() || `Column ${i + 1}`, type: 'text' as const,
    }))
    return typed(head, arr.slice(1).map((r: any[]) => head.map((_, i) => str(r[i]))))
  }

  if (typeof arr[0] !== 'object' || arr[0] === null) {
    throw new Fail('not_a_table', 'That list holds values rather than rows.')
  }

  // Every key any row has, in the order they were first seen. Union rather than
  // the first row's keys, because a field that is absent on row one and present
  // on row two is a column somebody will look for.
  const keys: string[] = []
  for (const r of arr.slice(0, 200)) {
    for (const k of Object.keys(r ?? {})) if (!keys.includes(k)) keys.push(k)
  }
  const columns: Col[] = keys.map((k, i) => ({ key: `c${i}`, label: k, type: 'text' }))
  return typed(columns, arr.map((r: any) => keys.map((k) => str(r?.[k]))))
}

const str = (v: any): string =>
  v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/**
 * What each column IS, decided by every value in it rather than the first one.
 *
 * A column is a number only if every value that is present parses as one --
 * one "n/a" in a thousand rows makes it text, which is right: a column Hopper
 * would silently turn into nulls is worse than a column it treats as words.
 * Same for dates, and the accepted shapes are the unambiguous ones only. There
 * is no way to tell 03/04/2026 apart from itself, so it stays text rather than
 * being guessed at and being wrong for half the world.
 */
const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+)?(?:Z|[+-]\d{2}:?\d{2})?$/
const DMY = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})$/i
const MDY = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}),? (\d{4})$/i
const MONTH = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

function typed(columns: Col[], rows: string[][]): Sheet {
  const out: (string | number | null)[][] = rows.map((r) => [...r])

  columns.forEach((col, i) => {
    const seen = rows.map((r) => (r[i] ?? '').trim()).filter((v) => v !== '')
    if (seen.length === 0) return

    if (seen.every(isNumber)) {
      col.type = 'number'
      out.forEach((r, ri) => { r[i] = toNumber(String(rows[ri][i] ?? '')) })
      return
    }
    if (seen.every((v) => isoDay(v) !== null)) {
      col.type = 'date'
      out.forEach((r, ri) => { r[i] = isoDay(String(rows[ri][i] ?? '')) })
      return
    }
    out.forEach((r, ri) => { r[i] = (rows[ri][i] ?? '').trim() || null })
  })

  return { columns, rows: out }
}

/** Money and thousands separators are how a number arrives in a real export. */
const isNumber = (v: string) => toNumber(v) !== null
function toNumber(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const neg = /^\(.*\)$/.test(t)                       // (1,234) is accounting for -1234
  const bare = t.replace(/^\(|\)$/g, '').replace(/[$£€,\s]/g, '').replace(/%$/, '')
  if (!/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(bare)) return null
  const n = Number(bare)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

function isoDay(v: string): string | null {
  const t = v.trim()
  if (ISO.test(t)) return t.slice(0, 10)
  const a = t.match(DMY)
  if (a) return `${a[3]}-${String(MONTH.indexOf(a[2].toLowerCase().slice(0,3)) + 1).padStart(2,'0')}-${a[1].padStart(2,'0')}`
  const b = t.match(MDY)
  if (b) return `${b[3]}-${String(MONTH.indexOf(b[1].toLowerCase().slice(0,3)) + 1).padStart(2,'0')}-${b[2].padStart(2,'0')}`
  return null
}



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
    truncated: sheet.capped === true || sheet.rows.length > kept.length,
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
    // A snapshot is not looked at again -- it was stored when it was given, and
    // the constraint on hopper.report already says a snapshot carries no
    // schedule. Reaching here means somebody asked for a refresh anyway.
    if (rep.source_kind === 'upload' || rep.source_kind === 'paste') {
      throw new Fail('snapshot',
        'This report is a snapshot of what was handed to Hopper, so there is nowhere to go back to. Replace it to change the figures.')
    }
    if (rep.source_kind === 'airtable' || rep.source_kind === 'microsoft') {
      throw new Fail('unsupported',
        `Hopper cannot read a ${rep.source_kind === 'airtable' ? 'Airtable' : 'Microsoft'} source yet.`)
    }
    // A file id means this report was PICKED rather than pasted, so it is read
    // through the account's Google connection. No id means the sheet is open to
    // anyone with the link and is read with no credential at all -- which is
    // still the normal case and still the one to prefer.
    const sheet = rep.google_file_id
      ? await readGooglePrivate(admin, rep.account_id, rep.google_file_id, rep.source_tab)
      : rep.source_kind === 'google_sheet'
      ? await readGoogle(rep.source_url, rep.source_tab,
          { limit: ASK, dateKey: rep.date_column ?? null })
      : await readLink(rep.source_url, rep.source_tab)
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

/** Which account this person belongs to, asked through THEIR token so RLS is
 *  the one that answers -- never from anything the caller sent. */
async function accountOf(who: any): Promise<string | null> {
  const { data } = await who.schema('hopper').from('person')
    .select('account_id').limit(1).maybeSingle()
  return data?.account_id ?? null
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

  // ---- connecting Google
  //
  // The code-for-token exchange happens HERE and not in the Next app, for the
  // same reason the writing does: that app deliberately holds no service key
  // and must never hold the client secret either. One place holds both, and it
  // is the place that already reaches past RLS.
  if (body.google) {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Not signed in.' }, 401)
    const who = createClient(URL_, ANON, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    })
    const { data: { user } } = await who.auth.getUser()
    if (!user) return json({ error: 'Not signed in.' }, 401)

    const account = await accountOf(who)
    if (!account) return json({ ok: false, failure: 'You have no account in Hopper.' })
    const { data: me } = await who.schema('hopper').from('person')
      .select('id').eq('profile_id', user.id).maybeSingle()

    if (body.google.disconnect) {
      await admin.schema('hopper').rpc('google_disconnect', { p_account: account })
      return json({ ok: true, connected: false })
    }

    if (!G_ID || !G_SECRET || !G_REDIRECT) {
      return json({ ok: false, failure: 'Google is not set up on this Hopper yet.' })
    }
    const code = body.google.code
    if (!code) return json({ ok: false, failure: 'Google sent no code back.' })

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: G_ID, client_secret: G_SECRET,
        redirect_uri: G_REDIRECT, grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(12_000),
    })
    const tok = await res.json().catch(() => ({}))
    if (!res.ok) return json({ ok: false, failure: gErr(tok, res.status) })

    // No refresh token means Google remembered a previous consent and only sent
    // an access token, which expires within the hour and would leave Hopper
    // connected today and broken tomorrow. Said plainly rather than stored.
    if (!tok.refresh_token) {
      return json({ ok: false, failure:
        'Google sent no lasting permission. Remove Hopper at myaccount.google.com/permissions and connect again.' })
    }

    // Whose Google it is, so the UI can say. userinfo needs no extra scope --
    // it comes with the sign-in itself.
    let email: string | null = null
    try {
      const u = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tok.access_token}` },
        signal: AbortSignal.timeout(8_000),
      }).then((r) => r.json())
      email = u?.email ?? null
    } catch { /* a connection with no name on it still works */ }

    await admin.schema('hopper').rpc('google_connect', {
      p_account: account, p_person: me?.id ?? null, p_email: email,
      p_token: tok.refresh_token, p_scope: tok.scope ?? 'drive.file',
    })
    return json({ ok: true, connected: true, email })
  }

  // ---- the form, asking what tabs there are
  //
  // Its own action rather than a flag on peek: peek answers "what is IN this
  // tab" and this answers "what tabs exist" -- one is about a table, the other
  // about the file it lives in. Folded together, a peek would sometimes pull a
  // whole workbook to show you eight rows.
  if (body.tabs) {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Not signed in.' }, 401)
    const who = createClient(URL_, ANON, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    })
    const { data: { user } } = await who.auth.getUser()
    if (!user) return json({ error: 'Not signed in.' }, 401)

    try {
      const fileId = body.tabs.file_id
      if (fileId) {
        const account = await accountOf(who)
        if (!account) return json({ ok: false, failure: 'You have no account in Hopper.' })
        return json({ ok: true, tabs: await googleTabsPrivate(admin, account, fileId) })
      }
      return json({ ok: true, tabs: await googleTabs(body.tabs.url ?? '') })
    } catch (err) {
      return json({ ok: false, failure: err instanceof Fail ? err.message : String(err) })
    }
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
      // The kind comes from the form, because a link and a sheet are read two
      // different ways and peek is meant to show you what the SAVED report
      // will see. Without it a link peeked as a sheet, which failed with
      // Google's own words about sharing -- for an address Google has never
      // heard of.
      const url = body.peek.url ?? ''
      const kind = body.peek.kind === 'link' ? 'link'
        : body.peek.kind === 'google_sheet' ? 'google_sheet'
        // No kind sent: guess from the address, so an older client still works.
        : /docs\.google\.com\/spreadsheets/.test(url) ? 'google_sheet' : 'link'
      const fileId = body.peek.file_id
      let sheet: Sheet
      if (fileId) {
        const account = await accountOf(who)
        if (!account) return json({ ok: false, failure: 'You have no account in Hopper.' })
        sheet = await readGooglePrivate(admin, account, fileId, body.peek.tab ?? null)
      } else {
        sheet = kind === 'google_sheet'
          // A look, not a read: enough rows to show what the columns hold and
        // let somebody pick the two that matter. The scheduled read asks for
        // the recent ones once it knows which column dates them.
        ? await readGoogle(url, body.peek.tab ?? null, { limit: PEEK_ROWS })
          : await readLink(url, body.peek.tab ?? null)
      }
      return json({
        ok: true,
        columns: sheet.columns,
        rows: sheet.rows.slice(0, 8),
        row_count: sheet.rows.length,
        capped: sheet.capped === true,
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
    .select('id, account_id, source_kind, source_url, source_tab, date_column, chart_measures, google_file_id')
    .eq('id', body.report_id).maybeSingle()
  if (!rep) return json({ error: 'No such report.' }, 404)

  const result = await look(admin, rep)
  return json(result)
})
