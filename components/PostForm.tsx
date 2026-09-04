'use client'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import CrumbTail from '@/components/CrumbTail'
import WikiEditor from '@/components/WikiEditor'
import { I, Kat, MARKS, MARK_WORD, PLUS, day } from '@/components/NewsBits'
import { writePost } from '@/app/actions/news'
import type { Post } from '@/lib/news'

type Named = { id: string; name: string }
type Dept = Named & { entity_id: string }
type Cat = Named & { mark: string }

/**
 * Writing one.
 *
 * The body is the wiki's editor, not a second one: one rich-text editor in the
 * product means one set of blocks, one set of shortcuts and one thing to fix.
 *
 * Post and Save are the two commits, so they keep their words -- a mark is for
 * a thing you might press, and these are the things you meant to press.
 */
export default function PostForm({ orgs, departments, categories, post }: {
  orgs: Named[]; departments: Dept[]; categories: Cat[]; post?: Post
}) {
  const [state, action] = useFormState(writePost, null)
  const [org, setOrg] = useState(post?.entityId ?? orgs[0]?.id ?? '')
  const [doc, setDoc] = useState<any>(post?.body ?? null)
  const [banner, setBanner] = useState(post?.banner ?? false)
  const [days, setDays] = useState(String(post?.bannerDays ?? 10))
  const [when, setWhen] = useState(post?.postedOn ?? new Date().toISOString().slice(0, 10))

  // Only the departments of the organization chosen above it. A list that
  // offers a department belonging to somebody else is a list that can save
  // something the database will refuse.
  const mine = departments.filter((d) => d.entity_id === org)

  const off = (() => {
    const n = Number(days)
    if (!banner || !Number.isFinite(n)) return null
    return day(new Date(new Date(`${when}T00:00:00`).getTime() + n * 86_400_000)
      .toISOString().slice(0, 10))
  })()

  return (
    <form action={action}>
      <CrumbTail>{post ? post.title : 'Write one'}</CrumbTail>
      {post && <input type="hidden" name="id" value={post.id} />}
      <input type="hidden" name="body" value={doc ? JSON.stringify(doc) : ''} />

      <div className="pj__h">
        <div className="pj__id">
          <h1>{post ? 'Edit the announcement' : 'Write an announcement'}</h1>
          <p className="pjline">
            <span>{post?.status === 'posted' ? 'Posted' : 'A draft until you post it'}</span>
            {off && <span>Off the banner after {off}</span>}
          </p>
        </div>
        <div className="pj__go">
          <Go label="Save the draft" busy="Saving…" plain />
          <label className="btn btn--amber postgo">
            <input type="checkbox" name="post" defaultChecked={post?.status === 'posted'} />
            Post it
          </label>
        </div>
      </div>

      <section className="tdcard">
        <div className="tdcard__bar"><b>The announcement</b>
          <span className="tdcard__sub">title, date and what it is about</span></div>
        <div className="tdcard__body" style={{ paddingBottom: 16 }}>
          <div className="formrow formrow--one">
            <div><label htmlFor="ti">Title</label>
              <input className="field" id="ti" name="title" required maxLength={200}
                     defaultValue={post?.title ?? ''} autoFocus autoComplete="off"
                     placeholder="Open enrollment closes Friday" /></div>
          </div>
          <div className="formrow" style={{ marginTop: 12 }}>
            <div><label htmlFor="dt">Date</label>
              <input className="field" id="dt" name="posted_on" type="date" value={when}
                     onChange={(e) => setWhen(e.currentTarget.value)} /></div>
            <div><label htmlFor="ca">Category</label>
              <Choice id="ca" name="category_id" placeholder="None"
                      defaultValue={post?.categoryId ?? ''}
                      options={[{ value: '', label: 'None' },
                        ...categories.map((c) => ({ value: c.id, label: c.name }))]} /></div>
          </div>

          <div className="sheet__cut" style={{ margin: '20px 0 12px' }}><span>Who sees it</span></div>
          <div className="formrow">
            <div><label htmlFor="or">Organization</label>
              <Choice id="or" name="entity_id" required placeholder="Choose one"
                      defaultValue={org}
                      options={orgs.map((o) => ({ value: o.id, label: o.name }))}
                      onPick={(v) => setOrg(v)} /></div>
            <div><label htmlFor="de">Department</label>
              <Choice id="de" name="department_id" placeholder="Everyone in it"
                      defaultValue={post?.departmentId ?? ''}
                      options={[{ value: '', label: 'Everyone in it' },
                        ...mine.map((d) => ({ value: d.id, label: d.name }))]} /></div>
          </div>
          <p className="fine" style={{ margin: '8px 0 0' }}>
            Anybody who can see that organization can read this. Choose a department and it
            narrows to the people in it.
          </p>

          <div className="sheet__cut" style={{ margin: '20px 0 12px' }}><span>What it says</span></div>
          <WikiEditor start={post?.body} onChange={setDoc} />

          <div className="formrow" style={{ marginTop: 16 }}>
            <div><label htmlFor="tg">Tags</label>
              <input className="field" id="tg" name="tags" maxLength={160}
                     defaultValue={post?.tags.join(', ') ?? ''} autoComplete="off"
                     placeholder="Benefits, Deadline" /></div>
            <div />
          </div>
        </div>
      </section>

      <section className="tdcard">
        <div className="tdcard__bar"><b>The banner</b>
          <span className="tdcard__sub">
            {banner ? `runs for ${days} days from the date above` : 'not running'}
          </span></div>
        <div className="tdcard__body" style={{ paddingBottom: 14 }}>
          <div className="togline">
            <span className="tog">
              <input type="checkbox" name="banner" checked={banner}
                     onChange={(e) => setBanner(e.currentTarget.checked)}
                     aria-label="Run it across the top of the home page" />
              <span className="tog__track" /><span className="tog__knob" />
            </span>
            <span className="togline__say">
              <b>Run it across the top of the home page</b>
              <small>Above everything, full width, until it retires itself.</small>
            </span>
            <span className="bandays">
              <label htmlFor="bd">for</label>
              <input className="field" id="bd" name="banner_days" inputMode="numeric"
                     value={days} onChange={(e) => setDays(e.currentTarget.value)}
                     disabled={!banner} />
              <span>days</span>
            </span>
          </div>
          {off && (
            <p className="fine" style={{ margin: '2px 0 0' }}>
              It comes off the banner after <b>{off}</b> by itself. It stays in News for good.
            </p>
          )}
        </div>
      </section>

      {post && <Attached post={post} />}
      {state && !state.ok && <p className="swhy">{state.message}</p>}
      {!post && (
        <p className="fine" style={{ marginTop: 14 }}>
          Files and links can be added once it exists — they hang off the announcement, so it
          has to be there first.
        </p>
      )}
    </form>
  )
}

