'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { setCondition } from '@/app/actions/survey'

/**
 * What a site turned out to have, and what each one costs.
 *
 * A fixed list rather than a free text box, because free text is how a $2,400
 * demolition becomes a sentence nobody prices. What somebody types here is a
 * QUANTITY; the figure beside it is the rate book's own, named so you can see
 * which line and when it was last checked. A condition with no book line
 * measures and does not price, and says so.
 *
 * Turning one on saves at once, because a toggle that needs a second press to
 * mean anything is a toggle people forget to press. A quantity saves when you
 * leave the field — typing "410" should not be four saves.
 */

export type Condition = {
  id: string; code: string; name_en: string; blurb_en: string | null
  rate_code: string | null; charge_code: string | null
  wants_qty: boolean
  uom: string | null; sell: number | null; verified_on: string | null
}
export type Found = { condition_id: string; qty: number | null; detail: string | null }

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const rate = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function SurveyConditions({
  jobId, where, conditions, found: initial, mayEdit,
}: {
  jobId: string
  where: 'quote' | 'survey'
  conditions: Condition[]
  found: Found[]
  mayEdit: boolean
}) {
  const [found, setFound] = useState<Record<string, Found>>(
    Object.fromEntries(initial.map((f) => [f.condition_id, f])))
  const [why, setWhy] = useState<string | null>(null)
  const [busy, go] = useTransition()

  const send = (c: Condition, on: boolean, row: Found | undefined) => {
    const form = new FormData()
    form.set('job_id', jobId)
    form.set('condition_id', c.id)
    form.set('where', where)
    if (on) {
      form.set('on', 'on')
      if (row?.qty != null) form.set('qty', String(row.qty))
      if (row?.detail) form.set('detail', row.detail)
    }
    go(async () => {
      const res = await setCondition(null, form)
      setWhy(res.ok ? null : res.message)
    })
  }

  const toggle = (c: Condition) => {
    if (!mayEdit) return
    const on = !(c.id in found)
    setFound((f) => {
      const next = { ...f }
      if (on) next[c.id] = { condition_id: c.id, qty: null, detail: null }
      else delete next[c.id]
      return next
    })
    send(c, on, found[c.id])
  }

  const edit = (c: Condition, patch: Partial<Found>) =>
    setFound((f) => ({ ...f, [c.id]: { ...f[c.id], condition_id: c.id, ...patch } as Found }))

  const line = (c: Condition, row: Found | undefined): number | null => {
    if (c.sell == null) return null
    const n = c.wants_qty ? (row?.qty ?? 0) : 1
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.round(c.sell * n * 100) / 100
  }

  const on = conditions.filter((c) => c.id in found)
  const total = on.reduce((s, c) => s + (line(c, found[c.id]) ?? 0), 0)
  const gaps = on.filter((c) => c.sell == null).length

  return (
    <>
      <ul className="svcond">
        {conditions.map((c) => {
          const row = found[c.id]
          const is = !!row
          const cost = line(c, row)
          return (
            <li key={c.id} className={is ? 'is-on' : ''}>
              <div className="svcond__t">
                <span className="tog">
                  <input type="checkbox" checked={is} disabled={!mayEdit || busy}
                         aria-label={c.name_en} onChange={() => toggle(c)} />
                  <span className="tog__track" /><span className="tog__knob" />
                </span>
                <span className="svcond__n">
                  <b>{c.name_en}</b>
                  {c.blurb_en && <span>{c.blurb_en}</span>}
                </span>
                {c.charge_code && <span className="svcode">{c.charge_code}</span>}
              </div>

              {is && (
                <div className="svcond__m">
                  {c.wants_qty && (
                    <label className="svcond__f">
                      <span>How {c.uom === 'ft' ? 'much' : 'many'}</span>
                      <input className="field field--n" inputMode="decimal"
                             disabled={!mayEdit}
                             defaultValue={row.qty ?? ''}
                             placeholder={c.uom ?? ''}
                             onChange={(e) => edit(c, {
                               qty: e.target.value.trim() === '' ? null : Number(e.target.value),
                             })}
                             onBlur={() => send(c, true, found[c.id])} />
                    </label>
                  )}
                  {c.wants_qty && <span className="svcond__x">&times;</span>}

                  {c.sell != null ? (
                    <div className="svcond__r">
                      <b>{rate(c.sell)}{c.uom ? ` / ${c.uom}` : ''}</b>
                      <span>
                        Rate book · {c.rate_code}
                        {c.verified_on
                          ? ` · checked ${new Date(c.verified_on + 'T00:00:00')
                              .toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
                          : ' · never checked'}
                      </span>
                    </div>
                  ) : (
                    <div className="svcond__gap">
                      No rate book line{c.rate_code ? ` for ${c.rate_code}` : ''}
                    </div>
                  )}

                  <div className="svcond__l">
                    <b>{cost == null ? 'Not priced' : cost === 0 ? '—' : money(cost)}</b>
                    <span>{cost == null
                      ? 'measured, and named on the revision'
                      : cost === 0 ? 'nothing entered'
                      : `on the revision as ${c.charge_code ?? 'no charge code'}`}</span>
                  </div>

                  <label className="svcond__d">
                    <input className="field" disabled={!mayEdit}
                           placeholder="Where, and anything the crew needs to know"
                           defaultValue={row.detail ?? ''}
                           onChange={(e) => edit(c, { detail: e.target.value })}
                           onBlur={() => send(c, true, found[c.id])} />
                  </label>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="svfoot">
        <b>{money(total)}</b>
        <span>
          {on.length} condition{on.length === 1 ? '' : 's'} found
          {gaps ? ` · ${gaps} measured but not priced` : ''}
        </span>
        <span className="sp" />
        <span className="svquiet">
          {why ?? (busy ? 'Saving…' : 'Every figure here is the rate book’s')}
        </span>
      </div>
      {why && <p className="note note--err" style={{ marginTop: 10 }}>{why}</p>}
    </>
  )
}
