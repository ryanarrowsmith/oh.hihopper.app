import 'server-only'

/**
 * The one door to Anthropic.
 *
 * Plain `fetch` rather than the SDK: one call, one shape, and a dependency that
 * cannot drift out from under a build. The key never leaves the server, and
 * nothing on a page ever holds it — same rule as the Mapbox token.
 *
 * IT DOES NOT THROW. A model is a network call to somebody else's computer, and
 * the thing on the other end of this is a project manager pressing a button, so
 * every failure comes back as a sentence they can act on rather than a stack
 * trace and a blank screen. Anthropic's own words are passed through, because
 * "the model refused" tells nobody anything and "credit balance too low" tells
 * them exactly what to do.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

/** claude-sonnet-5 unless the deployment says otherwise. Recorded on whatever it
 *  writes, because model behaviour changes between versions and "which one wrote
 *  this" is a question somebody will ask. */
export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5'

export function aiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim()
}

export type Said =
  | { ok: true; text: string; model: string }
  | { ok: false; why: string }

export async function askClaude(o: {
  system: string
  user: string
  maxTokens?: number
  /** Low by default. This drafts a document somebody signs, not a poem. */
  temperature?: number
  timeoutMs?: number
}): Promise<Said> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    return { ok: false, why: 'No Anthropic key is set on this deployment, so nothing can be drafted by a model.' }
  }

  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), o.timeoutMs ?? 45_000)

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: stop.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: o.maxTokens ?? 2000,
        temperature: o.temperature ?? 0.2,
        system: o.system,
        messages: [{ role: 'user', content: o.user }],
      }),
    })

    if (!res.ok) {
      const said = await res.text().catch(() => '')
      let why = said.slice(0, 300)
      try {
        const j = JSON.parse(said)
        if (j?.error?.message) why = j.error.message
      } catch { /* the body was not json; the raw text is better than nothing */ }
      return { ok: false, why: `Anthropic answered ${res.status}. ${why}` }
    }

    const data = await res.json()
    const text = (data?.content ?? [])
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text)
      .join('')
      .trim()

    if (!text) return { ok: false, why: 'The model answered with nothing at all.' }
    return { ok: true, text, model: data?.model ?? MODEL }
  } catch (e: any) {
    return {
      ok: false,
      why: e?.name === 'AbortError'
        ? 'The model took too long and the request was stopped. Nothing was saved.'
        : `Could not reach Anthropic: ${e?.message ?? 'unknown error'}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The first JSON object in a reply.
 *
 * Models are asked for JSON and mostly give it, and occasionally wrap it in a
 * sentence or a fence. Finding the object is a two-line problem; failing the
 * whole draft because of a stray "Here you go:" is a bad trade.
 */
export function firstJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(body.slice(start, end + 1)) as T } catch { return null }
}