/**
 * A category's mark, chosen when it is named.
 *
 * Exported for the categories screen; it lives here because the shapes and the
 * words are already imported here and a second copy of the pair is a second
 * answer waiting to disagree.
 */
export function MarkPick({ name, start }: { name: string; start?: string }) {
  const [pick, setPick] = useState(start ?? 'notice')
  return (
    <span className="markpick">
      <input type="hidden" name={name} value={pick} />
      {Object.keys(MARKS).map((k) => (
        <button key={k} type="button" aria-pressed={pick === k}
                className={`markpick__b${pick === k ? ' is-on' : ''}`}
                aria-label={MARK_WORD[k]} data-tip={MARK_WORD[k]}
                onClick={() => setPick(k)}>
          {I(MARKS[k], '1.9')}
        </button>
      ))}
    </span>
  )
}

function Attached({ post }: { post: Post }) {
  return (
    <section className="tdcard">
      <div className="tdcard__bar"><b>Files and links</b>
        <span className="tdcard__sub">
          {post.items.length === 0 ? 'nothing yet' : `${post.items.length} attached`}
        </span></div>
      <div className="tdcard__body">
        <p className="pjnone pjnone--tight">
          Add them on the announcement itself — <a className="lnk" href={`/news/${post.id}`}>open it</a>.
        </p>
      </div>
    </section>
  )
}

function Go({ label, busy, plain }: { label: string; busy: string; plain?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className={plain ? 'btn' : 'btn btn--amber'} type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}
