import type { AddrKind } from '@/lib/addresses'

/**
 * A pin means the place you go to; an envelope means where post goes.
 *
 * These live in a module of their own, with no 'use client' on it, because BOTH
 * sides need them: the address form is a client component, and the location
 * page that renders an address is a server component.
 *
 * They used to live in AddressFields, which is a client component -- and a
 * value exported across that boundary and read by a server component does not
 * arrive as the object it was. Next turns every export of a 'use client' module
 * into a client REFERENCE, so the server got a proxy where it expected a React
 * element and threw while rendering it. A component would have survived the
 * trip; a plain object holding elements does not. That is what was behind
 * "Application error: a server-side exception has occurred" on every single
 * location page, and only on those, since the day a location grew a second
 * address.
 */
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
