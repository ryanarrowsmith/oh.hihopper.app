'use client'
import { useState } from 'react'
import Choice from '@/components/Choice'
import type { Addr, AddrKind } from '@/lib/addresses'

const PIN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21.5s7.2-7.6 7.2-12.3A7.2 7.2 0 0 0 4.8 9.2C4.8 13.9 12 21.5 12 21.5z" />
    <circle cx="12" cy="9.2" r="2.6" />
  </svg>
)
const ENV = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.6" y="5" width="18.8" height="14" rx="1.6" /><path d="m3 6.4 9 6.2 9-6.2" />
  </svg>
)
export const KIND_MARK: Record<AddrKind, JSX.Element> = { physical: PIN, mailing: ENV }

type Row = Addr & { key: string }
const blank = (kind: AddrKind): Row => ({
  key: Math.random().toString(36).slice(2), id: null, kind,
  address_line1: '', address_line2: '', city: '', region: '',
  postal_code: '', country: 'United States',
})

/**
 * A location's addresses, as a form.
 *
 * The fields repeat rather than being numbered, so the server gets them
 * index-aligned however many blocks there are and removing one in the middle
 * leaves no hole. Only one may be physical -- the database enforces it, and the
 * picker enforces it too, by demoting whichever one held the title before
 * rather than refusing the click and making somebody work out why.
 */
export default function AddressFields({ start = [] }: { start?: Addr[] }) {
  const [rows, setRows] = useState<Row[]>(
    start.length
      ? start.map((a) => ({ ...a, key: a.id ?? Math.random().toString(36).slice(2) }))
      : [blank('physical')])

  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const pick = (i: number, kind: AddrKind) => setRows((r) => r.map((x, j) => {
    if (j === i) return { ...x, kind }
    // One physical, so naming a new one un-names the old one where you can see
    // it happen, rather than in an error after you press Save.
    if (kind === 'physical' && x.kind === 'physical') return { ...x, kind: 'mailing' as AddrKind }
    return x
  }))

  return (
    <>
      <p className="addrsay">
        A location can keep more than one. The physical one is the place people go to —
        it is what gets mapped and what Hopper shows first; a mailing address is where
        post goes and is never pinned. With no physical address, the first on the list
        is shown instead.
      </p>

      {rows.map((a, i) => (
        <div className="addrbox" key={a.key}>
          <input type="hidden" name="addr_id" value={a.id ?? ''} />
          <input type="hidden" name="addr_kind" value={a.kind} />
          <input type="hidden" name="addr_country" value={a.country ?? 'United States'} />

          <div className="addrbox__h">
            <span className="addrbox__n">Address {i + 1}</span>
            <span className="addrbox__pick">
              <Choice name={`kindshow-${a.key}`} defaultValue={a.kind} filterFrom={99}
                      options={[{ value: 'physical', label: 'Physical' },
                                { value: 'mailing', label: 'Mailing' }]}
                      onPick={(v) => pick(i, v as AddrKind)} />
            </span>
            {rows.length > 1 && (
              <span className="addrbox__x">
                <button className="lnk" type="button"
                        onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </span>
            )}
          </div>

          <div className="formrow">
            <div><label htmlFor={`a1-${a.key}`}>Street</label>
              <input className="field" id={`a1-${a.key}`} name="addr_line1"
                     autoComplete="address-line1" value={a.address_line1 ?? ''}
                     onChange={(e) => set(i, { address_line1: e.target.value })} /></div>
            <div><label htmlFor={`a2-${a.key}`}>Suite, unit, floor</label>
              <input className="field" id={`a2-${a.key}`} name="addr_line2"
                     value={a.address_line2 ?? ''}
                     onChange={(e) => set(i, { address_line2: e.target.value })} /></div>
          </div>
          <div className="formrow">
            <div><label htmlFor={`ct-${a.key}`}>City</label>
              <input className="field" id={`ct-${a.key}`} name="addr_city"
                     value={a.city ?? ''}
                     onChange={(e) => set(i, { city: e.target.value })} /></div>
            <div><label htmlFor={`rg-${a.key}`}>State</label>
              <input className="field" id={`rg-${a.key}`} name="addr_region"
                     value={a.region ?? ''}
                     onChange={(e) => set(i, { region: e.target.value })} /></div>
            <div><label htmlFor={`pc-${a.key}`}>Postal code</label>
              <input className="field" id={`pc-${a.key}`} name="addr_postal_code"
                     value={a.postal_code ?? ''}
                     onChange={(e) => set(i, { postal_code: e.target.value })} /></div>
          </div>
        </div>
      ))}

      <div className="rowacts">
        <button className="btn btn--sm" type="button"
                onClick={() => setRows((r) => [...r,
                  blank(r.some((x) => x.kind === 'physical') ? 'mailing' : 'physical')])}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Add another address
        </button>
      </div>
    </>
  )
}
