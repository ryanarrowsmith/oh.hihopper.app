'use client'
import { useState } from 'react'

/**
 * The link a customer signs, ready to leave with a person.
 *
 * Hopper does not mail it, for the same reason it does not mail the billing
 * handoff: mail an app writes gets eaten by corporate filters and the person
 * waiting never learns there was anything to wait for. The salesperson is
 * already talking to this customer.
 */
export default function QuoteLink({ url }: { url: string }) {
  const [said, setSaid] = useState<string | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setSaid('Copied.')
    } catch {
      setSaid('This browser would not give up the clipboard. Select it and copy it by hand.')
    }
  }

  return (
    <div className="fxlink">
      <code className="fxlink__u">{url}</code>
      <div className="fxlink__go">
        <button className="btn" type="button" onClick={copy}>Copy the link</button>
        <a className="btn btn--quiet" href={url} target="_blank" rel="noreferrer">
          See what they see
        </a>
      </div>
      {said && <p className="note note--ok">{said}</p>}
    </div>
  )
}
