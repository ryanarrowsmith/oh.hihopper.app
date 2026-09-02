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
