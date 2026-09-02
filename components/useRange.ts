'use client'
import { useCallback, useEffect, useState } from 'react'

/**
 * Which time, asked once.
 *
 * A report is a shape over time, so "which time" is one question and not one
 * per screen. It is kept per browser and shared by Reporting, a report's own
 * page and (when it exists) Portfolio, so moving between them does not reset
 * the question you already answered.
 *
 * It filters the readings Hopper actually HAS, by the date column the sheet
 * itself supplies. A source with no dates is not filtered and says so, rather
 * than quietly showing nothing and looking broken.
 */
export type Preset = '30' | '90' | 'ytd' | 'all' | 'custom'
export type Range = { preset: Preset; from: string | null; to: string | null }

const KEY = 'hopper.range'
const DEFAULT: Range = { preset: 'all', from: null, to: null }

export const PRESETS: { k: Preset; label: string }[] = [
  { k: '30', label: 'Last 30 days' },
  { k: '90', label: 'Last 90' },
  { k: 'ytd', label: 'Year to date' },
  { k: 'all', label: 'All time' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The window a range actually means, as two days or nothing. */
export function windowOf(r: Range): { from: string | null; to: string | null } {
  if (r.preset === 'custom') return { from: r.from, to: r.to }
  if (r.preset === 'all') return { from: null, to: null }
  const now = new Date()
  if (r.preset === 'ytd') return { from: `${now.getFullYear()}-01-01`, to: iso(now) }
  const back = new Date(now)
  back.setDate(back.getDate() - (r.preset === '30' ? 30 : 90))
  return { from: iso(back), to: iso(now) }
}

export function inWindow(day: string, w: { from: string | null; to: string | null }) {
  // ISO days compare correctly as strings, which is the whole reason the reader
  // normalises Google's Date(2026,7,30) into one.
  if (w.from && day < w.from) return false
  if (w.to && day > w.to) return false
  return true
}

export function useRange() {
  // Starts at the default and corrects on mount rather than reading storage
  // during render: the server has no localStorage, and a first paint that
  // disagrees with the second is a flash of the wrong answer.
  const [range, setRange] = useState<Range>(DEFAULT)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v && typeof v.preset === 'string') setRange({ ...DEFAULT, ...v })
      }
    } catch { /* a browser that refuses storage still gets a working page */ }
    setReady(true)
  }, [])

  const put = useCallback((next: Range) => {
    setRange(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* not fatal */ }
  }, [])

  return { range, setRange: put, ready, window: windowOf(range) }
}
