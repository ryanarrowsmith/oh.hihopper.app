'use client'
import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { invitePerson, inviteLink, type Handout } from '@/app/actions/invite'

/**
 * Two ways to invite somebody, in the row you were looking at.
 *
 * Sending it is the first offer and stays the first offer -- almost always the
 * right one. The second exists because mail gets eaten: a corporate filter
 * that bins anything carrying a sign-in link does not bounce it, so the
 * invitation is neither delivered nor reported, and the person waiting never
 * learns there was something to wait for. Hopper cannot fix somebody else's
 * filter. It can hand you the same invitation to send with your own hands.
 *
 * The rich copy is the point of the second one. A link on its own gets pasted
 * into a mail and looks like a phishing attempt; the formatted version pastes
 * into Outlook and Gmail as an invitation that looks like it came from a
 * company. It goes on the clipboard as text/html AND text/plain, so whichever
 * the compose window reaches for, it gets something sensible.
 */
export default function InvitePanel({ id, name, email, onDone }: {
  id: string; name: string; email: string | null; onDone: () => void
}) {
  const [sent, send] = useFormState(invitePerson, null)
  const [made, make] = useFormState(inviteLink, null)

  if (!email) {
    return (
      <>
        <div className="rrec__lab">Inviting {name}</div>
        <p className="note note--err">
          {name} has no email address on file. An invitation is made against one — add it
          with the pencil and this will work.
        </p>
        <div className="rowacts">
          <button className="lnk" type="button" onClick={onDone}>Close</button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="rrec__lab">Inviting {name}</div>

      {sent?.ok
        ? <p className="note note--ok">{sent.message}</p>
        : (
          <>
            <p className="invsay">
              Hopper emails <b>{email}</b> a link to set a password and open{' '}
              {name.split(' ')[0]}’s account.
            </p>
            {sent && !sent.ok && <p className="note note--err">{sent.message}</p>}
            <form action={send}>
              <input type="hidden" name="id" value={id} />
              <div className="rowacts">
                <Go label="Email the invitation" busy="Sending…" />
                <button className="lnk" type="button" onClick={onDone}>Cancel</button>
              </div>
            </form>
          </>
        )}

      <div className="invor">
        <span>or</span>
      </div>

      {made?.ok && made.link ? (
        <Handed made={made} />
      ) : (
        <>
          <p className="invsay">
            <b>Send it yourself.</b> Some mail systems quietly bin anything carrying a
            sign-in link and never say so. This makes the same invitation without sending
            anything, ready to paste into Outlook or Gmail.
          </p>
          {made && !made.ok && <p className="note note--err">{made.message}</p>}
          <form action={make}>
            <input type="hidden" name="id" value={id} />
            <div className="rowacts">
              <Go label="Write it out for me" busy="Making it…" plain />
            </div>
          </form>
        </>
      )}
    </>
  )
}

function Go({ label, busy, plain }: { label: string; busy: string; plain?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button className={`btn ${plain ? '' : 'btn--amber'}`} type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  )
}

/**
 * The invitation, written out.
 *
 * Rich first, because that is the one somebody actually wants and the one they
 * would never assemble by hand. The link on its own is last: it is the piece
 * you need when you are typing into something that is not a mail client at
 * all.
 */
function Handed({ made }: { made: Handout }) {
  return (
    <>
      <p className="invsay">
        Nothing was sent. {made.to ? <>Addressed to <b>{made.to}</b>.</> : null} Whoever opens
        this link is signed in as them, so send it to them and to nobody else — and it is
        good for a little while only.
      </p>

      <dl className="invout">
        <div>
          <dt>Subject</dt>
          <dd><Copy label="Copy" value={made.subject ?? ''} /></dd>
        </div>
        <div>
          <dt>The message</dt>
          <dd>
            <Copy label="Copy for Outlook or Gmail" value={made.text ?? ''}
                  html={made.html} tip="Pastes with its formatting into a compose window" />
            <Copy label="Copy as plain text" value={made.text ?? ''} plain />
          </dd>
        </div>
        <div>
          <dt>Just the link</dt>
          <dd><Copy label="Copy the link" value={made.link ?? ''} plain /></dd>
        </div>
      </dl>

      {made.html && (
        <details className="invsee">
          <summary>See what it looks like</summary>
          <div className="invsee__p" dangerouslySetInnerHTML={{ __html: made.html }} />
        </details>
      )}
    </>
  )
}

/**
 * One button, two flavours of the same thing on the clipboard.
 *
 * With html, the clipboard carries text/html AND text/plain, so a compose
 * window takes the formatted version and a plain box takes the words. The
 * older execCommand path is the fallback for a browser that refuses
 * ClipboardItem, which is still most of them outside Chrome.
 */
function Copy({ label, value, html, plain, tip }: {
  label: string; value: string; html?: string; plain?: boolean; tip?: string
}) {
  const [done, setDone] = useState(false)

  async function go() {
    try {
      if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([value], { type: 'text/plain' }),
        })])
      } else if (html) {
        // No ClipboardItem: put the rendered markup in a live element, select
        // it, and let the browser's own copy do the conversion.
        const holder = document.createElement('div')
        holder.innerHTML = html
        holder.setAttribute('style', 'position:fixed;left:-9999px;top:0')
        document.body.appendChild(holder)
        const range = document.createRange()
        range.selectNodeContents(holder)
        const sel = window.getSelection()
        sel?.removeAllRanges(); sel?.addRange(range)
        document.execCommand('copy')
        sel?.removeAllRanges()
        holder.remove()
      } else {
        await navigator.clipboard.writeText(value)
      }
      setDone(true)
      setTimeout(() => setDone(false), 2200)
    } catch {
      setDone(false)
    }
  }

  return (
    <button className={`btn btn--sm invcopy${plain ? '' : ' btn--amber'}`} type="button"
            onClick={go} data-tip={tip}>
      {done ? 'Copied' : label}
    </button>
  )
}
