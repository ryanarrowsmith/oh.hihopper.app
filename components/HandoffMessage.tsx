'use client'
import { useState } from 'react'

/**
 * The message, laid out to be keyed from, ready to leave with a person.
 *
 * Hopper does not send it. That is not a missing feature: mail an app writes
 * gets eaten by corporate filters and the person waiting never learns there was
 * anything to wait for, which is the argument lib/invite-mail.ts makes at length
 * and the reason an invitation is offered the same way. Accounting also has no
 * Hopper account, so a link in place of the figures would be a door they cannot
 * open.
 *
 * So there are two doors and they are both a person's: open it in your own mail
 * app, or take it to the clipboard and paste it wherever the job actually goes.
 * Recording that it went is a separate act, below, because a button that claimed
 * to send and only wrote a row would be the worst of the three.
 */
export default function HandoffMessage({ subject, body, to }: {
  subject: string; body: string; to: string | null
}) {
  const [said, setSaid] = useState<string | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`)
      setSaid('On the clipboard, subject line and all.')
    } catch {
      setSaid('This browser would not give up the clipboard. Select it and copy it by hand.')
    }
  }

  const href = `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`

  return (
    <div className="fxsend">
      <div className="fxsend__go noprint">
        <a className="btn btn--amber" href={href}>Open it in your mail app</a>
        <button className="btn" type="button" onClick={copy}>Copy the message</button>
        {to && <span className="fxsend__to">Goes to <b>{to}</b></span>}
      </div>
      {said && <p className="note note--ok noprint">{said}</p>}
      {/* The two blocks above this one already show every figure the letter
          carries -- the five facts, then the lines and the total -- so the
          composed text is a second reading of what is on the screen. It stays,
          because somebody about to paste it into Outlook wants to see what they
          are pasting, but it stays folded: same disclosure as the finished work
          on the job page. */}
      <details className="fjdone fxsend__see">
        <summary>The message as it will read</summary>
        <pre className="fxsend__msg">{body}</pre>
      </details>
    </div>
  )
}
