'use client'
import { useState, useTransition } from 'react'
import { setGates } from '@/app/actions/fence'

/**
 * The gates on a job: how many of each, and nothing else.
 *
 * Steppers rather than a number field, because this is used standing up with a
 * thumb and because the honest range is one to a handful. The whole list saves
 * as one act — a gate added and a gate removed in the same breath is one
 * decision, not two writes.
 *
 * Each row states what the opening costs the fence line, because that is the
 * connection nobody makes on their own: a 16-foot gate is sixteen feet of fence
 * you do not build and four terminal posts you do.
 */
type Kind = {
  code: string; name_en: string; cls: string
  width_ft: number | null; priced: boolean
}

export default function FenceGates({
  jobId, kinds, have, mayEdit,
}: {
  jobId: string
  kinds: Kind[]
  have: Record<string, number>
  mayEdit: boolean
}) {
  const [qty, setQty] = useState<Record<string, number>>(have)
  const [dirty, setDirty] = useState(false)
  const [say, setSay] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const bump = (code: string, by: number) => {
    setQty((q) => {
      const next = Math.max(0, (q[code] ?? 0) + by)
      const out = { ...q }
      if (next === 0) delete out[code]; else out[code] = next
      return out
    })
    setDirty(true); setSay(null)
  }

  const save = () => {
    const form = new FormData()
    form.set('job_id', jobId)
    form.set('gates', JSON.stringify(
      Object.entries(qty).map(([type_code, n]) => ({ type_code, qty: n }))))
    start(async () => {
      const r = await setGates(null, form)
      setSay(r.message)
      if (r.ok) setDirty(false)
    })
  }

  const on = kinds.filter((k) => (qty[k.code] ?? 0) > 0)
  const openings = on.reduce((s, k) => s + (k.width_ft ?? 0) * (qty[k.code] ?? 0), 0)

  return (
    <div className="fxgates">
      <ul className="fxgatelist">
        {kinds.map((k) => {
          const n = qty[k.code] ?? 0
          return (
            <li key={k.code} className={n > 0 ? 'fxgate is-on' : 'fxgate'}>
              <span className="fxgate__n">
                <b>{k.name_en}</b>
                <small>
                  {k.width_ft ? `${k.width_ft}′ opening` : 'no width on the catalog entry'}
                  {!k.priced && ' · the book cannot price it yet'}
                </small>
              </span>
              {mayEdit ? (
                <span className="fxstep">
                  <button type="button" aria-label={`One fewer ${k.name_en}`}
                          disabled={n === 0 || pending} onClick={() => bump(k.code, -1)}>−</button>
                  <b aria-live="polite">{n}</b>
                  <button type="button" aria-label={`One more ${k.name_en}`}
                          disabled={pending} onClick={() => bump(k.code, 1)}>+</button>
                </span>
              ) : <span className="fxstep fxstep--read"><b>{n}</b></span>}
            </li>
          )
        })}
      </ul>

      <p className="fxgatesum">
        {on.length === 0 ? 'No gates yet.' : (
          <>
            {on.reduce((s, k) => s + (qty[k.code] ?? 0), 0)} gates ·{' '}
            <b>{Math.round(openings)} ft</b> of opening comes out of the fence line, and{' '}
            <b>{on.reduce((s, k) => s + 2 * (qty[k.code] ?? 0), 0)} terminal posts</b> go back in.
          </>
        )}
      </p>

      {mayEdit && (
        <div className="fxgateacts">
          <button className="btn btn--amber" type="button" disabled={!dirty || pending}
                  onClick={save}>{pending ? 'Saving…' : 'Save the gates'}</button>
          {say && <span className={dirty ? 'note note--err' : 'note note--ok'}>{say}</span>}
        </div>
      )}
    </div>
  )
}
