'use client'
import { SPINE } from '@/lib/sow'
import { useState } from 'react'
import type { CrewTicket } from '@/lib/crew'
import CrewNote from '@/components/CrewNote'
import TabDrop from '@/components/TabDrop'

type Labels = {
  sow: string; materials: string; tools: string; closeout: string
  locates: string; photos: string; photosNeed: string; sign: string
  signNeeds: string; shortage: string; noPrices: string; length: string
  note: string; noteHint: string; notePh: string; notePhoto: string
  noteSend: string; noteSending: string; noteSent: string; noteNone: string
  noteShot: string; noteShots: string
}

/**
 * Four tabs, thumb-sized, and the materials tab open first — that is the one a
 * crew opens in the yard before anything else. Ticking is local state here; the
 * write goes back through the token route, so a crew never holds a session.
 */
export default function CrewTabs({ ticket, token, labels }:
  { ticket: CrewTicket; token: string; labels: Labels }) {
  const [tab, setTab] = useState<'sow' | 'materials' | 'tools' | 'closeout'>('materials')
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const es = ticket.lang === 'es'
  const name = (en: string, esName: string | null) => (es && esName ? esName : en)
  const shots = ticket.sent.filter((n) => n.shot).length

  const TABS = [
    { key: 'sow' as const, label: labels.sow },
    { key: 'materials' as const, label: labels.materials },
    { key: 'tools' as const, label: labels.tools },
    { key: 'closeout' as const, label: labels.closeout },
  ]

  return (
    <>
      {/* FOUR TABS FIT A DESK AND NOT A PHONE. At 390 px "Herramientas" and
          "Cierre" were fighting over the last third of the bar, and the answer
          is not a smaller typeface on the one control every crew touches
          first. See TabDrop for the rule and where it stops. */}
      <div className="ck__tabs tabrow" role="tablist">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" className="ck__tab"
                  aria-selected={tab === x.key} onClick={() => setTab(x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      <TabDrop name="ck-tab" value={tab} onPick={setTab}
               options={TABS.map((x) => ({ value: x.key, label: x.label }))} />

      <div className="ck__body">
        {tab === 'sow' && (
          <>
            {/* The fixed spine, so the same thing is always in the same place —
                a crew looking for what is buried does not read from the top. */}
            {ticket.sow?.parts.length ? (
              <>
                {!ticket.sow.signed && (
                  <p className="ck__draft">
                    {es ? 'Borrador — nadie lo ha firmado todavía.'
                        : 'Draft — nobody has signed it yet.'}
                  </p>
                )}
                {ticket.sow.parts.map((p) => (
                  <section className="ck__part" key={p.key}>
                    <h3>{SPINE.find((s) => s.key === p.key)?.[es ? 'es' : 'en'] ?? p.key}</h3>
                    <p>{p.text}</p>
                  </section>
                ))}
              </>
            ) : (
              <p className="ck__sow">
                {es ? 'El alcance del trabajo aún no se ha enviado.'
                    : 'The scope of work has not been sent yet.'}
              </p>
            )}
            <p className="ck__warn">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M8 1.9l6.2 11H1.8z" /><path d="M8 6.3v3.1M8 11.2v.2" />
              </svg>
              {labels.locates}
            </p>
          </>
        )}

        {tab === 'materials' && (
          <ul className="ck__list">
            {ticket.materials.map((m) => (
              <li key={m.code}>
                <button type="button" className="ck__tick" aria-pressed={!!ticked[m.code]}
                        aria-label={name(m.name_en, m.name_es)}
                        onClick={() => setTicked((s) => ({ ...s, [m.code]: !s[m.code] }))}>
                  <span />
                </button>
                <span className="ck__n">{name(m.name_en, m.name_es)}</span>
                <span className="ck__q">{m.qty.toLocaleString()} {m.uom}</span>
              </li>
            ))}
            {ticket.materials.length === 0 && <li className="ck__none">—</li>}
          </ul>
        )}

        {tab === 'tools' && (
          <ul className="ck__list ck__list--plain">
            {ticket.tools.map((x) => (
              <li key={x.name_en}>
                <span className="ck__n">{name(x.name_en, x.name_es)}</span>
                <span className="ck__q">{x.qty}</span>
              </li>
            ))}
          </ul>
        )}

        {tab === 'closeout' && (
          <>
            {/* THE BOX THAT ACTUALLY WRITES SOMETHING DOWN. It stood here as
                three grey squares with a plus in them until 14 Sep — a picture
                of a feature. What a crew sends here is what the office reads on
                the job's log and what accounting reads at the bottom of the
                billing letter, so it is worth more than the rest of this tab
                put together and it goes first. */}
            <CrewNote token={token} labels={{
              title: labels.note, hint: labels.noteHint, placeholder: labels.notePh,
              photo: labels.notePhoto, send: labels.noteSend,
              sending: labels.noteSending, sent: labels.noteSent,
            }} />

            {/* THE COUNT IS THE REQUIREMENT, SAID ONCE. "Three photographs are
                required" used to sit under three empty squares and never
                changed, whatever the crew did — so it was a rule with no way of
                knowing whether it had been met. Now it counts what this ticket
                actually sent, and stops nagging once it has three. */}
            <section className="cksent">
              <div className="cksent__h">
                <h3>{labels.noteSent}</h3>
                <b>{shots} / 3 {labels.noteShots}</b>
              </div>
              {ticket.sent.length === 0 ? (
                <p className="ck__hint">{labels.noteNone}</p>
              ) : (
                <ul className="cksent__l">
                  {ticket.sent.map((n) => (
                    <li key={n.id}>
                      <p>{n.body}</p>
                      <span>
                        {new Date(n.at).toLocaleDateString(es ? 'es-US' : 'en-US',
                          { day: 'numeric', month: 'short' })}
                        {n.shot ? ` · ${labels.noteShot}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {shots < 3 && <p className="ck__hint">{labels.photosNeed}</p>}
            </section>

            <ul className="ck__list">
              {ticket.tasks.map((x) => (
                <li key={x.id}>
                  <button type="button" className="ck__tick" aria-pressed={!!ticked[x.id]}
                          aria-label={es && x.es ? x.es : x.en}
                          onClick={() => setTicked((s) => ({ ...s, [x.id]: !s[x.id] }))}>
                    <span />
                  </button>
                  <span className="ck__n">{es && x.es ? x.es : x.en}</span>
                </li>
              ))}
            </ul>
            <p className="ck__hint">{labels.signNeeds}</p>
          </>
        )}
      </div>

      {tab === 'materials' && (
        <button type="button" className="ck__btn">{labels.shortage}</button>
      )}
    </>
  )
}
