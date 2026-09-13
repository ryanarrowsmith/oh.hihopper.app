/**
 * A state carried by a mark, with the word beside it.
 *
 * Standing rule: iconography with pop over a colored text label. The eye
 * catches the padlock before it reads "sealed", and the two people on a crew
 * who do not separate those hues get the same information as everybody else.
 */
export type MarkKind =
  | 'edit' | 'read' | 'sealed' | 'warn' | 'late' | 'absent' | 'done' | 'idle'

const PATHS: Record<MarkKind, string> = {
  edit:   'M11.2 2.4l2.4 2.4L5.6 12.8 2.4 13.6l.8-3.2z',
  read:   'M1.4 8S3.8 3.8 8 3.8 14.6 8 14.6 8 12.2 12.2 8 12.2 1.4 8 1.4 8z',
  sealed: 'M3.6 7.2h8.8v6.2H3.6z',
  warn:   'M8 1.9l6.2 11H1.8z',
  late:   '',
  absent: '',
  done:   '',
  idle:   '',
}

export function FenceMark({ kind, children, title }: {
  kind: MarkKind; children?: React.ReactNode; title?: string
}) {
  return (
    <span className={`fjmark fjmark--${kind}`} title={title}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {kind === 'sealed' && <>
          <path d={PATHS.sealed} />
          <path d="M5.6 7.2V5.1a2.4 2.4 0 014.8 0v2.1" />
        </>}
        {kind === 'read' && <>
          <path d={PATHS.read} /><circle cx="8" cy="8" r="1.9" />
        </>}
        {kind === 'warn' && <>
          <path d={PATHS.warn} /><path d="M8 6.3v3.1M8 11.2v.2" />
        </>}
        {kind === 'late' && <>
          <circle cx="8" cy="8" r="6" /><path d="M8 4.6V8l2.4 1.6" />
        </>}
        {kind === 'absent' && <>
          <circle cx="8" cy="8" r="5.8" /><path d="M4 12L12 4" />
        </>}
        {kind === 'edit' && <path d={PATHS.edit} />}
        {/* In use, and merely on the list. A tick and a dot, because "not in
            this document" in an icon-sized column wraps to four lines. */}
        {kind === 'done' && <path d="M3 8.4l3.2 3.2L13 4.8" />}
        {kind === 'idle' && <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />}
      </svg>
      {children}
    </span>
  )
}
