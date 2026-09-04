'use client'
import { useEffect, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import CrumbTail from '@/components/CrumbTail'
import { MarkPick } from '@/components/PostForm'
import { I, Kat, PLUS } from '@/components/NewsBits'
import { retireCategory, saveCategory } from '@/app/actions/news'

type Row = { id: string; name: string; mark: string; active: boolean; used: number }

/**
 * What kinds of announcement this account makes.
 *
 * Each one carries a mark, chosen here, because a category on a list is a shape
 * with its name on the tip rather than a word in a box. Nothing deletes: a
 * category out of use goes inactive and keeps everything already filed under it.
 */
export default function NewsCategories({ rows, mayEdit }: { rows: Row[]; mayEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [, go] = useTransition()

  return (
    <>
      <CrumbTail>Categories</CrumbTail>
      <div className="pj__h">
        <div className="pj__id">
          <h1>News categories</h1>
          <p className="pjline">
            <span>{rows.length === 0 ? 'None yet' : `${rows.length} named`}</span>
            <span>{rows.filter((r) => !r.active).length} out of use</span>
          </p>
        </div>
        {mayEdit && !adding && (
          <div className="pj__go">
            <button className="btn btn--amber btn--mark" type="button"
                    aria-label="Add a category" data-tip="Add a category"
                    onClick={() => setAdding(true)}>{I(PLUS, '2.2')}</button>
          </div>
        )}
      </div>

      {adding && <Form onDone={() => setAdding(false)} />}

      <section className="tdcard">
        <div className="tdcard__bar"><b>Categories</b>
          <span className="tdcard__sub">a mark and a name</span></div>
        <div className="tdcard__body">
          {rows.length === 0
            ? <p className="pjnone pjnone--tight">None yet. Add the first one.</p>
            : rows.map((r) => (
                <div className={`nrowi${r.active ? '' : ' is-off'}`} key={r.id}>
                  <span className="nrowi__d"><Kat mark={r.mark} name={r.name} /></span>
                  <span className="nrowi__b">
                    <p className="nrowi__t">{r.name}</p>
                    <p className="nrowi__s">
                      {r.used === 0 ? 'Nothing filed under it yet'
                        : `${r.used} announcement${r.used === 1 ? '' : 's'}`}
                      {!r.active && ' · out of use'}
                    </p>
                  </span>
                  {mayEdit && (
                    <span className="nrowi__m">
                      <button className="lnk" type="button" onClick={() => go(async () => {
                        const x = await retireCategory(r.id, !r.active)
                        if (!x.ok) setSaid(x.message)
                      })}>{r.active ? 'Take out of use' : 'Put back'}</button>
                    </span>
                  )}
                </div>
              ))}
          {said && <p className="swhy">{said}</p>}
        </div>
      </section>
    </>
  )
}

function Form({ onDone }: { onDone: () => void }) {
  const [state, action] = useFormState(saveCategory, null)
  // Closes because the save worked, never during a render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])
  return (
    <form className="tdedit" action={action}>
      <div className="formrow formrow--lean">
        <div><label htmlFor="cn">What it is called</label>
          <input className="field" id="cn" name="name" required maxLength={60}
                 placeholder="Notice" autoFocus autoComplete="off" /></div>
        <div><label>Its mark</label><MarkPick name="mark" /></div>
      </div>
      <div className="rowacts">
        <Go />
        <button className="btn" type="button" onClick={onDone}>Cancel</button>
      </div>
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function Go() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add it'}
    </button>
  )
}
