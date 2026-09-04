'use client'
import { I, PRINT } from '@/components/NewsBits'

/** Print is a browser thing, so it needs a browser. A mark and a tip. */
export default function PrintButton() {
  return (
    <button className="btn btn--mark" type="button" onClick={() => window.print()}
            aria-label="Print this page" data-tip="Print this page">
      {I(PRINT, '1.8')}
    </button>
  )
}
