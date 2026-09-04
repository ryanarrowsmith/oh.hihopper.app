'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { I, CLIP, LINK, PLUS } from '@/components/NewsBits'
import { addFile, addLink, setPostStatus } from '@/app/actions/news'
import type { Post } from '@/lib/news'

/**
 * What an administrator can do to an announcement that already exists.
 *
 * Attaching and linking live here rather than on the composer because both hang
 * off the announcement -- it has to be there before anything can hang off it,
 * and a form that pretends otherwise is a form that loses the file.
 */
export default function PostExtras({ post }: { post: Post }) {
  const [adding, setAdding] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [, go] = useTransition()

  return (
    <section className="tdcard">
      <div className="tdcard__bar">
        <b>Add to it</b>
        <span className="tdcard__sub">
          {post.status === 'draft' ? 'still a draft'
            : post.status === 'retired' ? 'retired' : 'posted'}
        </span>
        <span className="tdcard__go nstatus">
          {post.status !== 'posted' && (
            <button className="lnk" type="button" onClick={() => go(async () => {
              const r = await setPostStatus(post.id, 'posted'); if (!r.ok) setSaid(r.message)
            })}>Post it</button>
          )}
          {post.status === 'posted' && (
            <button className="lnk" type="button" onClick={() => go(async () => {
              const r = await setPostStatus(post.id, 'retired'); if (!r.ok) setSaid(r.message)
            })}>Retire it</button>
          )}
          {post.status === 'retired' && (
            <button className="lnk" type="button" onClick={() => go(async () => {
              const r = await setPostStatus(post.id, 'posted'); if (!r.ok) setSaid(r.message)
            })}>Bring it back</button>
          )}
        </span>
      </div>
      <div className="tdcard__body">
        <div className="tdopen__go" style={{ marginTop: 2 }}>
          <Attach post={post.id} />
          {!adding && (
            <button className="lnk lnk--add" type="button" onClick={() => setAdding(true)}>
              {I(LINK, '2')}Add a link
            </button>
          )}
        </div>
        {adding && <AddLink post={post.id} onDone={() => setAdding(false)} />}
        {said && <p className="swhy">{said}</p>}
      </div>
    </section>
  )
}

/** The browser's own file button is the one control nobody can style, so the
 *  input is hidden and the label is it. Choosing a file submits. */
function Attach({ post }: { post: string }) {
  const [state, action] = useFormState(addFile, null)
  const form = useRef<HTMLFormElement>(null)
  return (
    <form action={action} ref={form} className="tdclip">
      <input type="hidden" name="post_id" value={post} />
      <label className="lnk lnk--add" htmlFor={`nf-${post}`}>{I(CLIP, '2')}Attach a file</label>
      <input id={`nf-${post}`} className="tdclip__in" type="file" name="file"
             onChange={() => form.current?.requestSubmit()} />
      {state && !state.ok && <p className="swhy">{state.message}</p>}
    </form>
  )
}

function AddLink({ post, onDone }: { post: string; onDone: () => void }) {
  const [state, action] = useFormState(addLink, null)
  // Closes because the save worked, never during a render: useFormState keeps
  // its last result for good.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (state?.ok) onDone() }, [state])
  return (
    <form className="tdedit" action={action}>
      <input type="hidden" name="post_id" value={post} />
      <div className="formrow formrow--lean">
        <div><label htmlFor={`ll-${post}`}>What it is</label>
          <input className="field" id={`ll-${post}`} name="label" required maxLength={200}
                 placeholder="The benefits portal" autoFocus autoComplete="off" /></div>
        <div><label htmlFor={`lu-${post}`}>Where it goes</label>
          <input className="field" id={`lu-${post}`} name="url" required
                 placeholder="benefits.example.com" autoComplete="off" /></div>
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
