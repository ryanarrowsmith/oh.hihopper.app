'use client'
import { useMemo } from 'react'
import { OP_WORD, asked, type Spec, type Tab } from '@/lib/pivot'

/**
 * The filters the report decided to ask rather than answer.
 *
 * A Looker page has four dropdowns and two toggles above the chart, and none
 * of them change the report for anybody else -- they are the question the
 * person looking has right now. A Hopper report's filters were all the other
 * kind: part of what the report is, changed for everyone or not at all.
 *
 * A filter marked "ask" in the builder appears here instead. The answer lives
 * in this screen and goes when the person does; nothing is saved, because
 * saving it would be the thing the report already does.
 *
 * The choices come from the rows the browser holds, which on a big sheet is a
 * sample -- so this offers what it has seen and still takes anything typed.
 * Offering only what a sample knows, with no way past it, would be a filter
 * that cannot reach half the sheet.
 */
export default function PivotAsk({ tab, spec, onSpec }: {
  tab: Tab
  spec: Spec
  onSpec: (s: Spec) => void
}) {
  const rows = asked(spec)
  const seen = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const { f } of rows) {
      const i = tab.columns.findIndex((c) => c.key === f.field || c.label === f.field)
      if (i < 0) continue
      const set = new Set<string>()
      for (const r of tab.rows) {
        const v = r[i]
        if (v !== null && v !== undefined && String(v).trim() !== '') set.add(String(v))
        if (set.size > 60) break
      }
      out.set(f.field, [...set].sort((a, b) => a.localeCompare(b)))
    }
    return out
  }, [tab, rows])

  if (rows.length === 0) return null

  const set = (at: number, a: string) =>
    onSpec({ ...spec, filters: spec.filters.map((f, n) => (n === at ? { ...f, a } : f)) })

  return (
    <div className="pvask">
      {rows.map(({ f, i }) => {
        const list = seen.get(f.field) ?? []
        const id = `ask-${i}`
        return (
          <label className="pvask__one" key={i} htmlFor={id}>
            <span className="pvask__l">{f.field} <em>{OP_WORD[f.op]}</em></span>
            <input className="field" id={id} list={list.length ? `${id}-opts` : undefined}
                   value={f.a ?? ''} placeholder="anything"
                   onChange={(e) => set(i, e.target.value)} />
            {list.length > 0 && (
              <datalist id={`${id}-opts`}>
                {list.map((v) => <option key={v} value={v} />)}
              </datalist>
            )}
          </label>
        )
      })}
      {rows.some(({ f }) => (f.a ?? '') !== '') && (
        <button type="button" className="btn pvask__clear"
                onClick={() => onSpec({
                  ...spec,
                  filters: spec.filters.map((f) => (f.ask ? { ...f, a: '' } : f)),
                })}>
          Clear
        </button>
      )}
    </div>
  )
}
