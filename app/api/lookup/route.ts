import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * The four searches behind Get to know me, proxied.
 *
 * Server-side for three reasons: the Mapbox token never reaches the browser
 * (same rule as /api/map); Open Food Facts asks callers to identify
 * themselves, which a browser cannot honestly do; and one shape of result
 * comes back whatever answered, so the form does not care which service it
 * was talking to.
 *
 * Every failure names itself. I could not reach any of these services from
 * where this was written -- the egress there refuses them -- so the field
 * names below come from each service's documentation rather than from a
 * response I saw. If one of them has moved, the adapter says which service
 * and what it got back instead of quietly returning nothing, because "no
 * results" and "I could not read the answer" are different problems and only
 * one of them is yours.
 */
export type Hit = {
  id: string
  title: string
  sub?: string | null
  img?: string | null
  url?: string | null
  lat?: number | null
  lng?: number | null
  address?: string | null
  year?: number | null
}

const UA = 'Hopper/1.0 (oh.hihopper.app; support@hihopper.app)'

/**
 * A small memory, because these are free services on somebody else's budget.
 *
 * Google Books answered 429 and Open Food Facts 503 within a minute of real
 * use -- a shared cloud address types the same searches as everybody else on
 * it. Typing "wizard of oz" fires a request per keystroke pause; holding the
 * answer for ten minutes turns a room full of people picking the same films
 * into one call instead of forty. It is per instance and it is allowed to
 * vanish; a cache that has to survive is a database, and this is not worth one.
 */
const HELD = new Map<string, { at: number; v: { hits: Hit[] } }>()
const HOLD_MS = 10 * 60_000
const HOLD_MAX = 300

function remembered(key: string) {
  const hit = HELD.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > HOLD_MS) { HELD.delete(key); return null }
  return hit.v
}

function remember(key: string, v: { hits: Hit[] }) {
  // Only worth keeping an answer that answered something.
  if (!v.hits.length) return
  if (HELD.size >= HOLD_MAX) HELD.delete(HELD.keys().next().value as string)
  HELD.set(key, { at: Date.now(), v })
}

async function grab(url: string, label: string, ms = 8000): Promise<{ j: any } | { why: string }> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' },
                             cache: 'no-store', signal: AbortSignal.timeout(ms) })
  } catch (e: any) {
    return { why: `${label} could not be reached (${e?.name ?? 'network error'}).` }
  }
  if (!res.ok) return { why: `${label} answered ${res.status}.` }
  try {
    return { j: await res.json() }
  } catch {
    return { why: `${label} answered ${res.status} but not with JSON.` }
  }
}

/** Apple sends 100x100; asking for 600 is a string swap, not another request. */
const bigArt = (u?: string | null) =>
  u ? u.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1') : null

