'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type Needy = {
  id: string; name: string; where: string
  /** How it is wrong, already worded. */
  why: string
  kind: 'late' | 'bad' | 'never'
  href: string
}
export type Org = { id: string; name: string; n: number }

const I = (d: string, w = '1.7') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const REP = '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
const ORG = '<rect x="3" y="8" width="7" height="13"/><rect x="14" y="3" width="7" height="18"/>'

const GROUP: Record<Needy['kind'], string> = {
  late: 'Stopped moving', bad: 'Would not answer', never: 'Never read',
}
const ORDER: Needy['kind'][] = ['bad', 'late', 'never']

/**
 * What needs you, as a sentence.
 *
 * A section of cards said the same thing at four times the height, and a home
 * page that opens with a wall of warnings is a home page people learn to scroll
 * past. The counts are the only marked words in it -- everything else is
 * ordinary prose, which is what makes a mark mean something.
 *
 * Each count opens what it counted, and every row opens THAT record rather than
 * the page it lives on. A row that took you to Reporting and left you to find
 * it again would be the sentence pointing at a haystack.
 */
export default function NeedsLine({ items, orgs }: { items: Needy[]; orgs: Org[] }) {
  const [open, setOpen] = useState<'items' | 'orgs' | null>(null)
  const wrap = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [open])

  // Nothing to say and nothing to open. Leaving the counts as buttons over an
  // empty list is a control that lies about having something behind it.
  if (items.length === 0) {
    return (
      <p className="hxneed hxneed--ok">
        Nothing needs your attention. Every report is current.
      </p>
    )
  }

  const n = items.length
  const m = orgs.length

  return (
    <p className="hxneed" ref={wrap}>
      You currently have{' '}
      <span className="numw">
        <button className="numbtn" type="button" aria-expanded={open === 'items'}
                aria-haspopup="dialog"
                onClick={(e) => { e.stopPropagation(); setOpen(open === 'items' ? null : 'items') }}>
          <span className="hl num">{n} {n === 1 ? 'report' : 'reports'}</span>
        </button>
        {open === 'items' && (
          <span className="npop" role="dialog" aria-label="What needs attention">
            <span className="arw" />
            <span className="nph">
              <span>
                <b>{n} {n === 1 ? 'report needs' : 'reports need'} attention</b>
                <span>A number that has stopped moving, or a source that stopped answering.
                  Each row opens that report.</span>
              </span>
              <button className="npx" type="button" aria-label="Close"
                      onClick={() => setOpen(null)}>{I('<path d="M5 5l14 14M19 5L5 19"/>', '2.2')}</button>
            </span>
            <span className="npb">
              {ORDER.map((k) => {
                const rows = items.filter((i) => i.kind === k)
                if (rows.length === 0) return null
                return (
                  <span key={k}>
                    <span className="npg">
                      <span className="gn">{GROUP[k]}</span>
                      <span className="gc">{rows.length}</span>
                      <span className="gl" />
                    </span>
                    {rows.map((r) => (
                      <Link className={`nprow${k === 'late' || k === 'bad' ? ' late' : ''}`}
                            key={r.id} href={r.href as any} onClick={() => setOpen(null)}>
                        <span className="ic">{I(REP, '1.9')}</span>
                        <span className="tx"><b>{r.name}</b><span>{r.where}</span></span>
                        <span className="due">{r.why}</span>
                      </Link>
                    ))}
                  </span>
                )
              })}
            </span>
            <span className="npf">
              A report is behind when the DATA stopped moving, not when Hopper last looked.
            </span>
          </span>
        )}
      </span>
      {' '}needing attention across{' '}
      <span className="numw">
        <button className="numbtn" type="button" aria-expanded={open === 'orgs'}
                aria-haspopup="dialog"
                onClick={(e) => { e.stopPropagation(); setOpen(open === 'orgs' ? null : 'orgs') }}>
          <span className="hl num">{m}</span>
        </button>
        {open === 'orgs' && (
          <span className="npop" role="dialog" aria-label="Which organizations">
            <span className="arw" />
            <span className="nph">
              <span>
                <b>{m} {m === 1 ? 'organization' : 'organizations'}</b>
                <span>Where the things needing attention are. Each row opens that organization.</span>
              </span>
              <button className="npx" type="button" aria-label="Close"
                      onClick={() => setOpen(null)}>{I('<path d="M5 5l14 14M19 5L5 19"/>', '2.2')}</button>
            </span>
            <span className="npb">
              {orgs.map((o) => (
                <Link className="nprow" key={o.id} href={`/admin/organizations/${o.id}` as any}
                      onClick={() => setOpen(null)}>
                  <span className="ic">{I(ORG, '1.9')}</span>
                  <span className="tx"><b>{o.name}</b>
                    <span>{o.n} {o.n === 1 ? 'report' : 'reports'} behind</span></span>
                </Link>
              ))}
            </span>
          </span>
        )}
      </span>
      {' '}{m === 1 ? 'organization' : 'organizations'}.
    </p>
  )
}
