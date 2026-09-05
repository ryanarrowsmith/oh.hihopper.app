import { leaveBeta } from '@/app/beta/actions'
import { HOPPER_WORDMARK } from '@/lib/landing-marks'
import { LANDING_CSS } from '@/app/landing/styles'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leave the list — Hopper', robots: { index: false } }

/**
 * Leaving takes a press, not a fetch.
 *
 * Mail clients and link scanners follow every URL in a message before anybody
 * has read it. A one-click unsubscribe on a GET therefore removes people who
 * never asked to go, which is the same failure as ignoring the ones who did.
 */
export default function LeaveBeta({
  searchParams,
}: {
  searchParams: { t?: string; done?: string }
}) {
  const { t, done } = searchParams

  const shell = (head: string, body: React.ReactNode) => (
    <div className="hl">
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="hl-sheet">
        <section className="hl-band hl-hero">
          <div className="hl-wrap">
            <span className="hl-lockup" style={{ alignItems: 'center' }}>
              <span className="hl-mark"><span dangerouslySetInnerHTML={{ __html: HOPPER_WORDMARK }} /></span>
            </span>
            <h1 style={{ marginTop: 26 }}>{head}</h1>
            {body}
          </div>
        </section>
      </div>
    </div>
  )

  if (done) {
    const gone = done === 'left'
    return shell(gone ? 'You are off the list' : 'That link has expired', (
      <>
        <p className="hl-lead">
          {gone
            ? 'We will not write again. If you change your mind, the form is where it was.'
            : 'It may have been used already. Nothing was changed.'}
        </p>
        <p className="hl-fine" style={{ marginTop: 20 }}><a href="/">Back to the page</a></p>
      </>
    ))
  }

  return shell('Leave the list?', (
    <>
      <p className="hl-lead">
        We will stop writing about Hopper entirely — including the one message telling you a
        place has opened.
      </p>
      <form className="hl-ask" action={leaveBeta} style={{ margin: '26px auto 0', maxWidth: 320 }}>
        <input type="hidden" name="t" value={t ?? ''} />
        <button className="hl-btn" type="submit" style={{ width: '100%' }}>Take me off the list</button>
      </form>
      <p className="hl-fine" style={{ marginTop: 16 }}><a href="/">Keep me on it</a></p>
    </>
  ))
}
