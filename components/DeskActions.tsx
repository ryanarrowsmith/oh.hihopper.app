'use client'
import Link from 'next/link'
import RaiseTicket from '@/components/RaiseTicket'

type Q = { id: string; name: string; entity_id: string; facing: string }

const Ic = (d: string, w = '1.8') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
       dangerouslySetInnerHTML={{ __html: d }} />
)

const PRINTER = '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="1.5"/>'
  + '<path d="M7 14h10v7H7z"/>'
const COG = '<circle cx="12" cy="12" r="3.2"/>'
  + '<path d="M12 2.8v2.4M12 18.8v2.4M4.5 7.5l2 1.2M17.5 15.3l2 1.2M4.5 16.5l2-1.2M17.5 8.7l2-1.2"/>'

/**
 * What you can do to a queue, on paper and off it.
 *
 * Raising a ticket needs a queue to raise it INTO, and a desk with no queues
 * yet had nothing to offer -- so the header rendered empty and the person
 * looking at it had no way of knowing whether the button was missing or they
 * were. A control that cannot work is not drawn; the way to make it work is.
 */
export default function DeskActions({ queues, people, kinds, contacts, canConfigure }: {
  queues: Q[]
  people: { id: string; full_name: string }[]
  kinds: { id: string; name: string; entity_id: string }[]
  contacts: { id: string; name: string | null; email: string }[]
  canConfigure: boolean
}) {
  return (
    <div className="dkacts">
      <button className="btn btn--icon noprint" type="button"
              data-tip="Print this list" aria-label="Print this list"
              onClick={() => window.print()}>
        {Ic(PRINTER)}
      </button>

      {queues.length > 0
        ? <RaiseTicket queues={queues} people={people} kinds={kinds} contacts={contacts} />
        : canConfigure
        ? <Link href="/desk/settings" className="btn btn--amber">
            {Ic(COG, '1.9')}Set up a queue
          </Link>
        : null}
    </div>
  )
}
