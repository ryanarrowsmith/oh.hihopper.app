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

async function grab(url: string, label: string): Promise<{ j: any } | { why: string }> {
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' },
                             cache: 'no-store', signal: AbortSignal.timeout(8000) })
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

const itunes = (kind: 'song' | 'movie') => async (q: string) => {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}`
    + `&entity=${kind === 'song' ? 'song' : 'movie'}&limit=8`
  const r = await grab(url, 'iTunes')
  if ('why' in r) return r
  const rows = r.j?.results
  if (!Array.isArray(rows)) return { why: 'iTunes answered, but without a results list.' }
  return {
    hits: rows.map((x: any): Hit => ({
      id: String(x.trackId ?? x.collectionId ?? x.trackViewUrl ?? Math.random()),
      title: x.trackName ?? x.collectionName ?? 'Untitled',
      sub: kind === 'song' ? (x.artistName ?? null) : null,
      img: bigArt(x.artworkUrl100),
      url: x.trackViewUrl ?? x.collectionViewUrl ?? null,
      year: x.releaseDate ? Number(String(x.releaseDate).slice(0, 4)) : null,
    })),
  }
}

async function book(q: string) {
  const url = 'https://openlibrary.org/search.json'
    + `?q=${encodeURIComponent(q)}&limit=8`
    + '&fields=title,author_name,cover_i,key,first_publish_year'
  const r = await grab(url, 'Open Library')
  if ('why' in r) return r
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

async function candy(q: string) {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl'
    + `?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=8`
    + '&fields=code,product_name,brands,image_front_url,image_front_small_url'
  const r = await grab(url, 'Open Food Facts')
  if ('why' in r) return r
  const rows = r.j?.products
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
  movie: itunes('movie'),
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

  const out = await run(q)
  if ('why' in out) return NextResponse.json({ ok: false, why: out.why }, { status: 502 })
  return NextResponse.json({ ok: true, hits: out.hits })
}
