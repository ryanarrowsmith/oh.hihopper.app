'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * A date, typed or picked.
 *
 * A native date input draws the operating system's calendar, which is the same
 * objection as the native <select>: it cannot be made to match anything. This
 * is Hopper's own — a field you can type into and a month you can click, which
 * are the two ways people actually enter a date, and neither should exclude the
 * other.
 */
export default function DateField({ value, onChange, label }: {
  value: string | null
  onChange: (iso: string | null) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(value ?? '')
  const [month, setMonth] = useState(() => firstOf(value ?? today()))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { setTyped(value ?? '') }, [value])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  // Typing is accepted the moment it becomes a real date and ignored until
  // then, so half a date never wipes the one that was there.
  function typeIt(v: string) {
    setTyped(v)
    if (v === '') return onChange(null)
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`))) {
      onChange(v)
      setMonth(firstOf(v))
    }
  }

  const cells = monthCells(month)

  return (
    <div className="dfield" ref={box}>
      <input className="field" value={typed} placeholder="YYYY-MM-DD" aria-label={label}
             onChange={(e) => typeIt(e.target.value)} />
      <button className="dfield__b" type="button" aria-label={`Pick ${label.toLowerCase()}`}
              aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" />
          <path d="M3 10h18M8 3v4M16 3v4" /></svg>
      </button>

      {open && (
        <div className="cal" role="dialog" aria-label={label}>
          <div className="cal__h">
            <button className="cal__nav" type="button" aria-label="Previous month"
                    onClick={() => setMonth(shift(month, -1))}>
              <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <b>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
            <button className="cal__nav" type="button" aria-label="Next month"
                    onClick={() => setMonth(shift(month, 1))}>
              <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>
          <div className="cal__g">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) =>
              <span className="cal__d" key={i}>{d}</span>)}
            {cells.map((c) => (
              <button key={c.iso} type="button"
                      className={`cal__c${c.out ? ' cal__c--out' : ''}`
                        + (c.iso === value ? ' cal__c--on' : '')
                        + (c.iso === today() ? ' cal__c--today' : '')}
                      onClick={() => { onChange(c.iso); setOpen(false) }}>
                {c.day}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => iso(new Date())
const firstOf = (s: string) => { const d = new Date(`${s}T00:00:00`); d.setDate(1); return d }
const shift = (d: Date, by: number) => new Date(d.getFullYear(), d.getMonth() + by, 1)

/** Six weeks, always, so the calendar does not change height as you page. */
function monthCells(month: Date) {
  const start = new Date(month)
  start.setDate(1 - start.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { iso: iso(d), day: d.getDate(), out: d.getMonth() !== month.getMonth() }
  })
}
