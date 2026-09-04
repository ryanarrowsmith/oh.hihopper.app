import type { LogEntry } from '@/lib/todo'

/**
 * The log, with a mark on every entry saying what KIND of thing happened.
 *
 * The calendar is the one that earns its place: a date that moved is the entry
 * people scan for, and "Moved the task Go to the dealership from Sep 4 to
 * Sep 11 (7 days later)" reads as prose in a stack of prose until a calendar
 * sits beside it. The rest follow so the calendar is a member of a set rather
 * than the one decorated line.
 *
 * The entries themselves are written by the database at the moment the row
 * changes -- so a date cannot move without the log saying so, whoever moved it
 * and from wherever.
 */
const MARK: Record<string, string> = {
  moved: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  added: '<path d="M12 5v14M5 12h14"/>',
  assigned: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  closed: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3 11 15l5-5.6"/>',
  blocked: '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>',
  status: '<path d="M4 16.5 9.5 11l3.5 3.5L20 7"/><path d="M15 7h5v5"/>',
  note: '<path d="M5 4h14v16l-7-3-7 3z"/>',
}
const SAYS: Record<string, string> = {
  moved: 'A date changed', added: 'Something was added', assigned: 'Put on somebody',
  closed: 'Ticked off', blocked: 'Waiting on something', status: 'The list was called',
  note: 'Somebody wrote this',
}

export default function Log({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return <p className="pjnone">Nothing has happened yet.</p>
  return (
    <div className="log pjlog">
      {entries.map((e) => (
        <div className={`log__e log__e--${e.kind}`} key={e.id}>
          <span className="log__k" role="img" aria-label={SAYS[e.kind] ?? e.kind}
                data-tip={SAYS[e.kind] ?? e.kind}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
                 strokeLinecap="round" strokeLinejoin="round"
                 dangerouslySetInnerHTML={{ __html: MARK[e.kind] ?? MARK.note }} />
          </span>
          <p className="log__m">
            <b>{e.author ?? 'Hopper'}</b>
            <span>{new Date(e.at).toLocaleString('en-US',
              { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          </p>
          <p className="log__b">{e.body}</p>
        </div>
      ))}
    </div>
  )
}
