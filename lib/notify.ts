import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import { findMentions, type Named } from '@/lib/mentions'

export type Kind = 'mention' | 'share' | 'grant' | 'admin' | 'source' | 'reply' | 'assigned' | 'status'

/**
 * Tell somebody. One call, so every feature raises a notification the same way.
 *
 * Never awaited by anything that renders and never allowed to fail a write: a
 * note that saved but could not ring a bell is a saved note, and losing the
 * note over the bell would be the wrong way round.
 */
export async function tell(to: string, kind: Kind, title: string, href: string, opts: {
  body?: string | null; object?: string | null; objectId?: string | null
} = {}) {
  try {
    await supabaseServer().schema('hopper').rpc('notify', {
      p_to: to, p_kind: kind, p_title: title, p_href: href,
      p_body: opts.body ?? null, p_object: opts.object ?? null,
      p_object_id: opts.objectId ?? null,
    })
  } catch { /* the thing that happened still happened */ }
}

/**
 * Everyone a piece of writing named, told at once.
 *
 * The roster is read here rather than passed in, so a caller cannot narrow it
 * by accident and quietly stop mentioning half the company. RLS decides which
 * people come back, which is also the access check: you cannot mention somebody
 * you cannot see.
 */
export async function tellMentioned(text: string, about: {
  title: string; href: string; object?: string; objectId?: string; body?: string
}) {
  if (!text.includes('@')) return []
  const db = supabaseServer()
  const { data } = await db.schema('hopper').from('directory')
    .select('id, full_name, email').eq('active', true)
  const roster: Named[] = (data ?? []).map((p: any) => ({
    id: p.id, name: p.full_name, email: p.email,
  }))

  const named = findMentions(text, roster)
  await Promise.all(named.map((p) => tell(p.id, 'mention', about.title, about.href, {
    body: about.body ?? text, object: about.object ?? null, objectId: about.objectId ?? null,
  })))
  return named
}
