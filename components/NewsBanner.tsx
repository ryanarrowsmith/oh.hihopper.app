'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { I, Kat, Left, X } from '@/components/NewsBits'
import { hideBanner } from '@/app/actions/news'
import type { Banner } from '@/lib/news'

/**
 * The banner, across the top of the home page.
 *
 * Full width and above the container rather than inside it: a notice that sits
 * in the same box as everything else is a notice people read as everything
 * else. It runs edge to edge of the content column by cancelling the main
 * padding, which is why the negative margin is a clamp -- the same clamp.
 *
 * The newest one is shown and the rest are counted. Stacking three announcements
 * above the page pushes the page off it; rotating them means somebody misses
 * one; a count with a way through is the honest middle.
 *
 * The x hides it for this person until it retires on its own. That is a real
 * cost -- you cannot then be sure everybody saw it -- and it is the price of
 * letting somebody clear their own screen.
 */
export default function NewsBanner({ items }: { items: Banner[] }) {
  const [gone, setGone] = useState<string[]>([])
  const [, go] = useTransition()
  const live = items.filter((b) => !gone.includes(b.id))
  if (live.length === 0) return null

  const [first, ...rest] = live
  return (
    <div className="nbandwrap">
      <div className={`nband${first.daysLeft <= 1 ? ' nband--soon' : ''}`} role="status">
        <Kat mark={first.mark} name={first.category} />
        <span className="nband__b">
          <p className="nband__t">
            <Link href={`/news/${first.id}` as any}>{first.title}</Link>
          </p>
          {first.lede && <p className="nband__s">{first.lede}</p>}
        </span>
        <span className="nband__a">
          <Left days={first.daysLeft} off={first.comesOff} />
          <Link className="lnk" href={`/news/${first.id}` as any}>Read it</Link>
          <button className="nband__x" type="button" aria-label={`Hide ${first.title}`}
                  data-tip="Hide this until it comes off by itself"
                  onClick={() => {
                    setGone([...gone, first.id])
                    go(async () => { await hideBanner(first.id) })
                  }}>
            {I(X, '2')}
          </button>
        </span>
      </div>
      {rest.length > 0 && (
        <p className="nmore">
          {rest.length} more {rest.length === 1 ? 'notice is' : 'notices are'} running
          {' · '}<Link className="lnk" href="/news">see them</Link>
        </p>
      )}
    </div>
  )
}
