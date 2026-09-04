/**
 * The small pieces the pivot builder and the pivot view both draw with.
 *
 * Deliberately no 'use client'. A Server Component may not import a plain
 * value out of a client module -- Next turns those exports into client
 * references and the server gets a proxy -- and that mistake has taken two of
 * this app's pages down in production. Marks and icons are plain values, so
 * they live somewhere a server page could import them from without knowing to
 * be careful.
 */
import type { FieldType } from '@/lib/pivot'

/** What a field holds, said in two characters. Not where it may go: any field
 *  may go anywhere now, and a mark that looked like a permission was the whole
 *  confusion the old builder created. */
export const TYPE_MARK: Record<FieldType, string> = {
  text: 'Aa', number: '12', date: '31',
}
export const TYPE_WORD: Record<FieldType, string> = {
  text: 'Text', number: 'A number', date: 'A date',
}

export const I = (d: string, k?: string) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={k}
       dangerouslySetInnerHTML={{ __html: d }} />
)

export const CARET = '<path d="M6 9l6 6 6-6"/>'
export const X = '<path d="M6 6l12 12M18 6L6 18"/>'
export const PLUS = '<path d="M12 5v14M5 12h14"/>'
/** A question mark in a circle: this one gets asked rather than answered. */
export const ASK = '<circle cx="12" cy="12" r="9"/>'
  + '<path d="M9.4 9.3a2.7 2.7 0 1 1 3.4 2.6c-.5.2-.8.7-.8 1.2v.6"/>'
  + '<circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>'

export const GRIP = '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/>'
  + '<circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/>'
  + '<circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>'

/** Where a field can land. The order is the order they are drawn in, which is
 *  also the order somebody reads the question: what is measured, and cut how. */
export const WELLS = ['rows', 'columns', 'values', 'filters'] as const
export type Well = typeof WELLS[number]

export const WELL_WORD: Record<Well, string> = {
  rows: 'Rows', columns: 'Columns', values: 'Values', filters: 'Filters',
}
export const WELL_SAY: Record<Well, string> = {
  rows: 'down the side',
  columns: 'across the top',
  values: 'what is measured, and how it is added up',
  filters: 'which rows count at all',
}

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
/** A figure in a cell. An empty cell is a dash, not a nought -- nothing landed
 *  there, which is not the same as something landing there and being zero. */
export const figure = (v: number | null) => (v === null ? '—' : nf.format(v))
