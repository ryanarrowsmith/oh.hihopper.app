import type { PStatus } from '@/lib/projects'

/**
 * The status, as the head of a row.
 *
 * A filled cell you read before the name, in the colour the status already
 * means, with a mark for anybody the colour does not reach and the word itself
 * on hover and to a screen reader. Colour alone has never said anything.
 */
const MARK: Record<PStatus, string> = {
  // moving forward
  on_track: '<path d="M4 16.5 9.5 11l3.5 3.5L20 7"/><path d="M15 7h5v5"/>',
  // something wants looking at
  at_risk: '<path d="M12 4.5 21 20H3z"/><path d="M12 10v4"/><path d="M12 17v.1"/>',
  // the same padlock a blocked task wears
  blocked: '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>',
  complete: '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3 11 15l5-5.6"/>',
}
export const WORD: Record<PStatus, string> = {
  on_track: 'On track', at_risk: 'At risk', blocked: 'Blocked', complete: 'Complete',
}
const SHORT: Record<PStatus, string> = {
  on_track: 'on', at_risk: 'risk', blocked: 'block', complete: 'done',
}

export function StatusKey({ status }: { status: PStatus }) {
  return (
    <span className={`pk pk--${SHORT[status]}`} role="img"
          aria-label={WORD[status]} data-tip={WORD[status]}>
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: MARK[status] }} />
    </span>
  )
}

/** The bar takes the status colour, so a row reads as one thing rather than a
 *  coloured cell arguing with a neutral bar. */
export function PROGRESS({ done, total, status }: { done: number; total: number; status: PStatus }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <span>
      <span className={`pbar pbar--${SHORT[status]}`}><i style={{ width: `${pct}%` }} /></span>
      <span className="pnum">
        <b>{total === 0 ? '—' : `${pct}%`}</b>
        <span>{total === 0 ? 'no tasks yet' : `${done} of ${total} tasks`}</span>
      </span>
    </span>
  )
}