const itunes = (kind: 'song') => async (q: string) => {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}`
    + `&media=music&entity=song&limit=8`
  const r = await grab(url, 'iTunes')
  if ('why' in r) return r
  const rows = r.j?.results
  if (!Array.isArray(rows)) return { why: 'iTunes answered, but without a results list.' }
  return {
    hits: rows.map((x: any): Hit => ({
      id: String(x.trackId ?? x.collectionId ?? x.trackViewUrl ?? Math.random()),
      title: x.trackName ?? x.collectionName ?? 'Untitled',
      sub: x.artistName ?? null,
      img: bigArt(x.artworkUrl100),
      url: x.trackViewUrl ?? x.collectionViewUrl ?? null,
      year: x.releaseDate ? Number(String(x.releaseDate).slice(0, 4)) : null,
    })),
  }
}

/**
 * Films come from Wikidata, because a shop is a bad encyclopedia.
 *
 * iTunes was asked directly rather than read about. `entity=movie` -- with
 * media=movie beside it and without -- answers 200 with an empty list for
 * every title tried: wizard of oz, top gun, the godfather, amelie. Zero, no
 * error, which is the hardest kind of wrong to notice, and it is why this
 * field has been quietly broken. Drop the entity and iTunes does return films,
 * but only the ones the US store has a licence for and ranked by whatever
 * sells: "top gun" brings back The Real Top Guns and Top Gunner, no Maverick
 * and no Tony Scott; "the godfather" brings back The Godfathers of Hardcore.
 *
 * Wikidata's search restricted to things that ARE a film (P31 = Q11424)
 * answers with the film you meant, first, every time -- Top Gun 1986, The
 * Godfather 1972, Amelie 2001, and both Wizards of Oz. It is free, it needs no
 * key, and it is not trying to sell anybody a rental.
 *
 * Two calls: the search ranks, and wbgetentities names. Labels and
 * descriptions only -- asking for claims as well returns every statement on
 * the film, which for a famous one is a hundred kilobytes to read a year off.
 * The year is in the description already, because that is how Wikidata writes
 * them: "1986 film directed by Tony Scott".
 *
 * No posters. Wikidata does not have them and would not be allowed to give
 * them away if it did, so the artwork is asked of iTunes afterwards and
 * matched on title. That call is allowed to fail: when it does, or when the
 * store has never heard of the film, the card has no picture and the answer
 * is still right, which is the correct way round.
 */
const WD = 'https://www.wikidata.org/w/api.php'
const FILM = 'Q11424'

const norm = (s: string) =>
  s.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Somebody's favorite film, on a wall at work. */
const NOT_AT_WORK = /\bxxx\b|pornograph|adult film/i

async function movie(q: string) {
  const found = await grab(
    `${WD}?action=query&format=json&formatversion=2&list=search&srlimit=12`
    + `&srsearch=${encodeURIComponent(`${q} haswbstatement:P31=${FILM}`)}`,
    'Wikidata')
  if ('why' in found) return found

  const ids: string[] = (found.j?.query?.search ?? [])
    .map((s: any) => s?.title).filter((t: any) => typeof t === 'string' && /^Q\d+$/.test(t))
  if (!ids.length) return { hits: [] }

  const named = await grab(
    `${WD}?action=wbgetentities&format=json&props=labels|descriptions&ids=${ids.join('|')}`,
    'Wikidata')
  if ('why' in named) return named
  const ents = named.j?.entities
  if (!ents) return { why: 'Wikidata answered, but without any entities.' }

  const seen = new Set<string>()
  const hits: Hit[] = []
  for (const id of ids) {                       // the search's order is the ranking
    const e = ents[id]
    if (!e) continue
    const title = e.labels?.en?.value ?? e.labels?.mul?.value
    if (!title) continue
    const desc: string = e.descriptions?.en?.value ?? ''
    if (NOT_AT_WORK.test(title) || NOT_AT_WORK.test(desc)) continue
    const year = Number(desc.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1]) || null
    const key = `${norm(title)}|${year ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({
      id, title, year,
      sub: desc ? desc.replace(/^\d{4}\s+/, '').replace(/^./, (c) => c.toUpperCase()) : null,
      img: null,
      url: `https://www.wikidata.org/wiki/${id}`,
    })
    if (hits.length === 8) break
  }

  // The poster, if a shop happens to have one. Best effort by design: a failure
  // here costs a picture, never an answer.
  const art = await grab(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&limit=40&country=US`,
    'iTunes', 4000)
  if (!('why' in art)) {
    const by = new Map<string, string>()
    for (const x of art.j?.results ?? []) {
      if (x?.kind !== 'feature-movie') continue
      const t = x.trackName ?? x.collectionName
      const a = bigArt(x.artworkUrl100)
      if (!t || !a) continue
      const bare = norm(String(t).replace(/\s*\(\d{4}\)\s*$/, ''))
      if (!by.has(bare)) by.set(bare, a)
    }
    for (const h of hits) h.img = by.get(norm(h.title)) ?? null
  }

  return { hits }
}

/**
 * Books: Google first, Open Library behind it.
 *
 * Open Library's search took 8.5 seconds and then timed out -- typing a title
 * and waiting that long is the field feeling broken even when it eventually
 * answers. Google Books needs no key, answers in well under a second and
 * carries a thumbnail. Open Library is still here because it is the better
 * citizen and sometimes has what Google does not, so it gets its turn when
 * Google comes back empty.
 */
async function book(q: string) {
  const g = await grab('https://www.googleapis.com/books/v1/volumes'
    + `?q=${encodeURIComponent(q)}&maxResults=8&printType=books&country=US`,
    'Google Books', 6000)

  if (!('why' in g) && Array.isArray(g.j?.items) && g.j.items.length) {
    return {
      hits: g.j.items.map((x: any): Hit => {
        const v = x?.volumeInfo ?? {}
        // The thumbnail comes back on http and with a curl; both are fixable
        // here rather than in every place that shows a cover.
        const img = (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null)
        return {
          id: String(x.id ?? Math.random()),
          title: v.title ?? 'Untitled',
          sub: Array.isArray(v.authors) ? v.authors[0] : null,
          img: img ? img.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : null,
          url: v.infoLink ?? v.previewLink ?? null,
          year: v.publishedDate ? Number(String(v.publishedDate).slice(0, 4)) : null,
        }
      }),
    }
  }

  const r = await grab('https://openlibrary.org/search.json'
    + `?q=${encodeURIComponent(q)}&limit=8`
    + '&fields=title,author_name,cover_i,key,first_publish_year',
    'Open Library', 12000)
  if ('why' in r) return 'why' in g ? { why: `${g.why} ${r.why}` } : r
  const rows = r.j?.docs
  if (!Array.isArray(rows)) return { why: 'Open Library answered, but without a docs list.' }
  return {
    hits: rows.map((x: any): Hit => ({
      id: String(x.key ?? Math.random()),
      title: x.title ?? 'Untitled',
      sub: Array.isArray(x.author_name) ? x.author_name[0] : null,
      img: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg` : null,
      url: x.key ? `https://openlibrary.org${x.key}` : null,
      year: x.first_publish_year ?? null,
    })),
  }
}

