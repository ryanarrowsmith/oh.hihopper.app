import Link from 'next/link'
import Avatar from '@/components/Avatar'
import { CEILING, PROMPT_AT, daysSince, quarterLabel, type Member } from '@/lib/staffing'

/**
 * One person, as a row in somebody's line of report.
 *
 * Three facts, in the order a manager acts on them: when you last sat down
 * with them, what the last settled quarter said, and whether there is anything
 * on file. The score wears a word as well as a number -- "8 of 12" is a
 * measurement, "Talk" is what the measurement is for.
 */
export default function StaffRow({ m }: { m: Member }) {
  const since = daysSince(m.lastMeeting)
  const low = m.score !== null && m.score <= PROMPT_AT
  const stale = since !== null && since > 90

  return (
    <Link href={`/staffing/${m.id}` as any} className="strow">
      <Avatar name={m.name} src={m.photo} size={38} />
      <span className="strow__who">
        <b>{m.name}</b>
        <em>{[m.role, m.org].filter(Boolean).join(' · ') || 'No title yet'}</em>
      </span>

      <span className={`strow__f${stale ? ' is-stale' : ''}`}>
        <i>One-to-one</i>
        <b>
          {since === null ? 'Never'
            : since === 0 ? 'Today'
            : since === 1 ? 'Yesterday'
            : `${since} days ago`}
        </b>
        {m.nextMeeting && <u>next {m.nextMeeting.slice(5).replace('-', '/')}</u>}
      </span>

      <span className={`strow__f${low ? ' is-low' : ''}`}>
        <i>Last settled</i>
        <b>{m.score === null ? 'Not scored' : `${m.score} of ${CEILING}`}</b>
        {m.period && <u>{quarterLabel(m.period)}{low ? ' · talk' : ''}</u>}
      </span>

      <span className="strow__f">
        <i>On file</i>
        <b>{m.docs === 0 && m.notes === 0 ? 'Nothing' : `${m.notes + m.docs}`}</b>
        {(m.notes > 0 || m.docs > 0) &&
          <u>{[m.notes && `${m.notes} note${m.notes > 1 ? 's' : ''}`,
              m.docs && `${m.docs} doc${m.docs > 1 ? 's' : ''}`]
              .filter(Boolean).join(' · ')}</u>}
      </span>

      <svg className="strow__go" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
