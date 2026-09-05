import { betaConfigured, platformAdmin } from '@/lib/beta'
import { HOPPER_WORDMARK } from '@/lib/landing-marks'
import { LANDING_CSS } from '@/app/landing/styles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirm your place — Hopper', robots: { index: false } }

/**
 * The other end of the confirmation link.
 *
 * Confirming on a plain GET is deliberate: a mail client that prefetches the
 * link does the one thing the person was going to do anyway. Leaving the list
 * is the opposite bargain, which is why /beta/leave makes you press a button.
 */
export default async function ConfirmBeta({
  searchParams,
}: {
  searchParams: { t?: string }
}) {
  const t = searchParams.t

  let status = 'unknown'
  if (betaConfigured && t) {
    const { data, error } = await platformAdmin().rpc('confirm_beta', { p_token: t })
    if (error) {
      console.error('confirm_beta:', error.message)
      status = 'error'
    } else {
      status = String((data as { status?: string } | null)?.status ?? 'unknown')
    }
  }

  const said =
    status === 'confirmed'
      ? { head: 'You are on the list', body: 'That is everything. One email on the day a place opens, and a way off the list at the bottom of it.' }
      : status === 'already'
        ? { head: 'Already done', body: 'This address was confirmed earlier. Nothing to do — we have you.' }
        : status === 'error'
          ? { head: 'That did not go through', body: 'Something broke on our end rather than yours. Try the link again in a minute.' }
          : { head: 'That link has expired', body: 'It may have been used already, or replaced by a newer one. Ask for an invite again and a fresh link goes out.' }

  return (
    <div className="hl">
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="hl-sheet">
        <section className="hl-band hl-hero">
          <div className="hl-wrap">
            <span className="hl-lockup" style={{ alignItems: 'center' }}>
              <span className="hl-mark"><span dangerouslySetInnerHTML={{ __html: HOPPER_WORDMARK }} /></span>
            </span>
            <h1 style={{ marginTop: 26 }}>{said.head}</h1>
            <p className="hl-lead">{said.body}</p>
            <p className="hl-fine" style={{ marginTop: 20 }}>
              <a href="/">Back to the page</a>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
