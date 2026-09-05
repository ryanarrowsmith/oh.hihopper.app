'use server'

import { redirect } from 'next/navigation'
import {
  APP_ID, betaConfigured, clientHash, landingPath, origin, platformAdmin,
} from '@/lib/beta'

/**
 * Joining the list.
 *
 * Every answer this can give is the same answer as far as the page is
 * concerned — check your email — except the two it would be rude to hide: a
 * typo, and an address already confirmed. Telling a stranger which addresses
 * are on the list is how a signup form becomes an address checker.
 */
export async function joinBeta(formData: FormData) {
  const back = await landingPath()
  const say = (status: string): never => redirect(`${back}?joined=${status}#join`)

  if (!betaConfigured) say('unconfigured')

  const email = String(formData.get('email') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()

  // A field no person can see, filled in by something that fills in every
  // field. It gets the same answer everyone else gets and goes nowhere.
  if (String(formData.get('company') ?? '')) say('sent')
  if (!email) say('invalid')

  const { data, error } = await platformAdmin().rpc('join_beta', {
    p_app: APP_ID,
    p_email: email,
    p_site: await origin(),
    p_name: name || null,
    p_source: String(formData.get('source') ?? 'landing'),
    p_ip_hash: await clientHash(),
    p_client: {},
  })

  if (error) {
    console.error('join_beta:', error.message)
    say('error')
  }
  say(String((data as { status?: string } | null)?.status ?? 'sent'))
}

/**
 * Leaving the list. A press, never a prefetch — see app/beta/leave/page.tsx
 * for why the link alone does not do it.
 */
export async function leaveBeta(formData: FormData) {
  const token = String(formData.get('t') ?? '').trim()
  if (!betaConfigured || !token) redirect('/beta/leave?done=unknown')

  const { data, error } = await platformAdmin().rpc('leave_beta', { p_token: token })
  if (error) {
    console.error('leave_beta:', error.message)
    redirect('/beta/leave?done=unknown')
  }
  redirect(`/beta/leave?done=${String((data as { status?: string } | null)?.status ?? 'unknown')}`)
}
