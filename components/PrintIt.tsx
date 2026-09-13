'use client'

/** The one control on a printable page that the printed page must not carry. */
export default function PrintIt({ label = 'Print the record' }: { label?: string }) {
  return (
    <button className="btn noprint" type="button" onClick={() => window.print()}>
      {label}
    </button>
  )
}
