'use client'
import Link from 'next/link'
import { splitMentions, type Named } from '@/lib/mentions'

/**
 * Text with the names in it lit up.
 *
 * Pieces rather than markup: building an HTML string and handing it to
 * dangerouslySetInnerHTML would be running whatever somebody typed into a
 * comment box inside a colleague's browser. React escapes every piece here,
 * which is the whole reason splitMentions returns parts instead of a string.
 *
 * A lit name is also a link. Being named is usually the start of "who is that",
 * and the answer is one page away.
 */
export default function Mentioned({ text, roster }: { text: string; roster: Named[] }) {
  const parts = splitMentions(text, roster)
  return (
    <>
      {parts.map((p, i) => p.who
        ? <Link className="men" key={i} href={`/people/${p.who.id}` as any}>{p.text}</Link>
        : <span key={i}>{p.text}</span>)}
    </>
  )
}
