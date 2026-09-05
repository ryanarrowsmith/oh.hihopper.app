import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { createHash } from 'crypto'

/**
 * The beta list.
 *
 * The rows live in beebee, not in hopper, and that is the contract's call
 * rather than a convenience: somebody on a waiting list has no account, so
 * there is no account_id for an app table to carry. One list serves every
 * Oh hi app.
 *
 * beebee.beta_signup has no public policy at all. Access is execute on four
 * SECURITY DEFINER functions granted to service_role alone, which is why
 * everything in this file is server-only and why the service key is the one
 * new secret this feature needs.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const APP_ID = 'hopper'

/** False when the deployment has no service key. The landing still renders —
 *  it says so instead of throwing a form at somebody that goes nowhere. */
export const betaConfigured = Boolean(url && key)

export const platformAdmin = () =>
  createClient(url, key, { db: { schema: 'beebee' }, auth: { persistSession: false } })

/** The hosts that serve the landing rather than the app. */
export const LANDING_HOSTS = new Set([
  'hihopper.app',
  'www.hihopper.app',
])

const CANONICAL = 'https://hihopper.app'

/**
 * The host this request actually arrived on, checked against the list we
 * serve. A confirmation link is built from this, so a forged Host header
 * would otherwise be a way to make our mail point at somebody else's site —
 * an unrecognized host falls back to the canonical one instead.
 */
export async function requestHost(): Promise<string> {
  const h = headers()
  return (h.get('x-forwarded-host') ?? h.get('host') ?? '')
    .split(',')[0].trim().toLowerCase().replace(/:\d+$/, '')
}

export async function origin(): Promise<string> {
  const host = await requestHost()
  if (LANDING_HOSTS.has(host)) return `https://${host}`
  return CANONICAL
}

/** Where the landing lives on this host: the root when the host is the
 *  landing's own, and the route itself everywhere else. */
export async function landingPath(): Promise<string> {
  return LANDING_HOSTS.has(await requestHost()) ? '/' : '/landing'
}

/** The rate limit needs to recognize a client without the table holding an
 *  address it has no use for. Salted with a secret this deployment already
 *  has, so the hashes are not portable to anything else. */
export async function clientHash(): Promise<string | null> {
  const h = headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!ip) return null
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'hopper'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}
