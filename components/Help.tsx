'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * How this screen works, on request.
 *
 * The alternative is a line of explanatory text under the title, which is what
 * this replaces. That line is read once by each person and then read past
 * forever, and it spends a whole band of the page every day to be useful on
 * somebody's first afternoon. A question mark costs nothing until it is
 * pressed, and it can hold five sentences instead of one -- so it says more,
 * to the people who want it, at no cost to the people who do not.
 *
 * Deliberately not a tooltip: this is prose with links in it, and a tooltip
 * that you cannot move the pointer into is a tooltip you cannot click.
 */
export type Point = { t: string; d: string }

export default function Help(
  { title, lead, points, more }:
  { title: string; lead?: string; points: Point[]
    more?: { label: string; href: string } },
) {
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
    <span className="helpw" ref={wrap}>
      <button className="helpb" type="button" aria-expanded={open} aria-haspopup="dialog"
              aria-label={`How ${title} works`} data-tip={`How ${title} works`}
              onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        ?
      </button>
      {open && (
        <div className="helppop" role="dialog" aria-label={`How ${title} works`}>
          <p className="helppop__h">
            How {title} works
            <button className="helppop__x" type="button" aria-label="Close"
                    onClick={() => setOpen(false)}>&times;</button>
          </p>
          {lead && <p className="helppop__l">{lead}</p>}
          <dl className="helppop__d">
            {points.map((p) => (
              <div key={p.t}>
                <dt>{p.t}</dt>
                <dd>{p.d}</dd>
              </div>
            ))}
          </dl>
          {more && (
            <Link className="helppop__go" href={more.href as any} onClick={() => setOpen(false)}>
              {more.label}
            </Link>
          )}
        </div>
      )}
    </span>
  )
}
