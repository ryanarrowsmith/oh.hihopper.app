import Link from 'next/link'
import { checkState } from '@/lib/wiki-check'
import type { DocRow } from '@/lib/wiki'

const I = (d: string, w = '1.9') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
export const MARKS: Record<string, string> = {
  book:   '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
  shield: '<path d="M12 3l7.5 3v6c0 5-3.4 8-7.5 9-4.1-1-7.5-4-7.5-9V6z"/>',
  tool:   '<path d="M14.5 5.5a4.5 4.5 0 0 0 5.9 5.9L15 16.8 8.2 23 1 15.8l6.2-6.8 5.4-5.4a4.5 4.5 0 0 0 1.9 1.9z"/>',
  cart:   '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12h11L21 7H6"/>',
  users:  '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 5.2a3.4 3.4 0 0 1 0 5.6"/><path d="M18.4 14.6A5.6 5.6 0 0 1 21.5 20"/>',
  page:   '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
}
const TICK = '<path d="M4 12.5l5 5L20 6.5"/>'
const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>'
const WARN = '<path d="M12 4.5 21 20H3z"/><path d="M12 10v4"/><path d="M12 17v.1"/>'

export const ago = (iso: string | null) => {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 21) return `${d} days ago`
  if (d < 60) return `${Math.round(d / 7)} weeks ago`
  if (d < 730) return `${Math.round(d / 30)} months ago`
  return `${Math.floor(d / 365)} years ago`
}

/**
 * When it was last confirmed, as a mark.
 *
 * Standing rule: prefer an icon with a floating label to a box of words. The
 * word is on hover, on keyboard focus and on the accessible name -- and printed
 * outright below 640px, because Hopper switches its tooltips off on touch and
 * an icon labelled only by a tooltip is an unlabelled icon on a phone.
 */
export function CheckMark({ at }: { at: string | null }) {
  const s = checkState(at)
  const word = s === 'never' ? 'Never checked'
    : s === 'old' ? `Last checked ${ago(at)} — probably out of date`
    : s === 'due' ? `Last checked ${ago(at)} — wants confirming`
    : `Checked ${ago(at)}`
  const tone = s === 'ok' ? 'mark--good' : s === 'due' ? 'mark--warn' : 'mark--bad'
  const short = s === 'never' ? 'Never checked' : `Checked ${ago(at)}`
  return (
    <span className={`mark mark--sm ${tone}`} data-tip={word} role="img" aria-label={word}>
      {s === 'ok' ? I(TICK, '2.4') : s === 'due' ? I(CLOCK, '2') : I(WARN, '2')}
      <b>{short}</b>
    </span>
  )
}

export function DocRowLink({ d, when }: { d: DocRow; when: 'checked' | 'edited' }) {
  const state = checkState(d.checkedAt)
  // Only the "wants a look" list colours its date. On "changed lately" the
  // date is a fact, not a complaint.
  const tone = when !== 'checked' || state === 'ok' ? ''
    : state === 'due' ? ' is-stale' : ' is-old'
  return (
    <Link className="wrow" href={`/wiki/${d.slug}` as any}>
      <span className="wrow__t">{d.title}
        <small>{[d.category, d.tags.length
          ? `${d.tags.length} ${d.tags.length === 1 ? 'tag' : 'tags'}` : null]
          .filter(Boolean).join(' · ')}</small></span>
      <span className="wrow__w">
        {d.initials && <span className="pav">{d.initials}</span>}
        {d.owner?.split(' ')[0] ?? '—'}
      </span>
      <span className={`wrow__d${tone}`}>
        {when === 'checked'
          ? (d.checkedAt ? `checked ${ago(d.checkedAt)}` : 'never checked')
          : `edited ${ago(d.updatedAt)}`}
      </span>
    </Link>
  )
}

export function CatCard({ c }: { c: { name: string; slug: string; blurb: string | null
                                      mark: string | null; n: number } }) {
  return (
    <Link className="wcat" href={`/wiki?in=${c.slug}` as any}>
      <span className="wcat__t">{I(MARKS[c.mark ?? 'page'] ?? MARKS.page)}{c.name}</span>
      <span className="wcat__b">{c.blurb}</span>
      <span className="wcat__n">{c.n} {c.n === 1 ? 'document' : 'documents'}</span>
    </Link>
  )
}
