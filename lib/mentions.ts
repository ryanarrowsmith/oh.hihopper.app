/**
 * Who a piece of writing names.
 *
 * Deliberately not tied to report notes: comments are coming everywhere, and a
 * mention parser that lived inside one feature would be re-implemented slightly
 * differently in the next one. Give it the roster and some text, get back the
 * people it names.
 *
 * Plain module -- no server-only, no use client -- because the editor wants it
 * to draw the highlight and the server wants it to decide who gets told, and
 * those must agree.
 */
export type Named = { id: string; name: string; email?: string | null }

/**
 * A full name can have a space in it, which is what makes this harder than a
 * regex for `@\w+`. "@Tom Vickers" and "@Tom" are both reasonable things to
 * type, so the text after an @ is matched against the roster longest-first --
 * otherwise "@Tom" wins inside "@Tom Vickers" and the mention names the wrong
 * span even when it finds the right person.
 *
 * Case-insensitive, and an email works too: people paste those.
 */
export function findMentions(text: string, roster: Named[]): Named[] {
  if (!text || roster.length === 0) return []

  // Longest first, so a person whose name contains a shorter colleague's name
  // cannot be shadowed by them.
  const keys: { key: string; who: Named }[] = []
  for (const p of roster) {
    keys.push({ key: p.name.toLowerCase(), who: p })
    const first = p.name.split(/\s+/)[0]
    if (first && first.length > 2) keys.push({ key: first.toLowerCase(), who: p })
    if (p.email) keys.push({ key: p.email.toLowerCase(), who: p })
  }
  keys.sort((a, b) => b.key.length - a.key.length)

  const hay = text.toLowerCase()
  const found = new Map<string, Named>()

  for (let i = 0; i < hay.length; i++) {
    if (hay[i] !== '@') continue
    // An @ inside a word is an email address in the middle of a sentence, not a
    // mention. Only one at the start of a word counts.
    if (i > 0 && /[\w.]/.test(hay[i - 1])) continue
    for (const { key, who } of keys) {
      if (!hay.startsWith(key, i + 1)) continue
      // The match has to END on a word boundary too, or "@Tom" fires inside
      // "@Tommy" and tells the wrong person they were named.
      const after = hay[i + 1 + key.length]
      if (after && /[\w]/.test(after)) continue
      found.set(who.id, who)
      break
    }
  }
  return [...found.values()]
}

/**
 * The text with each mention wrapped, for drawing.
 *
 * Returns pieces rather than HTML: handing a string of markup back to a React
 * component means dangerouslySetInnerHTML over text somebody typed, which is
 * how a comment box becomes a way to run script in a colleague's browser.
 */
export type Piece = { text: string; who?: Named }

export function splitMentions(text: string, roster: Named[]): Piece[] {
  const named = findMentions(text, roster)
  if (named.length === 0) return [{ text }]

  const keys: { key: string; who: Named }[] = []
  for (const p of named) {
    keys.push({ key: p.name.toLowerCase(), who: p })
    const first = p.name.split(/\s+/)[0]
    if (first && first.length > 2) keys.push({ key: first.toLowerCase(), who: p })
    if (p.email) keys.push({ key: p.email.toLowerCase(), who: p })
  }
  keys.sort((a, b) => b.key.length - a.key.length)

  const hay = text.toLowerCase()
  const out: Piece[] = []
  let at = 0
  for (let i = 0; i < hay.length; i++) {
    if (hay[i] !== '@') continue
    if (i > 0 && /[\w.]/.test(hay[i - 1])) continue
    const hit = keys.find(({ key }) => {
      if (!hay.startsWith(key, i + 1)) return false
      const after = hay[i + 1 + key.length]
      return !(after && /[\w]/.test(after))
    })
    if (!hit) continue
    if (i > at) out.push({ text: text.slice(at, i) })
    const end = i + 1 + hit.key.length
    out.push({ text: text.slice(i, end), who: hit.who })
    at = end
    i = end - 1
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
