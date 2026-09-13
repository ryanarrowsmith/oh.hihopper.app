'use client'
import { useState } from 'react'
import type { CrewTicket } from '@/lib/crew'

type Labels = {
  sow: string; materials: string; tools: string; closeout: string
  locates: string; photos: string; photosNeed: string; sign: string
  signNeeds: string; shortage: string; noPrices: string; length: string
}

/**
 * Four tabs, thumb-sized, and the materials tab open first — that is the one a
 * crew opens in the yard before anything else. Ticking is local state here; the
 * write goes back through the token route, so a crew never holds a session.
 */
export default function CrewTabs({ ticket, labels }: { ticket: CrewTicket; labels: Labels }) {
  const [tab, setTab] = useState<'sow' | 'materials' | 'tools' | 'closeout'>('materials')
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const es = ticket.lang === 'es'
  const name = (en: string, esName: string | null) => (es && esName ? esName : en)

  const TABS = [
    { key: 'sow' as const, label: labels.sow },
    { key: 'materials' as const, label: labels.materials },
    { key: 'tools' as const, label: labels.tools },
    { key: 'closeout' as const, label: labels.closeout },
  ]

  return (
    <>
      <div className="ck__tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" className="ck__tab"
                  aria-selected={tab === x.key} onClick={() => setTab(x.key)}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="ck__body">
        {tab === 'sow' && (
          <>
            <p className="ck__sow">
              {(es ? ticket.sow?.es : ticket.sow?.en) ??
                (es ? 'El alcance del trabajo aún no se ha enviado.'
                    : 'The scope of work has not been sent yet.')}
            </p>
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
            <div className="ck__shots">
              {[0, 1, 2].map((i) => <div className="ck__shot" key={i}>+</div>)}
            </div>
            <p className="ck__hint">{labels.photosNeed}</p>
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
