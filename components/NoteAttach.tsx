'use client'
import { useRef, useState } from 'react'

/**
 * The paperclip on a note.
 *
 * One form, not two: a person types a sentence, clips a photograph to it, and
 * presses the same button. A separate "upload" control beside the note box is
 * how a log ends up with a file on one line and the reason for it on another.
 *
 * The input is a real file input, hidden rather than replaced — the label is
 * the button, so the keyboard and the screen reader both get the control the
 * browser already knows how to work.
 */
export default function NoteAttach({ id = 'fj-file' }: { id?: string }) {
  const box = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)

  return (
    <span className="fjclip">
      <input ref={box} id={id} name="file" type="file" className="fjclip__in"
             onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      <label className="btn btn--icon" htmlFor={id} title="Attach a file"
             aria-label="Attach a file">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.7 4.2 5.4 9.5a1.9 1.9 0 0 0 2.7 2.7l5.6-5.6a3.3 3.3 0 0 0-4.7-4.7L3.2 7.7a4.8 4.8 0 0 0 6.8 6.8l4.3-4.3" />
        </svg>
      </label>
      {name && (
        <span className="fjclip__n">
          {name}
          <button type="button" onClick={() => {
            if (box.current) box.current.value = ''
            setName(null)
          }}>Take it off</button>
        </span>
      )}
    </span>
  )
}
