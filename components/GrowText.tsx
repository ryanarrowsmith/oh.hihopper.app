'use client'
import { useEffect, useRef } from 'react'

/**
 * A textarea that is as tall as what is in it.
 *
 * A fixed `rows` clips the end of a paragraph, and a clipped paragraph in a
 * scope of work reads as a finished sentence that is not finished — somebody
 * proofreading the Spanish against the English cannot see that the last line is
 * missing. It scrolls, which is the part nobody notices.
 *
 * Grows on mount and on every keystroke, never shrinks below the rows it was
 * given, and if the script never runs the box is still a perfectly usable
 * textarea at its original height.
 */
export default function GrowText(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const el = useRef<HTMLTextAreaElement>(null)

  const fit = () => {
    const t = el.current
    if (!t) return
    // Collapse first, or a box that has been shortened keeps the tallest height
    // it ever had.
    t.style.height = 'auto'
    t.style.height = `${t.scrollHeight + 2}px`
  }

  useEffect(fit, [])

  return <textarea ref={el} onInput={fit} {...props} />
}
