'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { saveHome } from '@/app/actions/home'
import { CATALOG, type WidgetKey } from '@/lib/widgets'
import type { Placed } from '@/lib/home'

/**
 * The home page below the hero: a list of sections somebody arranged.
 *
 * Sort reorders the list; Widgets decides what is in it. One mechanism behind
 * both, because two of them is how the two doors end up disagreeing about what
 * order the page is in.
 *
 * The contents are rendered on the SERVER and handed in as nodes. This file
 * owns the arrangement and knows nothing about what is inside a section --
 * which is what keeps a widget's data on the server where its policies are,
 * instead of shipping every person's favorites to the browser to be sorted.
 */
export default function HomeBoard({ placed, bodies, counts, dolly, hero }: {
  placed: Placed[]
  bodies: Partial<Record<WidgetKey, ReactNode>>
  counts: Partial<Record<WidgetKey, number>>
  /** Dolly rides in the strip rather than in the list -- she is a thing you
   *  reach for, not a section you read past. */
  dolly: ReactNode
  hero: ReactNode
}) {
  const [order, setOrder] = useState<Placed[]>(placed)
  const [mode, setMode] = useState<'read' | 'sort' | 'pick'>('read')
  const [saving, setSaving] = useState(false)
  const drag = useRef<number | null>(null)

  // The server is the record. When it re-renders with a newer arrangement --
  // another tab, another device -- that answer replaces this one rather than
  // being quietly overwritten by whatever this tab happened to be holding.
  useEffect(() => { setOrder(placed) }, [placed])

  const meta = useMemo(() => new Map(CATALOG.map((w) => [w.key, w])), [])
  const live = order.filter((p) => p.on)

  const commit = (next: Placed[]) => {
    setOrder(next)
    setSaving(true)
    saveHome(next.map((p) => p.key), next.filter((p) => p.on).map((p) => p.key))
      .finally(() => setSaving(false))
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    next.splice(to, 0, next.splice(from, 1)[0])
    commit(next)
  }

  const toggle = (key: WidgetKey) => {
    const w = meta.get(key)
    if (!w || !w.built) return
    commit(order.map((p) => (p.key === key ? { ...p, on: !p.on } : p)))
  }

  return (
    <>
      {/* The strip is where everything you DO to this page lives, and it sits
          top right on the canvas rather than in a bar of its own -- a toolbar
          under a greeting reads as part of the greeting. Each bubble names
          itself on hover; none of them needs a word standing next to it all
          day. */}
      <div className="tools">
        <div className="bubw">
          <Link className="bub" href="/favorites" aria-label="Your favorites">
            <svg viewBox="0 0 24 24"><path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z" /></svg>
          </Link>
          <span className="bubl" aria-hidden="true">Favorites</span>
        </div>

        {dolly}

        <div className="bubw">
          <button className={`bub${mode === 'pick' ? ' is-on' : ''}`} type="button"
                  aria-pressed={mode === 'pick'} aria-label="What is on this page"
                  onClick={() => setMode(mode === 'pick' ? 'read' : 'pick')}>
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" />
              <rect x="3" y="13.5" width="7.5" height="7.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" />
              <path d="M17.25 3v7.5M13.5 6.75h7.5" /></svg>
          </button>
          <span className="bubl" aria-hidden="true">Widgets</span>
        </div>

        <div className="bubw">
          <button className={`bub${mode === 'sort' ? ' is-on' : ''}`} type="button"
                  aria-pressed={mode === 'sort'} aria-label="Reorder this page"
                  onClick={() => setMode(mode === 'sort' ? 'read' : 'sort')}>
            <svg viewBox="0 0 24 24"><path d="M8 4 5 7l3 3" /><path d="M5 7h9a4 4 0 0 1 0 8h-1" />
              <path d="M16 20l3-3-3-3" /><path d="M19 17h-9" /></svg>
          </button>
          <span className="bubl" aria-hidden="true">{mode === 'sort' ? 'Done' : 'Sort'}</span>
        </div>

        <span className="tools__s" aria-live="polite">{saving ? 'Saving…' : ''}</span>
      </div>

      {/* The hero does not move and is not the person's to arrange, so it sits
          outside everything below it. */}
      {hero}

      {/* ── the picker ─────────────────────────────────────────────────
          Everything that exists, including what is not built. A catalogue
          that hid the unbuilt ones would answer "is there a tickets widget"
          with silence, which reads as no rather than as not yet. */}
      {mode === 'pick' && (
        <div className="hxpick" role="group" aria-label="What is on your home page">
          {CATALOG.map((w) => {
            const p = order.find((o) => o.key === w.key)
            const on = !!p?.on
            return (
              <button key={w.key} type="button" className={`hxopt${on ? ' is-on' : ''}${w.built ? '' : ' is-soon'}`}
                      aria-pressed={on} disabled={!w.built}
                      onClick={() => toggle(w.key)}>
                <span className="hxopt__t">
                  <b>{w.name}</b>
                  {!w.built && <em>Not built yet</em>}
                </span>
                <span className="hxopt__n">{w.note}</span>
                <span className="hxopt__x" aria-hidden="true">
                  {on ? <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg> : null}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── sorting ────────────────────────────────────────────────────
          Every section folds to a box carrying its name and how much is in
          it, so the whole page fits on one screen and nothing has to be
          dragged past a scroll -- which is the part of reordering that
          actually goes wrong. */}
      {mode === 'sort' ? (
        <ol className="hxsort">
          {order.filter((p) => p.on).map((p) => {
            const i = order.indexOf(p)
            const w = meta.get(p.key)!
            const n = counts[p.key]
            return (
              <li key={p.key} className="hxsort__i" draggable
                  onDragStart={() => { drag.current = i }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (drag.current !== null) move(drag.current, i); drag.current = null }}>
                <span className="grab" aria-hidden="true">
                  <svg viewBox="0 0 12 14"><circle cx="3" cy="2" r="1.3" /><circle cx="9" cy="2" r="1.3" />
                    <circle cx="3" cy="7" r="1.3" /><circle cx="9" cy="7" r="1.3" />
                    <circle cx="3" cy="12" r="1.3" /><circle cx="9" cy="12" r="1.3" /></svg>
                </span>
                <b>{w.name}</b>
                {typeof n === 'number' && <span className="hxsort__n">{n}</span>}
                <span className="hxsort__sp" />
                {/* Arrows as well as drag, and not as a courtesy: drag is the
                    one way to reorder that a keyboard cannot do and a phone
                    does badly. */}
                <button className="hxarr" type="button" aria-label={`Move ${w.name} up`}
                        disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg>
                </button>
                <button className="hxarr" type="button" aria-label={`Move ${w.name} down`}
                        disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>
                  <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <>
          {live.map((p) => bodies[p.key] ? (
            <div key={p.key}>{bodies[p.key]}</div>
          ) : null)}
          {live.length === 0 && (
            <p className="empty">
              Nothing on your page yet. <b>Widgets</b> above says what can go here.
            </p>
          )}
        </>
      )}
    </>
  )
}