/**
 * Candy: the v2 search, with the old cgi one behind it.
 *
 * The legacy /cgi/search.pl endpoint answered 503 -- it is the one Open Food
 * Facts asks people to stop hammering, and it sheds load first. v2 is the
 * supported search and holds up; the old one is kept as a fallback because it
 * still answers when v2 does not know a product.
 */
async function candy(q: string) {
  const fields = 'code,product_name,brands,image_front_url,image_front_small_url'
  const v2 = await grab('https://world.openfoodfacts.org/api/v2/search'
    + `?search_terms=${encodeURIComponent(q)}&page_size=8&fields=${fields}`,
    'Open Food Facts', 9000)

  let rows = !('why' in v2) && Array.isArray(v2.j?.products) ? v2.j.products : null
  if (!rows || rows.length === 0) {
    const r = await grab('https://world.openfoodfacts.org/cgi/search.pl'
      + `?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8`
      + `&fields=${fields}`, 'Open Food Facts', 9000)
    if ('why' in r) return 'why' in v2 ? { why: v2.why } : r
    rows = r.j?.products
  }
  if (!Array.isArray(rows)) return { why: 'Open Food Facts answered, but without a products list.' }
  return {
    hits: rows
      .filter((x: any) => x?.product_name)
      .map((x: any): Hit => ({
        id: String(x.code ?? Math.random()),
        title: x.product_name,
        sub: x.brands ?? null,
        img: x.image_front_url ?? x.image_front_small_url ?? null,
        url: x.code ? `https://world.openfoodfacts.org/product/${x.code}` : null,
      })),
  }
}

async function restaurant(q: string) {
  const token = (process.env.MAPBOX_TOKEN ?? '').trim().replace(/^["']|["']$/g, '')
  if (!token) return { why: 'Mapbox is not configured on this deployment.' }
  const url = 'https://api.mapbox.com/search/searchbox/v1/forward'
    + `?q=${encodeURIComponent(q)}&limit=8&types=poi&access_token=${encodeURIComponent(token)}`
  const r = await grab(url, 'Mapbox')
  if ('why' in r) return r
  const rows = r.j?.features
  if (!Array.isArray(rows)) return { why: 'Mapbox answered, but without a features list.' }
  return {
    hits: rows.map((f: any): Hit => {
      const p = f?.properties ?? {}
      const c = p.coordinates ?? {}
      return {
        id: String(p.mapbox_id ?? Math.random()),
        title: p.name ?? 'Unnamed place',
        sub: p.place_formatted ?? null,
        address: p.full_address ?? p.address ?? p.place_formatted ?? null,
        lat: typeof c.latitude === 'number' ? c.latitude : null,
        lng: typeof c.longitude === 'number' ? c.longitude : null,
        url: null,
      }
    }),
  }
}

const KINDS: Record<string, (q: string) => Promise<{ hits: Hit[] } | { why: string }>> = {
  song: itunes('song'),
  movie,
  book,
  candy,
  restaurant,
}

export async function GET(req: Request) {
  // Signed in or nothing. These are somebody else's services and Hopper is not
  // going to be an open proxy to them.
  const db = supabaseServer()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, why: 'Not signed in.' }, { status: 401 })

  const url = new URL(req.url)
  const kind = url.searchParams.get('kind') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim()

  const run = KINDS[kind]
  if (!run) return NextResponse.json({ ok: false, why: `Nothing searches "${kind}".` }, { status: 400 })
  if (q.length < 2) return NextResponse.json({ ok: true, hits: [] })

  const key = `${kind}:${q.toLowerCase()}`
  const held = remembered(key)
  if (held) return NextResponse.json({ ok: true, hits: held.hits, held: true })

  const out = await run(q)
  if ('why' in out) {
    // Say what happened AND say the way past it, because the field can still
    // keep what was typed and most people do not know that.
    return NextResponse.json({ ok: false, why: out.why }, { status: 502 })
  }
  remember(key, out)
  return NextResponse.json({ ok: true, hits: out.hits })
}
