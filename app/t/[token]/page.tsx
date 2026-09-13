import { openTicket } from '@/lib/crew'
import { t, fmtLength } from '@/lib/i18n'
import CrewTabs from '@/components/CrewTabs'

export const dynamic = 'force-dynamic'

/**
 * The crew ticket.
 *
 * Outside the (app) group on purpose: no rail, no top bar, no sign-in. A crew
 * opens this on a phone in a yard, and everything that is not the job is in
 * the way.
 *
 * A token that is unknown, revoked or past its date gets the SAME page — the
 * job is over, come back to the office — because a reply that differs is a way
 * to test tokens.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ticket = await openTicket(token)

  if (!ticket) {
    return (
      <main className="ck ck--gone">
        <h1>Este enlace ya no está activo</h1>
        <p>This link is no longer active. Ask your project manager for a new one.</p>
      </main>
    )
  }

  const { lang, job } = ticket
  const tx = (k: string) => t(k, lang)

  return (
    <main className="ck">
      <header className="ck__h">
        <b>{job.name}</b>
        <span className="ck__meta">
          {job.ref}
          {job.site_address ? ` · ${job.site_address}` : ''}
          {job.crew ? ` · ${job.crew}` : ''}
        </span>
      </header>

      {job.pin_note && (
        <p className="ck__pin">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M8 14.5s5-4.6 5-8a5 5 0 10-10 0c0 3.4 5 8 5 8z" /><circle cx="8" cy="6.5" r="1.8" />
          </svg>
          {job.pin_note}
        </p>
      )}

      <CrewTabs ticket={ticket} labels={{
        sow: tx('fence.section.sow'),
        materials: tx('ticket.materials'),
        tools: tx('ticket.tools'),
        closeout: tx('ticket.closeout'),
        locates: tx('ticket.locates'),
        photos: tx('ticket.photos'),
        photosNeed: tx('ticket.photos.need'),
        sign: tx('ticket.sign'),
        signNeeds: tx('ticket.sign.needs'),
        shortage: tx('ticket.short'),
        noPrices: tx('ticket.noprices'),
        length: fmtLength(0, lang).replace(/^0[^ ]* /, ''),
      }} />

      <p className="ck__foot">{tx('ticket.noprices')}</p>
    </main>
  )
}
