import type { Metadata } from 'next'
import { joinBeta } from '@/app/beta/actions'
import { HOPPER_WORDMARK, OHHI_COLOPHON } from '@/lib/landing-marks'
import { LandingSlider } from '@/components/LandingSlider'
import { LANDING_CSS } from './styles'

export const metadata: Metadata = {
  title: 'Hopper — your business\u2019 other system',
  description:
    'You have a main system and it works great. Hopper is where everything else goes: reporting on top of any source, a wiki, tickets for customers and for your own people, and team rosters.',
  metadataBase: new URL('https://hihopper.app'),
}

const SAID: Record<string, string> = {
  sent: 'Check your email — there is a link in it to confirm the address.',
  already: 'That address is already on the list. Nothing more to do.',
  invalid: 'That does not look like an email address.',
  error: 'Something broke on our end rather than yours. Try again in a minute.',
  unconfigured: 'The list is not switched on yet. Nothing was recorded.',
}

/**
 * hihopper.app.
 *
 * One page, served on the bare domain by the host check in middleware.ts —
 * oh.hihopper.app is still the app. A rewrite rather than a redirect, so the
 * address bar keeps the domain the visitor typed.
 *
 * Every class here is prefixed hl-. The app ships 8,289 lines of
 * globals.css using .card, .rows, .tag, .btn, .plate and .dot among others,
 * and this page must neither inherit any of it nor lend its own rules back.
 * The stylesheet lives beside this file rather than in globals.css for the
 * same reason: a landing page is not a thing the app should have to carry.
 */
export default function Landing({
  searchParams,
}: {
  searchParams: { joined?: string }
}) {
  const said = searchParams.joined ? SAID[searchParams.joined] ?? null : null

  return (
    <div className="hl">
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />
      <div className="hl-sheet">



      <nav>
        <div className="hl-wrap hl-row">
          <span className="hl-lockup">
            <span className="hl-mark"><span dangerouslySetInnerHTML={{ __html: HOPPER_WORDMARK }} /></span>
            <span className="hl-flag">Beta</span>
          </span>
          <a href="https://oh.hihopper.app">Sign in</a>
        </div>
      </nav>

      <section className="hl-band hl-hero">
        <div className="hl-wrap">
          <span className="hl-eyebrow">Private beta</span>
          <h1>Hopper is your business&rsquo; <em>other</em> system.</h1>
          <p className="hl-lead">
            You have a main system and it works great. Hopper is where everything else goes.
          </p>
          <ul className="hl-bits">
            <li>Powerful, flexible reporting that sits on top of any of your sources</li>
            <li>A wiki for your team</li>
            <li>Support tickets for internal users and for customers</li>
            <li>Team rosters</li>
            <li>And more</li>
          </ul>

          <form className="hl-ask" id="join" action={joinBeta}>
            <label className="hl-hp" htmlFor="company">Company</label>
            <input className="hl-hp" id="company" name="company" tabIndex={-1} autoComplete="off" />
            <div className="hl-askrow">
              <label className="hl-hp" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required placeholder="you@yourcompany.com" />
              <button className="hl-btn" type="submit">Ask for an invite</button>
            </div>
            {said ? <p className="hl-said">{said}</p> : null}
            <p className="hl-fine">One email when a place opens. Nothing in between.</p>
          </form>
        </div>
      </section>

        <LandingSlider />

      <section className="hl-band">
        <div className="hl-wrap hl-hero" style={{ padding: 0, textAlign: 'center' }}>
          <form className="hl-ask" style={{ margin: '0 auto' }} action={joinBeta}>
            <div className="hl-askrow">
              <label className="hl-hp" htmlFor="email2">Email</label>
              <input id="email2" name="email" type="email" required placeholder="you@yourcompany.com" />
              <input type="hidden" name="source" value="landing-foot" />
              <button className="hl-btn" type="submit">Ask for an invite</button>
            </div>
            <p className="hl-fine">Goes to me, not to a queue.</p>
          </form>
        </div>
      </section>
      </div>

      <div className="hl-colo" dangerouslySetInnerHTML={{ __html: OHHI_COLOPHON }} />
    </div>
  )
}
