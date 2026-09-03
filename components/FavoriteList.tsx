'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { OrgMark, PlaceMark, PersonMark } from '@/components/Icons'
import Unheart from '@/components/Unheart'

/**
 * Everything you hearted, in one grid, with chips to narrow it.
 *
 * It was one section per kind, which is the right shape for a page you READ
 * and the wrong one for a page you USE: four headings and four counts to get
 * past before reaching six shortcuts, and the thing you wanted was probably
 * the one you hearted last rather than the first of its type.
 *
 * So: newest first, everything together, and a chip if you want less. The cost
 * of mixing kinds is that a card must say what it is -- "Head Office" and "On
 * Call Holdings" are the same shape otherwise -- so the kind moves onto the
 * card as a mark and a word.
 */
/** Defined in lib/favorites, where the list is built. Re-exported so nothing
 *  that already imported it from here had to change. */
export type { Fav } from '@/lib/favorites'
import type { Fav } from '@/lib/favorites'

const KIND: Record<Fav['kind'], { one: string; many: string; mark: () => JSX.Element }> = {
  report:   { one: 'Report',       many: 'Reports',       mark: () => <ChartMark /> },
  entity:   { one: 'Organization', many: 'Organizations', mark: () => <OrgMark /> },
  location: { one: 'Office',       many: 'Offices',       mark: () => <PlaceMark /> },
  person:   { one: 'Person',       many: 'People',        mark: () => <PersonMark /> },
}
const ORDER: Fav['kind'][] = ['report', 'entity', 'location', 'person']

export default function FavoriteList({ items }: { items: Fav[] }) {
  const [only, setOnly] = useState<Fav['kind'] | null>(null)

  const counts = useMemo(() => {
    const n = {} as Record<Fav['kind'], number>
    for (const i of items) n[i.kind] = (n[i.kind] ?? 0) + 1
    return n
  }, [items])

  const shown = only ? items.filter((i) => i.kind === only) : items

  if (items.length === 0) {
    return (
      <div className="empty">
        <p>
          The heart on a report, an organization, an office or somebody&rsquo;s page puts
          it here. It is the shortest way back to the six things you actually open.
        </p>
        <p><Link className="btn btn--amber" href="/reporting">Go and heart something</Link></p>
      </div>
    )
  }

  return (
    <>
      <div className="fchips" role="group" aria-label="Show only one kind">
        <button className={`fchip${only === null ? ' is-on' : ''}`} type="button"
                aria-pressed={only === null} onClick={() => setOnly(null)}>
          Everything<span>{items.length}</span>
        </button>
        {/* Only the kinds you actually have. A chip reading "People 0" is a
            filter that can only ever empty the page. */}
        {ORDER.filter((k) => counts[k]).map((k) => (
          <button key={k} className={`fchip${only === k ? ' is-on' : ''}`} type="button"
                  aria-pressed={only === k} onClick={() => setOnly(only === k ? null : k)}>
            {KIND[k].mark()}{KIND[k].many}<span>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="favs">
        {shown.map((f) => (
          <div className={`fav fav--${f.kind}`} key={`${f.kind}-${f.id}`}>
            <Link className="fav__go" href={f.href as any}>
              <span className="fav__k">{KIND[f.kind].mark()}{KIND[f.kind].one}</span>
              <span className="fav__n">{f.label}</span>
              {f.sub && <span className="fav__w">{f.sub}</span>}
            </Link>
            <Unheart object={f.kind} objectId={f.id} />
          </div>
        ))}
      </div>
    </>
  )
}

/** A report, which has no mark of its own anywhere else yet. */
const ChartMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)
