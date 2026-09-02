'use client'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type Opt = { value: string; label: string; hint?: string }

/**
 * A choice, in Hopper's own popover rather than the browser's.
 *
 * A native <select> draws its menu with the operating system, which cannot be
 * made to match anything -- so this is a real listbox instead, built once and
 * used everywhere.
 *
 * Two decisions worth knowing about:
 *
 * The list is PORTALLED to <body> and positioned fixed. It is opened from
 * inside a drawer that clips itself to animate (.rrec__clip) and from inside an
 * add popover that scrolls its own body (.addpop__body); anything positioned
 * relative to the button would be eaten by one or the other. Rendering it
 * outside the page's boxes is the only fix that works in every case rather than
 * a fix per case.
 *
 * The value reaches the server through a hidden input, so every server action
 * still reads it from FormData and nothing downstream had to change.
 */
export default function Choice({
  name, options, defaultValue = '', placeholder = 'Choose…', id, required,
  filterFrom = 8, onPick,
}: {
  name: string; options: Opt[]; defaultValue?: string; placeholder?: string
  id?: string; required?: boolean; filterFrom?: number
  /**
   * Optional. The hidden input is the only thing the server needs, and React
   * setting `value` on it fires no change event -- so a caller that must react
   * to the choice (three dropdowns narrowing each other on the report form)
   * cannot listen for one. This is that callback, and nothing else changed.
   */
  onPick?: (value: string) => void
}) {
  const auto = useId()
  const listId = `${auto}-list`
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState('')
  const [box, setBox] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ s: '', at: 0 })

  const chosen = options.find((o) => o.value === value)
  const showFilter = options.length >= filterFrom
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q)
      || (o.hint ?? '').toLowerCase().includes(q))
  }, [options, query])

  /**
   * Where the list goes: under the button, or over it when there is no room.
   *
   * It returns the SAME object when nothing has moved. It did not, and the
   * layout effect that calls it had no dependency array -- so every render
   * set a fresh object, which caused a render, which set another. React gave
   * up at the depth limit and the page fell over the moment the list opened.
   * A new object every time is a new value every time, even when every number
   * in it is identical.
   */
  const place = () => {
    const b = btn.current?.getBoundingClientRect()
    if (!b) return
    const want = Math.min(320, 44 + shown.length * 38)
    const below = window.innerHeight - b.bottom - 12
    const up = below < want && b.top > below
    const next = { left: b.left, top: up ? b.top - 8 : b.bottom + 8, width: b.width, up }
    setBox((prev) => (prev && prev.left === next.left && prev.top === next.top
      && prev.width === next.width && prev.up === next.up) ? prev : next)
  }

  useLayoutEffect(() => { if (open) place() }, [open, shown.length])

  useEffect(() => {
    if (!open) return
    const move = () => place()
    // capture:true so it also follows a scroll inside the add popover's body
    window.addEventListener('scroll', move, true)
    window.addEventListener('resize', move)
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('scroll', move, true)
      window.removeEventListener('resize', move)
      document.removeEventListener('pointerdown', away)
    }
  }, [open])

  function openList() {
    const i = Math.max(0, options.findIndex((o) => o.value === value))
    setQuery(''); setActive(i); setOpen(true)
  }
  function pick(o: Opt) {
    setValue(o.value); setOpen(false); btn.current?.focus(); onPick?.(o.value)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.current?.focus(); return }
    if (e.key === 'Tab') { setOpen(false); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const o = shown[active]; if (o) pick(o)
      return
    }
    const last = shown.length - 1
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(last) }
    else if (!showFilter && e.key.length === 1) {
      // type-ahead, only where there is no filter box to type into
      const now = Date.now()
      typed.current.s = now - typed.current.at > 900 ? e.key : typed.current.s + e.key
      typed.current.at = now
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s.toLowerCase()))
      if (i >= 0) setActive(i)
    }
  }

  // Focus lands once, when the list opens. A callback ref calling focus()
  // fires on every render, which fights the filter box for the caret.
  useEffect(() => { if (open && !showFilter) list.current?.focus() }, [open, showFilter])

  // keep the active option in view as the arrows walk past the fold
  useEffect(() => {
    if (!open) return
    pop.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open, query])

  return (
    <div className="choice">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        ref={btn} type="button" id={id} className="field choice__btn"
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <span className={`choice__cur${chosen ? '' : ' choice__cur--none'}`}>
          {chosen?.label ?? placeholder}
        </span>
        <svg className="choice__car" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && box && typeof document !== 'undefined' && createPortal(
        <div
          ref={pop} className="choicepop"
          style={{
            left: box.left, width: Math.max(box.width, 200),
            ...(box.up ? { bottom: window.innerHeight - box.top } : { top: box.top }),
          }}
          onKeyDown={onKey}
        >
          {showFilter && (
            <div className="choicepop__find">
              <input
                className="field" autoFocus placeholder="Type to narrow it down"
                value={query} aria-label="Narrow the list"
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              />
            </div>
          )}
          <div className="choicepop__list" role="listbox" id={listId}
               aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
               tabIndex={showFilter ? -1 : 0} ref={list}>
            {shown.length === 0 && <div className="choicepop__none">Nothing matches that.</div>}
            {shown.map((o, i) => (
              <div
                key={o.value} id={`${listId}-${i}`} role="option"
                aria-selected={o.value === value}
                data-active={i === active}
                className={`choice__opt${i === active ? ' is-active' : ''}${o.value === value ? ' is-on' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o)}
              >
                <span className="choice__opt__l">{o.label}</span>
                {o.hint && <span className="choice__opt__h">{o.hint}</span>}
                {o.value === value && (
                  <svg className="choice__tick" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
