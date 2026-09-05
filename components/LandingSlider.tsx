'use client'

import { useState } from 'react'
import { HOPPER_WORDMARK } from '@/lib/landing-marks'

/**
 * One image area, three stops.
 *
 * The state is a number and the DOM is derived from it — aria-selected on
 * the tab, hidden on the panel — so a screen reader is told exactly what a
 * sighted reader is shown, from one source rather than two. Arrow keys move
 * it as well as clicks, because a control only a mouse can reach is a
 * control half the people cannot use.
 *
 * The marker under the selected stop is the amber shape; the words on the
 * rail are ink. Hopper's brand spec is loud about this: amber is 1.9:1 on
 * paper and is never allowed to be a word.
 */
const STOPS = ['Reporting', 'Tickets', 'Wiki']

export function LandingSlider() {
  const [at, setAt] = useState(0)

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const j =
      e.key === 'ArrowRight' ? i + 1 :
      e.key === 'ArrowLeft'  ? i - 1 :
      e.key === 'Home'       ? 0 :
      e.key === 'End'        ? STOPS.length - 1 : null
    if (j === null) return
    e.preventDefault()
    const n = (j + STOPS.length) % STOPS.length
    setAt(n)
    document.getElementById(`hl-tab-${n}`)?.focus()
  }

  return (
    <section className="hl-band hl-tint">
      <div className="hl-wrap">
        <div className="hl-rail" role="tablist" aria-label="What Hopper holds">
          {STOPS.map((label, i) => (
            <button
              key={label}
              role="tab"
              id={`hl-tab-${i}`}
              aria-controls={`hl-slide-${i}`}
              aria-selected={at === i}
              tabIndex={at === i ? 0 : -1}
              onClick={() => setAt(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {label}
            </button>
          ))}
        </div>

    
        <div className="hl-slide" id="hl-slide-0" role="tabpanel" aria-labelledby={`hl-tab-0`} hidden={at !== 0}>
          <figure className="hl-shot">
            <div className="hl-chrome">
              <span className="hl-m"><span dangerouslySetInnerHTML={{ __html: HOPPER_WORDMARK }} /></span>
              <span className="hl-tabs"><span className="hl-on">Reporting</span><span>Desk</span><span>Wiki</span><span>People</span></span>
            </div>
            <div className="hl-pane"><div className="hl-screen">
              <div className="hl-sechead"><b>Dispatch</b><span>4 reports &middot; read 22 minutes ago</span></div>
              <p className="hl-secnote">Every number with its age attached. The dot says how much to trust it.</p>
              <div className="hl-cards">
                <div className="hl-card">
                  <span className="hl-k"><i className="hl-dot"></i> Completed jobs</span>
                  <span className="hl-v">1,284</span>
                  <span className="hl-d">+11.4% on thirteen weeks</span>
                  <svg className="hl-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points="4,27 28,29 52,24 76,22 100,25 124,20 148,18 172,21 196,16 220,18 244,13 268,11 296,8"
                      fill="none" stroke="var(--s1)" strokeWidth="2.2" strokeLinecap="round"
                      strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
                  </svg>
                </div>
                <div className="hl-card">
                  <span className="hl-k"><i className="hl-dot hl-stale"></i> Average turn time</span>
                  <span className="hl-v">3.1<span style={{ fontSize: 15, letterSpacing: 0 }}> days</span></span>
                  <span className="hl-d">2 days old &middot; behind its schedule</span>
                  <svg className="hl-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true">
                    <polyline points="4,10 28,12 52,9 76,14 100,12 124,17 148,15 172,20 196,18 220,22 244,20 268,25 296,23"
                      fill="none" stroke="var(--s2)" strokeWidth="2.2" strokeLinecap="round"
                      strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
                  </svg>
                </div>
                <div className="hl-card">
                  <span className="hl-k"><i className="hl-dot hl-bad"></i> First-call resolution</span>
                  <span className="hl-v" style={{ color: 'var(--ink-3)' }}>&mdash;</span>
                  <span className="hl-d">Couldn&rsquo;t read the sheet on Tuesday</span>
                  <svg className="hl-spark" viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="4" y1="17" x2="296" y2="17" stroke="var(--rule)" strokeWidth="2"
                      strokeDasharray="3 5" vectorEffect="non-scaling-stroke"/>
                  </svg>
                </div>
              </div>
              <div className="hl-sechead" style={{ marginTop: 24 }}><b>Storage</b><span>3 reports &middot; read 4 hours ago</span></div>
              <div className="hl-rows">
                <div className="hl-orow"><span className="hl-plate">NB</span>
                  <span className="hl-ot"><b>Occupancy</b><span>Northbank Storage &middot; Google Sheet, hourly</span></span>
                  <span className="hl-tag">94.2%</span></div>
                <div className="hl-orow"><span className="hl-plate">NB</span>
                  <span className="hl-ot"><b>Delinquency over 30 days</b><span>Northbank Storage &middot; Airtable, daily</span></span>
                  <span className="hl-tag">2.8%</span></div>
                <div className="hl-orow"><span className="hl-plate">CM</span>
                  <span className="hl-ot"><b>Units turned this month</b><span>Cedar &amp; Main Rentals &middot; Excel, weekly</span></span>
                  <span className="hl-tag">17</span></div>
              </div>
            </div></div>
            <figcaption>Sample data &mdash; every figure, name and business on this page is invented.</figcaption>
          </figure>
          <div className="hl-slidetext">
            <h2>Lots of data sources. One place.</h2>
            <p>Whether your data lives in Google Sheets, Airtable, Microsoft Excel or a CSV on
              your machine, Hopper has got you. Hopper&rsquo;s advanced reporting features can feed
              from all of the most common sources &mdash; and then render powerful graphs with the
              ease of drag and drop.</p>
          </div>
        </div>

    
        <div className="hl-slide" id="hl-slide-1" role="tabpanel" aria-labelledby={`hl-tab-1`} hidden={at !== 1}>
          <figure className="hl-shot">
            <div className="hl-chrome">
              <span className="hl-m"><span dangerouslySetInnerHTML={{ __html: HOPPER_WORDMARK }} /></span>
              <span className="hl-tabs"><span>Reporting</span><span className="hl-on">Desk</span><span>Wiki</span><span>People</span></span>
            </div>
            <div className="hl-pane"><div className="hl-screen">
              <div className="hl-sechead"><b>The queue</b><span>6 open &middot; 2 due today</span></div>
              <p className="hl-secnote">Customers and your own people in one place, told apart by where they came in.</p>
              <div className="hl-rows">
                <div className="hl-orow"><span className="hl-plate">HW</span>
                  <span className="hl-ot"><b>Gate keypad not accepting codes</b>
                    <span>Hallis &amp; Wren &middot; came in by email &middot; 2 hours ago</span></span>
                  <span className="hl-tag hl-who">Customer</span><span className="hl-tag hl-late">Due in 40m</span></div>
                <div className="hl-orow"><span className="hl-plate">NB</span>
                  <span className="hl-ot"><b>Invoice shows last month&rsquo;s rate</b>
                    <span>Northbank Storage &middot; came in on the portal &middot; yesterday</span></span>
                  <span className="hl-tag hl-who">Customer</span><span className="hl-tag">First reply sent</span></div>
                <div className="hl-orow"><span className="hl-plate">AB</span>
                  <span className="hl-ot"><b>Can&rsquo;t see the Leasing dashboard</b>
                    <span>Aisha Bello &middot; raised from the page she was on &middot; today</span></span>
                  <span className="hl-tag">Internal</span><span className="hl-tag">Working on it</span></div>
                <div className="hl-orow"><span className="hl-plate">CM</span>
                  <span className="hl-ot"><b>Add a unit type for climate-controlled</b>
                    <span>Jonah Kim &middot; raised from the page he was on &middot; Tuesday</span></span>
                  <span className="hl-tag">Internal</span><span className="hl-tag">Waiting on you</span></div>
              </div>
            </div></div>
            <figcaption>Sample data &mdash; every figure, name and business on this page is invented.</figcaption>
          </figure>
          <div className="hl-slidetext">
            <h2>All of your tickets in one place.</h2>
            <p>With Hopper, customers can ask for help through an email or a portal. Your own
              people can track work and raise issues just as easily. With robust customization
              features and reporting, gain granularity on root causes and response times.</p>
          </div>
        </div>

    
        <div className="hl-slide" id="hl-slide-2" role="tabpanel" aria-labelledby={`hl-tab-2`} hidden={at !== 2}>
          <figure className="hl-shot">
            <div className="hl-chrome">
              <span className="hl-m"><span dangerouslySetInnerHTML={{ __html: HOPPER_WORDMARK }} /></span>
              <span className="hl-tabs"><span>Reporting</span><span>Desk</span><span className="hl-on">Wiki</span><span>People</span></span>
            </div>
            <div className="hl-pane"><div className="hl-screen">
              <div className="hl-sechead"><b>How we do things</b><span>34 pages &middot; 6 edited this week</span></div>
              <p className="hl-secnote">Written down where the people doing the work already are.</p>
              <div className="hl-wgroup">Dispatch</div>
              <div className="hl-rows">
                <div className="hl-orow"><span className="hl-plate">W</span>
                  <span className="hl-ot"><b>Taking an after-hours call</b><span>Marcus Reyes &middot; edited Tuesday</span></span>
                  <span className="hl-tag">Current</span></div>
                <div className="hl-orow"><span className="hl-plate">W</span>
                  <span className="hl-ot"><b>What counts as an emergency</b><span>Dana Whitfield &middot; edited in June</span></span>
                  <span className="hl-tag">Review due</span></div>
              </div>
              <div className="hl-wgroup">Storage</div>
              <div className="hl-rows">
                <div className="hl-orow"><span className="hl-plate">W</span>
                  <span className="hl-ot"><b>Auction timeline, start to finish</b><span>Tom Lindqvist &middot; edited last week</span></span>
                  <span className="hl-tag">Current</span></div>
                <div className="hl-orow"><span className="hl-plate">W</span>
                  <span className="hl-ot"><b>Gate code resets</b><span>Priya Nair &middot; edited Monday</span></span>
                  <span className="hl-tag">Current</span></div>
                <div className="hl-orow"><span className="hl-plate">W</span>
                  <span className="hl-ot"><b>Move-in checklist</b><span>Aisha Bello &middot; edited yesterday</span></span>
                  <span className="hl-tag">Current</span></div>
              </div>
            </div></div>
            <figcaption>Sample data &mdash; every figure, name and business on this page is invented.</figcaption>
          </figure>
          <div className="hl-slidetext">
            <h2>Centralized knowledge base.</h2>
            <p>How you actually do things, kept next to the work rather than in a folder nobody
              opens &mdash; with the same people, organizations and permissions as everything
              else in Hopper. Even better: wiki articles can be searched from inside a ticket, so
              your team finds the answer without leaving the thing they are answering.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
