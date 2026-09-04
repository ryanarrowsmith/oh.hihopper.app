'use client'
import { useEffect, useRef, useState } from 'react'
import {
  AGGS_FOR, AGG_SHORT, AGG_SAY, AGG_WORD, GRAINS, GRAIN_WORD, OP_WORD,
  type Agg, type Col, type Filter, type FilterOp, type Grain, type Placed,
  type Spec, type Value,
} from '@/lib/pivot'
import { TYPE_MARK, TYPE_WORD, WELLS, WELL_SAY, WELL_WORD, I, CARET, X, type Well }
  from '@/components/PivotBits'

/**
 * Where the fields go.
 *
 * Two ways in, on purpose. Dragging is the fast one and the one anybody who
 * has met a pivot expects; tapping the field and choosing a well is the one
 * that works on a phone and from a keyboard. Neither is the "real" way -- the
 * builder has to be usable with a thumb, and a drag-only pivot is a pivot you
 * cannot touch away from a desk.
 */

/** A small panel hung off a control. The beak takes the color of the panel's
 *  top edge, and the panel is never inside a box that clips. */
function Pop({ label, cur, children, tone }: {
  label: string; cur: string; tone?: 'val'
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <span className="pvhow" ref={box}>
      <button type="button" className={`pvchip__how${tone ? ' pvchip__how--val' : ''}`}
              aria-expanded={open} aria-label={label}
              onClick={() => setOpen((o) => !o)}>
        {cur}{I(CARET)}
      </button>
      {open && <span className="pvpop" role="menu">{children(() => setOpen(false))}</span>}
    </span>
  )
}

const OPS: FilterOp[] = ['is', 'not', 'has', 'gte', 'lte', 'empty', 'filled']
const NEEDS_A = (op: FilterOp) => op !== 'empty' && op !== 'filled'

function Chip({ name, children, onOff }: {
  name: string; children?: React.ReactNode; onOff: () => void
}) {
  return (
    <span className="pvchip">
      <span className="pvchip__n">{name}</span>
      {children}
      <button type="button" className="pvchip__x" onClick={onOff}
              aria-label={`Take ${name} out`}>{I(X)}</button>
    </span>
  )
}

