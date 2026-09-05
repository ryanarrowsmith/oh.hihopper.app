/* Doorbell's collector, first-party.
 *
 * Copy to app/api/doorbell/route.ts in each app. It is same-origin on purpose:
 * a tracker that posts to another domain is what content blockers block, and it
 * would put a service key somewhere a browser can read it. Here the key stays
 * on the server and the browser only ever talks to the site it is already on.
 *
 * Needs two environment variables, server-side (NOT NEXT_PUBLIC_):
 *   DOORBELL_URL          https://<project>.supabase.co
 *   DOORBELL_SERVICE_KEY  the service role key for that project
 *
 * Product apps point at Oh Hi Apps. Hub points at okiedokie. That is the whole
 * difference between the two sides.
 */
export const runtime = 'edge'
export const dynamic = 'force-dynamic'

// Nothing to say back. A 204 keeps the response off the network panel and
// means a failure here can never break the page that called it.
const NO = new Response(null, { status: 204 })

export async function POST(req: Request) {
  const url = process.env.DOORBELL_URL
  const key = process.env.DOORBELL_SERVICE_KEY
  if (!url || !key) {
    // Loud on the server, silent to the page. A collector that drops every hit
    // without saying so looks exactly like a site nobody visited.
    console.error('[doorbell] not configured: DOORBELL_URL or DOORBELL_SERVICE_KEY is missing')
    return NO
  }

  let body: { p?: string; r?: string | null; w?: number | null; e?: string | null; d?: unknown }
  try {
    const raw = await req.text()
    if (raw.length > 2048) return NO          // nobody needs a 2KB page view
    body = JSON.parse(raw)
  } catch {
    return NO
  }
  if (!body || typeof body.p !== 'string') return NO

  const h = req.headers
  // The client sends the path, the referrer and its width. Everything that
  // identifies the request — which site, which address, which browser — is read
  // from the headers here, so none of it can be forged from the page.
  const payload = {
    p_host:    (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0].toLowerCase(),
    p_path:    body.p.slice(0, 400),
    p_ref:     typeof body.r === 'string' ? body.r.slice(0, 400) : null,
    p_ua:      h.get('user-agent'),
    p_ip:      (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
    p_screen:  Number.isFinite(body.w) ? Math.max(0, Math.min(9999, Number(body.w))) : null,
    p_country: h.get('x-vercel-ip-country'),
    p_event:   typeof body.e === 'string' ? body.e.slice(0, 60) : null,
    p_props:   body.d && typeof body.d === 'object' && JSON.stringify(body.d).length < 1024
                 ? body.d : null,
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/record`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // record() lives in the doorbell schema, not public.
        'Content-Profile': 'doorbell',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error(`[doorbell] collector refused ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
  } catch (e) {
    console.error('[doorbell] collector unreachable:', e instanceof Error ? e.message : e)
  }
  return NO
}
