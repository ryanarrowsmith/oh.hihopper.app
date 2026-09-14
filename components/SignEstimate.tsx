'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signEstimate } from '@/app/actions/sign'

/**
 * The signature.
 *
 * A typed name, a title, an email, and a sentence saying what pressing the
 * button means -- which is not "buy a fence". Signing puts On Call on the
 * property to survey and measure; the firm price comes after that. Ryan settled
 * the order on 14 Sep: estimate, then survey, then price.
 *
 * The button is disabled until there is a name in the box, and once pressed it
 * stays disabled. A double-press cannot double-sign anyway -- the signature row
 * is unique on the link -- but a button that looks pressable while the first
 * press is in flight is a button somebody presses twice.
 */
export default function SignEstimate({ token, price, was }: {
  token: string; price: string
  /** Who it was addressed to. Filled in rather than asked for: the person who
   *  opened the link is usually them, and a form that makes somebody retype
   *  what you already knew reads as a form that was not expecting them. Every
   *  box is still theirs to change -- an assistant signing for their boss is
   *  the ordinary case, not an error. */
  was: { name: string; title: string | null; email: string | null } | null
}) {
  const router = useRouter()
  const [name, setName] = useState(was?.name ?? '')
  const [title, setTitle] = useState(was?.title ?? '')
  const [email, setEmail] = useState(was?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState<string | null>(null)

  const go = async () => {
    setBusy(true); setBad(null)
    const r = await signEstimate(token, { name, title, email })
    if (r.ok) { router.refresh(); return }
    setBad(r.message); setBusy(false)
  }

  return (
    <section className="est__sec est__accept">
      <h2>What happens next</h2>
      <p>
        Signing does not buy a fence. It says the scope above is the work you want and puts
        us on your property to survey and measure it, at no charge. You then get a firm
        price. If it matches this estimate we go ahead; if the ground says otherwise you see
        the new number first, and nothing is built until you have agreed to it in writing.
      </p>

      <div className="est__sign">
        <label>
          <span>Your full name</span>
          <input className="est__field" value={name} autoComplete="name"
                 onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>Title</span>
          <input className="est__field" value={title} autoComplete="organization-title"
                 onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>Email</span>
          <input className="est__field" value={email} type="email" autoComplete="email"
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      <div className="est__go">
        <button className="est__btn" type="button" disabled={busy || name.trim().length < 2}
                onClick={go}>
          {busy ? 'Signing…' : `Sign for ${price}`}
        </button>
        <span>
          Typing your name here is your signature. We record the date and time with it.
        </span>
      </div>
      {bad && <p className="est__bad">{bad}</p>}
    </section>
  )
}