export default function PivotBuild({ cols, spec, onSpec }: {
  cols: Col[]
  spec: Spec
  onSpec: (s: Spec) => void
}) {
  const [over, setOver] = useState<Well | null>(null)
  /** Which field is waiting to be told where to go, on a screen with no drag. */
  const [asking, setAsking] = useState<string | null>(null)

  const typeOf = (label: string) =>
    cols.find((c) => c.key === label || c.label === label)?.type ?? 'text'

  const put = (well: Well, field: string) => {
    const t = typeOf(field)
    if (well === 'values') {
      // A text or a date can only be counted. Offering Sum of a name is
      // offering an answer that does not exist.
      const agg: Agg = t === 'number' ? 'sum' : 'count'
      onSpec({ ...spec, values: [...spec.values, { field, agg }] })
      return
    }
    if (well === 'filters') {
      onSpec({ ...spec, filters: [...spec.filters, { field, op: 'is', a: '' }] })
      return
    }
    const p: Placed = t === 'date' ? { field, grain: 'month' } : { field }
    const other: Well = well === 'rows' ? 'columns' : 'rows'
    onSpec({
      ...spec,
      // The same field down the side AND across the top is a grid of one cell.
      [other]: spec[other].filter((q) => q.field !== field),
      [well]: [...spec[well].filter((q) => q.field !== field), p],
    })
  }

  const drop = (well: Well) => (e: React.DragEvent) => {
    e.preventDefault()
    setOver(null)
    const f = e.dataTransfer.getData('text/hopper-field')
    if (f) put(well, f)
  }
  const allow = (well: Well) => (e: React.DragEvent) => { e.preventDefault(); setOver(well) }

  const setPlaced = (well: 'rows' | 'columns', i: number, next: Placed) =>
    onSpec({ ...spec, [well]: spec[well].map((p, n) => (n === i ? next : p)) })
  const dropPlaced = (well: 'rows' | 'columns', i: number) =>
    onSpec({ ...spec, [well]: spec[well].filter((_, n) => n !== i) })
  const setValue = (i: number, next: Value) =>
    onSpec({ ...spec, values: spec.values.map((v, n) => (n === i ? next : v)) })
  const setFilter = (i: number, next: Filter) =>
    onSpec({ ...spec, filters: spec.filters.map((f, n) => (n === i ? next : f)) })

  const placedChips = (well: 'rows' | 'columns') => spec[well].map((p, i) => (
    <Chip key={`${p.field}-${i}`} name={p.field} onOff={() => dropPlaced(well, i)}>
      {typeOf(p.field) === 'date' && (
        <Pop label={`How ${p.field} is cut`} cur={GRAIN_WORD[p.grain ?? 'day']}>
          {(close) => GRAINS.map((g) => (
            <button key={g} type="button" className="pvpop__o" role="menuitem"
                    aria-current={(p.grain ?? 'day') === g || undefined}
                    onClick={() => { setPlaced(well, i, { ...p, grain: g }); close() }}>
              {GRAIN_WORD[g]}
            </button>
          ))}
        </Pop>
      )}
    </Chip>
  ))

  const chipsIn = (well: Well) => {
    if (well === 'rows' || well === 'columns') return placedChips(well)
    if (well === 'values') return spec.values.map((v, i) => (
      <Chip key={`${v.field}-${i}`} name={v.field}
            onOff={() => onSpec({ ...spec, values: spec.values.filter((_, n) => n !== i) })}>
        <Pop label={`How ${v.field} is added up`} cur={AGG_SHORT[v.agg]} tone="val">
          {(close) => AGGS_FOR(typeOf(v.field)).map((a) => (
            <button key={a} type="button" className="pvpop__o" role="menuitem"
                    aria-current={v.agg === a || undefined}
                    onClick={() => { setValue(i, { ...v, agg: a }); close() }}>
              <b>{AGG_WORD[a]}</b><em>{AGG_SAY[a]}</em>
            </button>
          ))}
        </Pop>
      </Chip>
    ))
    return spec.filters.map((f, i) => (
      <Chip key={`${f.field}-${i}`} name={f.field}
            onOff={() => onSpec({ ...spec, filters: spec.filters.filter((_, n) => n !== i) })}>
        <Pop label={`How ${f.field} is tested`} cur={OP_WORD[f.op]}>
          {(close) => OPS.map((op) => (
            <button key={op} type="button" className="pvpop__o" role="menuitem"
                    aria-current={f.op === op || undefined}
                    onClick={() => { setFilter(i, { ...f, op }); close() }}>
              {OP_WORD[op]}
            </button>
          ))}
        </Pop>
        {NEEDS_A(f.op) && (
          <input className="pvchip__a" value={f.a ?? ''} aria-label={`What ${f.field} is tested against`}
                 placeholder="what" size={Math.max(4, (f.a ?? '').length + 1)}
                 onChange={(e) => setFilter(i, { ...f, a: e.target.value })} />
        )}
      </Chip>
    ))
  }

  return (
    <div className="pv">
      <div className="pvf">
        <span className="pvf__h">Fields in this tab</span>
        {cols.map((c) => (
          <span className="pvfw" key={c.key}>
            <button type="button" className="pvfield" draggable
                    aria-expanded={asking === c.label || undefined}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/hopper-field', c.label)
                      e.dataTransfer.effectAllowed = 'copy'
                      setAsking(null)
                    }}
                    onClick={() => setAsking(asking === c.label ? null : c.label)}>
              <span className={`pvfield__t pvfield__t--${c.type}`} title={TYPE_WORD[c.type]}>
                {TYPE_MARK[c.type]}
              </span>
              {c.label}
            </button>
            {asking === c.label && (
              <span className="pvpop pvpop--go" role="menu">
                {WELLS.map((w) => (
                  <button key={w} type="button" className="pvpop__o" role="menuitem"
                          onClick={() => { put(w, c.label); setAsking(null) }}>
                    <b>{WELL_WORD[w]}</b><em>{WELL_SAY[w]}</em>
                  </button>
                ))}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="pvwells">
        {WELLS.map((w) => (
          <div key={w} onDragOver={allow(w)} onDrop={drop(w)}
               onDragLeave={() => setOver((o) => (o === w ? null : o))}
               className={`pvwell pvwell--${w}${over === w ? ' is-over' : ''}`}>
            <div className="pvwell__h"><b>{WELL_WORD[w]}</b><em>{WELL_SAY[w]}</em></div>
            <div className="pvwell__in">
              {chipsIn(w).length
                ? chipsIn(w)
                : <span className="pvwell__none">Drop a field here</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
