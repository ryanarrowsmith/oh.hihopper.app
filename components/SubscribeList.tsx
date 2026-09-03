'use client'
import Choice from '@/components/Choice'
import { useFormState, useFormStatus } from 'react-dom'
import { addFeed, removeFeed } from '@/app/actions/calendar'

type Feed = { id: string; name: string; url: string; colour: string
  last_look: string | null; last_ok: boolean | null; failure: string | null }

const COLOURS: [string, string][] = [
  ['--s3', 'Pink'], ['--steel', 'Steel'], ['--s2', 'Olive'],
  ['--s1', 'Blue'], ['--amber', 'Amber'], ['--bad', 'Red'],
]

export default function SubscribeList({ feeds, mayEdit }: { feeds: Feed[]; mayEdit: boolean }) {
  const [added, add] = useFormState(addFeed, null)

  return (
    <>
      {mayEdit && (
        <section className="sec">
          <div className="sec__h"><div className="sec__t">
            <h2>Subscribe to a calendar</h2>
            <p>
              The address has to answer without a sign-in — Hopper reads it as nobody in
              particular and holds nobody&rsquo;s key. In Google Calendar that is
              Settings → your calendar → <b>Secret address in iCal format</b>.
            </p>
          </div></div>

          <form action={add} className="card" style={{ padding: 16 }}>
            <div className="formrow">
              <div>
                <label htmlFor="cf-name">What to call it</label>
                <input className="field" id="cf-name" name="name" required maxLength={80}
                       placeholder="On Call — Operations" />
              </div>
              <div>
                <label htmlFor="cf-colour">Colour</label>
                {/* A styled popover, not a native select: house rule, and the
                    last native one in the codebase. */}
                <Choice id="cf-colour" name="colour" defaultValue="--s3" filterFrom={99}
                        options={COLOURS.map(([v, l]) => ({ value: v, label: l }))} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label htmlFor="cf-url">The .ics address</label>
              <input className="field" id="cf-url" name="url" required
                     placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
              <p className="hint">
                Hopper reads it on the same sweep that reads reports, so a change upstream
                shows up here within the hour rather than instantly.
              </p>
            </div>
            {added && !added.ok && <p className="note note--err" style={{ marginTop: 12 }}>{added.message}</p>}
            {added?.ok && <p className="note note--ok" style={{ marginTop: 12 }}>{added.message}</p>}
            <div className="formgrid__go" style={{ marginTop: 14 }}><Go /></div>
          </form>
        </section>
      )}

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>Subscribed</h2>
          <p>What Hopper is reading. Removing one takes its events off the calendar with it.</p>
        </div></div>

        {feeds.length === 0
          ? <p className="empty">None yet.</p>
          : <div className="rlist2">
              {feeds.map((f) => (
                <div className="rrow" key={f.id}>
                  <span className="rrow__c" style={{ color: `var(${f.colour})` }}>●</span>
                  <span className="rrow__n">{f.name}
                    <em style={{ display: 'block', fontStyle: 'normal', fontSize: 11,
                                 color: 'var(--ink-3)', fontWeight: 400 }}>{f.url}</em>
                  </span>
                  <span className="rrow__f">
                    {f.last_ok === false
                      ? <><span className="dot dot--bad" />{f.failure ?? 'Not answering'}</>
                      : f.last_look
                      ? <><span className="dot dot--good" />Read {new Date(f.last_look).toLocaleString()}</>
                      : <><span className="dot" />Not read yet</>}
                  </span>
                  {mayEdit && (
                    <form action={removeFeed}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn btn--danger" type="submit">Remove</button>
                    </form>
                  )}
                </div>
              ))}
            </div>}
      </section>
    </>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return <button className="btn btn--amber" type="submit" disabled={pending}>
    {pending ? 'Adding…' : 'Subscribe'}
  </button>
}
