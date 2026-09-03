/** One copy of each glyph. Three files drawing their own pencil is three
 *  pencils that drift apart. */
export const Pencil = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z" /><path d="M14.5 5.5 18.5 9.5" />
  </svg>
)
export const Plus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
export const Caret = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
       strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
)
/** The level arrow, in the deeper shade of the canvas. Same one the rail's
 *  submenu uses, so a child looks like a child wherever it appears. */
export const Level = ({ className = 'lv' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 2v6h6" /><path d="M7.5 5.5 10 8l-2.5 2.5" />
  </svg>
)

/** Head office. Not a status -- a fact about the office -- so it wears the
 *  squared steel tile rather than a chip. */
export const Star = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.2l2.6 5.6 6.1.8-4.5 4.2 1.2 6.1L12 17l-5.4 2.9 1.2-6.1L3.3 9.6l6.1-.8z" />
  </svg>
)
export const HeadOffice = ({ on, big }: { on: boolean; big?: boolean }) =>
  on
    ? (
      <span className={`hoflag${big ? ' hoflag--lg' : ''}`} role="img" aria-label="Head office"
            tabIndex={0}>
        <Star />
        <span className="hoflag__tip" aria-hidden="true">Head office</span>
      </span>
    )
    : <span className={`hoflag hoflag--none${big ? ' hoflag--lg' : ''}`} aria-hidden="true" />

/** The same pin that stands on the map. Lit when the address resolved. */
export const PinMark = ({ on }: { on: boolean }) => (
  <span className={`pinmark${on ? '' : ' pinmark--off'}`} role="img"
        aria-label={on ? 'Pinned to the map' : 'No pin yet'}
        title={on ? 'Pinned to the map' : 'No pin yet'}>
    <svg viewBox="0 0 24 32" aria-hidden="true">
      <path d="M12 31C12 31 22 19.8 22 12A10 10 0 1 0 2 12c0 7.8 10 19 10 19z" />
    </svg>
  </span>
)

/** The organization mark: a chart of boxes, used wherever an org is named
    beside its own name rather than standing in for it. */
export const OrgMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="5" rx="1" />
    <rect x="2.5" y="16" width="6" height="5" rx="1" />
    <rect x="15.5" y="16" width="6" height="5" rx="1" />
    <path d="M12 8v4M5.5 16v-2.5h13V16" />
  </svg>
)

/** The location mark. The same pin that stands on the map, drawn in line
    rather than filled, because here it is labelling a word and not a place. */
/** A person, for the one place a person is named inside somebody else's record. */
export const PersonMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
)

export const PlaceMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
)

/** What class of change an Activity row is: something made, something changed,
    something about access, something gone. Four shapes, four colours, so the
    kind is readable before the sentence is. */
export const ActMark = ({ kind }: { kind: 'made' | 'changed' | 'access' | 'gone' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'made' && <path d="M12 5v14M5 12h14" />}
    {kind === 'changed' && (
      <><path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z" /><path d="M14.5 5.5 18.5 9.5" /></>
    )}
    {kind === 'access' && (
      <><rect x="4" y="10" width="16" height="10" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
    )}
    {kind === 'gone' && <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />}
  </svg>
)
