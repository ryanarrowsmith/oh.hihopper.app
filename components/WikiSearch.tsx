'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Hit = { id: string; title: string; slug: string; category: string | null; snippet: string }

/**
 * The search box, which is the wiki.
 *
 * A handbook is a thing you arrive at with a question. Results carry the
 * sentence the word is in, marked, because a list of titles makes somebody open
 * three documents to find out which one they meant.
 */
export default function WikiSearch({ total, categories }: {
  total: number; categories: number
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const router = useRouter()

  /* One request in flight at a time, and the last word typed wins. Without the
     guard a fast typist gets the answer to "depos" painted over the answer to
     "deposit" whenever the shorter query happens to come back second. */
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits(null); setBusy(false); return }
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/wiki/search?q=${encodeURIComponent(term)}`)
        const j = await r.json()
        if (alive) { setHits(j.hits ?? []); setPick(0) }
      } catch { if (alive) setHits([]) } finally { if (alive) setBusy(false) }
    }, 160)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  // "/" from anywhere puts the cursor in the box, the way search works in every
  // tool people already use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      const typing = el instanceof HTMLElement
        && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.key === '/' && !typing) { e.preventDefault(); field.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setHits(null)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const open = (h: Hit) => router.push(`/wiki/${h.slug}` as any)

  const onKey = (e: React.KeyboardEvent) => {
    if (!hits?.length) { if (e.key === 'Escape') { setQ(''); field.current?.blur() }; return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setPick((p) => (p + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPick((p) => (p - 1 + hits.length) % hits.length) }
    else if (e.key === 'Enter') { e.preventDefault(); open(hits[pick]) }
    else if (e.key === 'Escape') { setQ(''); setHits(null); field.current?.blur() }
  }

  const showing = hits !== null && q.trim().length >= 2

  return (
    <>
      <div className="wfind" ref={box}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input ref={field} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
               type="search" role="combobox" aria-expanded={showing} aria-controls="wres"
               aria-label="Search the handbook"
               placeholder="Search the handbook — “forklift”, “holiday”, “who signs off a refund”" />
        <kbd>{q ? 'esc' : '/'}</kbd>

        {showing && (
          <div className="wres" id="wres" role="listbox">
            <div className="wres__h">
              <span>{busy ? 'Looking…' : `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`}</span>
              {hits.length > 0 && <span>↑↓ to move · ↵ to open</span>}
            </div>
            {hits.length === 0 && !busy ? (
              <div className="wres__none">
                <b>Nothing about “{q.trim()}”.</b>
                It searches titles, tags and the words inside every document — so if this
                is a thing people ask about, it is a document somebody has not written yet.
              </div>
            ) : hits.map((h, i) => (
              <a key={h.id} className={`wres__i${i === pick ? ' is-on' : ''}`}
                 href={`/wiki/${h.slug}`} role="option" aria-selected={i === pick}
                 onMouseEnter={() => setPick(i)}>
                <span className="wres__t"><b>{h.title}</b>{h.category && <span>{h.category}</span>}</span>
                {/* The snippet comes from ts_headline, which marks the hit. It
                    is the database's own words about the stored text, not
                    anything a person typed into this page. */}
                <span className="wres__s" dangerouslySetInnerHTML={{ __html: h.snippet }} />
              </a>
            ))}
            <div className="wres__f">
              <span>Searching titles, tags and the words inside every document.</span>
            </div>
          </div>
        )}
      </div>
      <p className="wfind__say">
        {total} {total === 1 ? 'document' : 'documents'} across {categories}{' '}
        {categories === 1 ? 'category' : 'categories'}.
      </p>
    </>
  )
}
