/**
 * The colours somebody can pick as their favourite.
 *
 * A palette rather than the operating system's colour wheel, because the answer
 * is "forest green" — a thing you can say out loud — and not #2F6E4F.
 *
 * It lives here and not in the form because the CARD has to be able to draw it.
 * It did not: the picker stored the name and the card set `background: Forest
 * green`, which is not a colour any browser knows, so most of them painted
 * nothing. The handful that did work — Navy, Plum, Lavender, Chocolate — were
 * the ones whose names happen to also be CSS keywords, which is the kind of
 * coincidence that makes a bug look intermittent.
 */
export const PALETTE: [string, string][] = [
  ['Ink black', '#231F20'], ['Slate', '#55524D'], ['Paper white', '#FBF9F5'],
  ['Steel blue', '#2D5D7B'], ['Sky', '#7FA8C4'], ['Navy', '#1B3A55'],
  ['Forest green', '#2F6E4F'], ['Moss', '#6E8A5A'], ['Mint', '#9FCFB4'],
  ['Marigold', '#F2A93B'], ['Butter', '#F5D98B'], ['Rust', '#B8552F'],
  ['Brick red', '#A73C2C'], ['Rose', '#D98A97'], ['Plum', '#6B3F63'],
  ['Lavender', '#A99BC7'], ['Chocolate', '#5A4132'], ['Sand', '#D8C7A8'],
]

const BY_NAME = new Map(PALETTE.map(([name, hex]) => [name.toLowerCase(), hex]))

/** The hex for a stored name. A value that is already a colour is left alone,
 *  so anything saved before this existed still draws. */
export function hexOf(value: string | null | undefined): string | null {
  if (!value) return null
  const hit = BY_NAME.get(value.trim().toLowerCase())
  if (hit) return hit
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : null
}
