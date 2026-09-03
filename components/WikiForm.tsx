'use client'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Choice from '@/components/Choice'
import WikiEditor from '@/components/WikiEditor'
import { saveDoc } from '@/app/actions/wiki'

type Named = { id: string; name: string }
type Person = { id: string; full_name: string }

function Go({ label, busy, amber }: { label: string; busy: string; amber?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className={`btn${amber ? ' btn--amber' : ''}`} type="submit"
            name="intent" value={amber ? 'publish' : 'draft'} disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}

export default function WikiForm({ doc, cats, ents, people, me }: {
  doc?: any; cats: Named[]; ents: Named[]; people: Person[]; me: string | null
}) {
  const [state, action] = useFormState(saveDoc, null)
  const [body, setBody] = useState<any>(doc?.body ?? null)
  const [title, setTitle] = useState<string>(doc?.title ?? '')
  const [tags, setTags] = useState<string[]>(doc?.tags ?? [])
  const [draft, setDraft] = useState('')

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/,+$/, '')
    if (t && !tags.includes(t) && tags.length < 20) setTags([...tags, t])
    setDraft('')
  }

  return (
    <form action={action}>
      {doc?.id && <input type="hidden" name="id" value={doc.id} />}
      <input type="hidden" name="body" value={JSON.stringify(body ?? { type: 'doc', content: [] })} />
      <input type="hidden" name="tags" value={tags.join(',')} />

      <div className="hi">
        <div className="hi__t">
          <h1>{doc?.id ? 'Editing' : 'New document'}</h1>
          <p className="scopeline"><span>
            {doc?.status === 'published'
              ? 'Published. Saving a draft would take it back out of sight, so this stays published.'
              : 'It saves as a draft until you publish it.'}
          </span></p>
        </div>
        <div className="hi__go">
          {doc?.status !== 'published' && <Go label="Save draft" busy="Saving…" />}
          <Go label={doc?.status === 'published' ? 'Save' : 'Publish'} busy="Publishing…" amber />
        </div>
      </div>

      <div className="wed">
        <input className="wed__title" name="title" value={title} required
               onChange={(e) => setTitle(e.target.value)}
               placeholder="What is this document called?" aria-label="Title" />

        <div className="wed__bar">
          <span className="wed__pick">
            <Choice name="category_id" defaultValue={doc?.category_id ?? ''}
                    placeholder="Category" filterFrom={8}
                    options={[{ value: '', label: 'No category yet' },
                              ...cats.map((c) => ({ value: c.id, label: c.name }))]} />
          </span>
          <span className="wed__pick">
            <Choice name="entity_id" defaultValue={doc?.entity_id ?? ''}
                    placeholder="Who it is for" filterFrom={8}
                    options={[{ value: '', label: 'Everybody' },
                              ...ents.map((e) => ({ value: e.id, label: e.name }))]} />
          </span>
          <span className="wed__pick">
            <Choice name="owner_id" defaultValue={doc?.owner_id ?? me ?? ''}
                    placeholder="Who keeps it" filterFrom={8}
                    options={people.map((p) => ({ value: p.id, label: p.full_name }))} />
          </span>

          {/* Tags are typed, not picked: the point of a tag is the word that
              was in somebody's head, and a list of existing ones quietly asks
              them to pick a near-miss instead. */}
          <span className="tagbox">
            {tags.map((t) => (
              <span className="wtag" key={t}>{t}
                <button type="button" aria-label={`Remove ${t}`}
                        onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
              </span>
            ))}
            <input value={draft} onChange={(e) => {
                     if (e.target.value.includes(',')) addTag(e.target.value)
                     else setDraft(e.target.value)
                   }}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') { e.preventDefault(); addTag(draft) }
                     else if (e.key === 'Backspace' && !draft && tags.length) {
                       setTags(tags.slice(0, -1))
                     }
                   }}
                   onBlur={() => addTag(draft)}
                   placeholder={tags.length ? 'Add a tag…' : 'Tags — the words people will search for'}
                   aria-label="Tags" />
          </span>
        </div>

        <WikiEditor start={doc?.body ?? undefined} onChange={setBody} />
      </div>

      {state && !state.ok && <p className="swhy">{state.message}</p>}
      {state?.ok && <p className="fine" style={{ marginTop: 10 }}>{state.message}</p>}
    </form>
  )
}
