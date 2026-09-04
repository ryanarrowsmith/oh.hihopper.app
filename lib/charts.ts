/**
 * The catalogue of marks, and the rules about them.
 *
 * A plain module with no 'use client' on it, deliberately: a server action has
 * to validate the type it is handed, and importing that list out of a client
 * component makes the list itself a client reference -- which fails at build
 * with "attempted to call flatMap() from the server". One list, readable from
 * both sides, and Chart re-exports it so nothing that already imported it from
 * there had to change.
 */
export const CHART_KINDS = [
  { group: 'Compare', kinds: [
    { k: 'col',  t: 'Columns',           s: 'One measure, period by period.' },
    { k: 'colg', t: 'Grouped columns',   s: 'Two or three measures side by side in each period.' },
    { k: 'barh', t: 'Horizontal bars',   s: 'When the labels are long. The reason this exists.' },
  ] },
  { group: 'Over time', kinds: [
    { k: 'line', t: 'Line',              s: 'The shape of a number, named at the end of its own line.' },
    { k: 'area', t: 'Area',              s: 'A line that says which way is up.' },
    { k: 'combo', t: 'Columns and a line', s: 'Two measures, two marks. Never two axes.' },
  ] },
  { group: 'Parts of a whole', kinds: [
    { k: 'stack',     t: 'Stacked columns', s: 'What the total is made of.' },
    { k: 'stack100',  t: '100% stacked',    s: 'The mix, when the total does not matter.' },
    { k: 'areastack', t: 'Stacked area',    s: 'The mix, over time.' },
    { k: 'pie',       t: 'Pie',             s: 'How one total splits. The latest reading only.' },
  ] },
  { group: 'Relationship', kinds: [
    { k: 'scatter', t: 'Scatter', s: 'Does one move with the other. Exactly two measures.' },
  ] },
  { group: 'One number', kinds: [
    { k: 'big', t: 'One number', s: 'No chart. The figure, and when it was read.' },
  ] },
] as const

export type ChartKind =
  'col'|'colg'|'barh'|'line'|'area'|'combo'|'stack'|'stack100'|'areastack'|'pie'|'scatter'|'big'|'bar'

/**
 * A mark for each kind, drawn rather than named.
 *
 * A list of twelve chart types reads as twelve sentences; the same list with a
 * mark against each reads as a set of choices, and the one you want is found by
 * shape before the words are read at all. Same 24 box and same stroke as every
 * other icon in here, so they sit in a row without one of them looking heavier.
 */
export const KIND_ICON: Record<string, string> = {
  col:  '<path d="M5 20V11M12 20V5M19 20v-6"/>',
  colg: '<path d="M4 20v-7M8 20V8M14 20v-9M18 20V5"/>',
  barh: '<path d="M4 6h13M4 12h8M4 18h16"/>',
  line: '<path d="M3 16l5-6 4 4 8-9"/>',
  area: '<path d="M3 17l5-6 4 4 8-9v11z"/>',
  combo: '<path d="M5 20v-6M11 20v-9M17 20v-4"/><path d="M3 9l6-4 5 3 7-5"/>',
  stack: '<rect x="5" y="12" width="5" height="8"/><rect x="5" y="7" width="5" height="5"/>'
       + '<rect x="14" y="14" width="5" height="6"/><rect x="14" y="10" width="5" height="4"/>',
  stack100: '<rect x="5" y="4" width="5" height="16"/><path d="M5 12h5"/>'
          + '<rect x="14" y="4" width="5" height="16"/><path d="M14 9h5"/>',
  areastack: '<path d="M3 20h18"/><path d="M3 15l5-4 5 3 8-6v8z"/>',
  pie: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 4"/>',
  scatter: '<path d="M4 20V4M4 20h16"/><circle cx="9" cy="15" r="1.3"/><circle cx="13" cy="10" r="1.3"/>'
         + '<circle cx="17" cy="12" r="1.3"/><circle cx="11" cy="17" r="1.3"/>',
  big: '<path d="M9 8l3-2v12"/><path d="M8 18h8"/>',
}

/**
 * Whether a kind can say anything at all with this many measures.
 *
 * Not the same question as measureCap, which is how many a kind will DRAW. A
 * scatter given one measure has nothing to plot it against and a stack given
 * one has nothing to stack -- neither is a choice worth offering, and an
 * offered choice that produces an empty box is worse than one that is absent.
 */
export function appliesTo(kind: string, measures: number) {
  if (measures < 1) return false
  // Exactly two: one is meaningless, three has no second axis or second mark
  // to put the third on.
  if (kind === 'scatter' || kind === 'combo') return measures === 2
  // Two or more: a part needs a whole to be part of.
  if (kind === 'colg' || kind === 'stack' || kind === 'stack100' || kind === 'areastack') {
    return measures >= 2
  }
  return true
}

/** How many measures a type will actually draw. The builder reads this rather
 *  than carrying its own copy of the rule. */
export function measureCap(kind: string) {
  if (kind === 'pie' || kind === 'big') return 1
  if (kind === 'scatter') return 2
  if (kind === 'combo') return 2
  // 'col' is the plain single-measure column. 'barh' groups now -- the same
  // three the vertical grouped columns take -- because a horizontal bar exists
  // for long labels, and long labels are exactly what a category axis has.
  if (kind === 'col') return 1
  if (kind === 'barh') return 3
  // Stacked marks touch only their neighbours in a fixed order, so they carry
  // six; everything else past three is split into a plot each, where a heading
  // rather than a colour says which is which.
  if (kind === 'stack' || kind === 'stack100' || kind === 'areastack') return 6
  return 10
}


/** A kind's name, by its key. Derived, so it cannot drift from the catalogue. */
export const KIND_NAME: Record<string, string> =
  Object.fromEntries(CHART_KINDS.flatMap((g) => g.kinds.map((k) => [k.k, k.t])))

/** And its one sentence, by key. Same derivation, same reason. */
export const KIND_SAY: Record<string, string> =
  Object.fromEntries(CHART_KINDS.flatMap((g) => g.kinds.map((k) => [k.k, k.s])))
