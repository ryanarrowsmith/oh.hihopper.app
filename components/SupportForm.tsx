'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { support } from '@/lib/support'
import Choice from '@/components/Choice'
import type { RequestKind, Urgency } from '@/lib/beebee-support'

/**
 * The form.
 *
 * Two fields are required and the rest have defaults, because the barrier to
 * saying "this is broken" should be as close to nothing as it can be. Kind and
 * urgency are offered because the reporter is the only one who knows them:
 * urgency is what it costs THEM, and it is a different question from priority,
 * which is ours and is not on this form.
 *
 * The submit token is made once per form instance and held in a ref, not made
 * per submit. That is the whole of the double-tap protection -- a token minted
 * inside the handler is a new token every press and opens two requests.
 */
const KINDS: { value: RequestKind; label: string; hint: string }[] = [
  { value: 'question', label: 'A question',   hint: 'How do I…' },
  { value: 'bug',      label: 'Something broken', hint: 'It did the wrong thing' },
  { value: 'access',   label: 'Access',       hint: 'I cannot see or open something' },
  { value: 'billing',  label: 'Billing',      hint: 'About the account or the money' },
  { value: 'feedback', label: 'An idea',      hint: 'It could be better if…' },
]

const URGENCIES: { value: Urgency; label: string; hint: string }[] = [
  { value: 'whenever', label: 'Whenever',  hint: 'No rush' },
  { value: 'soon',     label: 'Soon',      hint: 'It is in my way' },
  { value: 'blocking', label: 'Blocking',  hint: 'I cannot work' },
]

export default function SupportForm({ accountId }: { accountId: string }) {
  const router = useRouter()
  const client = useRef(support(accountId))
  const token = useRef(client.current.newSubmitToken())

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<RequestKind>('question')
  const [urgency, setUrgency] = useState<Urgency>('soon')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ ref: string } | null>(null)
  const [why, setWhy] = useState<string | null>(null)

  async function send() {
    if (!subject.trim() || !body.trim()) {
      setWhy('It needs a line about what happened and a sentence or two underneath.')
      return
    }
    setBusy(true); setWhy(null)
    const { request, error } = await client.current.open({
      subject: subject.trim(), body: body.trim(), kind, urgency,
      files, idempotencyKey: token.current,
    })
    setBusy(false)
    if (error || !request) { setWhy(error ?? 'It did not send.'); return }

    setSent({ ref: request.ref })
    setSubject(''); setBody(''); setFiles([])
    // A new instance of the form is a new request, so it gets a new token.
    token.current = client.current.newSubmitToken()
    router.refresh()
  }

  if (sent) {
    return (
      <div className="sok">
        <b>{sent.ref}</b>
        <p>
          That&rsquo;s with us. You&rsquo;ll get an email when somebody answers, and it&rsquo;s
          in the list below in the meantime.
        </p>
        <button className="btn" type="button" onClick={() => setSent(null)}>
          Ask about something else
        </button>
      </div>
    )
  }

  return (
    <div className="sform">
      <div className="formrow formrow--one">
        <div>
          <label htmlFor="s-sub">What happened</label>
          <input className="field" id="s-sub" value={subject} maxLength={160}
                 placeholder="The Refresh button on a report does nothing"
                 onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>

      <div className="formrow formrow--one">
        <div>
          <label htmlFor="s-body">And a little more</label>
          <textarea className="field sform__t" id="s-body" rows={5} value={body}
                    placeholder="What you expected, and what it did instead."
                    onChange={(e) => setBody(e.target.value)} />
        </div>
      </div>

      <div className="formrow">
        <div>
          <label htmlFor="s-kind">What kind of thing</label>
          <Choice id="s-kind" name="kind" defaultValue={kind}
                  onPick={(v) => setKind(v as RequestKind)}
                  options={KINDS.map((k) => ({ value: k.value, label: k.label, hint: k.hint }))} />
        </div>
        <div>
          {/* What it costs THEM. Priority is ours and is deliberately not here. */}
          <label htmlFor="s-urg">How much it is in your way</label>
          <Choice id="s-urg" name="urgency" defaultValue={urgency}
                  onPick={(v) => setUrgency(v as Urgency)}
                  options={URGENCIES.map((u) => ({ value: u.value, label: u.label, hint: u.hint }))} />
        </div>
      </div>

      <label className="sfile">
        <span>
          {files.length === 0
            ? 'Add a screenshot'
            : `${files.length} ${files.length === 1 ? 'picture' : 'pictures'} — add another`}
        </span>
        <input type="file" accept="image/*,application/pdf" multiple
               onChange={(e) => {
                 setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])
                 e.target.value = ''
               }} />
      </label>
      {files.length > 0 && (
        <ul className="sfiles">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name}
              <button type="button" aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>&times;</button>
            </li>
          ))}
        </ul>
      )}

      <div className="rowacts">
        <button className="btn btn--amber" type="button" onClick={send} disabled={busy}>
          {busy ? 'Sending…' : 'Send it'}
        </button>
      </div>

      {why && <p className="swhy">{why}</p>}

      {/* Said plainly, because a form that quietly harvests context is worse
          than one that says what it takes. */}
      <p className="fine">
        Sent with it: the page you were on, your build, your browser and screen
        size. Not sent: anything about who you are — that comes from your
        sign-in, which is the only way it can&rsquo;t be faked.
      </p>
    </div>
  )
}
