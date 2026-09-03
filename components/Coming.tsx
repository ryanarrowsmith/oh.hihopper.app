import Link from 'next/link'
import Ask from '@/components/Ask'

/**
 * A module Hopper has a place for and does not have yet.
 *
 * Seven links in the rail led to a 404. Two ways out of that: take the links
 * down, or make the destination true. Taking them down is what the rule about
 * not rendering what somebody cannot do would normally say -- but these are not
 * things this person may not do, they are things nobody can do yet, and hiding
 * the shape of the product from the people paying for it is a different kind of
 * dishonesty. So the links stay and the pages say exactly where they are.
 *
 * The one thing each page can actually do is take a request, which is not a
 * consolation prize: seven pages that quietly count who wanted what is better
 * planning than any of my guesses about the order to build them in.
 */
export type Coming = {
  title: string
  /** One sentence, in Hopper's terms rather than a category name. */
  is: string
  /** What it will do, concretely enough to disagree with. */
  will: string[]
  /** What to use instead, today. */
  meanwhile?: { label: string; href: string; why: string }
}

export default function ComingPage({ m, accountId }: { m: Coming; accountId: string }) {
  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>{m.title}</h1>
        <p className="scopeline"><span>{m.is}</span></p>
      </div></div>

      <div className="soon">
        <div className="soon__b">
          <p className="soon__k">Not built yet</p>
          <p className="soon__l">
            This is a real part of Hopper that has not been written. It is here
            because the shape of the product is not a secret — not because
            something went wrong.
          </p>

          <p className="soon__s">What it will do</p>
          <ul className="soon__w">
            {m.will.map((w) => <li key={w}>{w}</li>)}
          </ul>

          {m.meanwhile && (
            <p className="soon__m">
              <b>Until then</b> {m.meanwhile.why}{' '}
              <Link href={m.meanwhile.href as any}>{m.meanwhile.label}</Link>.
            </p>
          )}
        </div>

        <div className="soon__a">
          <p className="soon__s">Want it sooner?</p>
          <p className="soon__l">
            Say what you would use it for. It goes to the people building Hopper,
            with your name on it, and it is the only thing that moves the order.
          </p>
          <Ask subject={`${m.title}: what I would use it for`} accountId={accountId} />
        </div>
      </div>
    </>
  )
}
