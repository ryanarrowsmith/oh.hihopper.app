'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FRAME, MODULE_NAV, TAIL } from '@/components/Rail'

/**
 * Jump to.
 *
 * Every entry used to be `href="#"`, under a hand-typed list of twelve page
 * NAMES that nothing kept in step with the rail. Two answers to "what pages are
 * there", and the one down here had no routes attached to it at all -- so the
 * menu opened, listed the product, and went nowhere.
 *
 * It is built from the rail's own tables now. There is one list of pages, the
 * modules this account actually runs decide what is in it, and a page cannot be
 * added to the rail and quietly missing from here.
 */
export default function Footer({ modules }: { modules: string[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const path = usePathname()

  // Children flattened in beside their parents: this is a jump list, not a
  // second navigation tree, and Departments is a place you go rather than a
  // thing you open Organizations to find.
  const pages = [...FRAME, ...modules.map((m) => MODULE_NAV[m]).filter(Boolean), ...TAIL]
    .flatMap((i) => [{ href: i.href, label: i.label }, ...(i.kids ?? [])])
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('click', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', esc) }
  }, [])

  return (
    <footer className="foot">
      <div className="foot__who">
        <span className="mark mark--sm">hopper<span className="pd">.</span></span>
        <p>was designed and built by</p>
        {/* ohhi-bubble-clay.svg, inlined from ohhi/brand. Clay #C4522F on paper #F7F6F3. */}
        <a className="ohhi" href="https://ohhiapps.com" rel="noopener">
          <svg className="ohhi__art" viewBox="0 0 100 104" aria-hidden="true">
            <ellipse cx="50" cy="44" rx="48" ry="42" fill="#C4522F" />
            <path d="M 34 74 C 33 86, 35 95, 40 99 C 45 96, 50 88, 56 76 Z" fill="#C4522F" />
            <g transform="rotate(-45 50 44)">
              <g fill="#F7F6F3" transform="translate(26.362,41.507) scale(0.03288,-0.03288)">
                <path d="M385 715C184 715 20 551 20 350C20 149 183 -15 385 -15C586 -15 749 149 749 350C749 551 586 715 385 715ZM385 153C276 153 188 241 188 350C188 459 276 547 385 547C493 547 581 459 581 350C581 241 493 153 385 153Z" />
                <path transform="translate(790,0)" d="M628 700H460V434H218V700H50V0H218V266H460V0H628Z" />
              </g>
              <g fill="#F7F6F3" transform="translate(34.121,69.507) scale(0.03288,-0.03288)">
                <path d="M628 700H460V434H218V700H50V0H218V266H460V0H628Z" />
                <path transform="translate(698,0)" d="M50 0H218V700H50Z" />
              </g>
            </g>
          </svg>
          <span className="sr">oh hi apps</span>
        </a>
      </div>

      <div className="jumpw" ref={wrap}>
        <button className="jumpsel" type="button" aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
          Jump to…
          <svg className="jchev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open && (
          <div className="jumppop">
            {pages.map((p) => (
              <Link key={p.href} href={p.href as any} onClick={() => setOpen(false)}
                    className={p.href === path ? 'is-here' : undefined}
                    aria-current={p.href === path ? 'page' : undefined}>
                {p.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </footer>
  )
}
