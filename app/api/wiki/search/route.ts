import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * What the search box calls while somebody types.
 *
 * The work is a single Postgres function running as the signed-in person, so
 * wiki_doc's own policy decides what can be found. A search endpoint that can
 * see more than the list it searches is a leak wearing a helpful face.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ hits: [], total: 0 })

  const db = supabaseServer()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })

  const { data, error } = await db.schema('hopper').rpc('wiki_search', { q, lim: 6 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    hits: (data ?? []).map((r: any) => ({
      id: r.id, title: r.title, slug: r.slug, category: r.category, snippet: r.snippet,
    })),
    total: (data ?? []).length,
  })
}
