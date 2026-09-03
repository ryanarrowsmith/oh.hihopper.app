'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type Visit = {
  kind: 'report' | 'dashboard' | 'entity' | 'person' | 'location'
  id: string; label: string; sub: string | null; at: string; href: string
}

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const MARK: Record<Visit['kind'], string> = {
  report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/>',
  entity: '<rect x="3" y="8" width="7" height="13"/><rect x="14" y="3" width="7" height="18"/>',
  person: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M17.5 20a6 6 0 0 0-2-4.5"/>',
  location: '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
}

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' })
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The way back to where you were.
 *
 * A rule across the page with one control sitting ON it, at the right. The line
 * runs the full width and stops at the control, which carries the canvas behind
 * itself -- so the rule reads as passing behind rather than as ending, and the
 * control reads as part of the page's furniture rather than as a button
 * somebody parked there.
 *
 * The quietest a control can be while still being one, which is right for
 * something you either already know is there or do not need.
 */
export default function RecentLine({ visits }: { visits: Visit[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [open])

  return (
    <div className="cutline">
      <span className="cutline__r" />
      <span className="cutw" ref={wrap}>
        {/* Nothing to go back to is not a control. Somebody on their first day
            gets the line and no button, rather than a button that opens an
            apology. */}
        {visits.length === 0 ? (
          <span className="cutbtn cutbtn--none">Nothing opened yet</span>
        ) : (
          <button className="cutbtn" type="button" aria-expanded={open} aria-haspopup="dialog"
                  onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
            {I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}
            Recent
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        )}

        {open && visits.length > 0 && (
          <span className="cutpop" role="dialog" aria-label="Where you have been">
            <span className="cutpop__h">
              <b>Where you have been</b>
              <span>The last {visits.length === 1 ? 'record' : `${visits.length} records`} you opened.
                Yours alone — nobody else can read this.</span>
            </span>
            <span className="cutpop__b">
              {visits.map((v) => (
                <Link className="cutrow" key={`${v.kind}-${v.id}`} href={v.href as any}
                      onClick={() => setOpen(false)}>
                  <span className="ic">{I(MARK[v.kind])}</span>
                  <span className="tx"><b>{v.label}</b>{v.sub && <span>{v.sub}</span>}</span>
                  <span className="when">{ago(v.at)}</span>
                </Link>
              ))}
            </span>
          </span>
        )}
      </span>
    </div>
  )
}
