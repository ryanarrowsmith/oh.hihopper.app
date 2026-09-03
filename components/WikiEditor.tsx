'use client'
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'

const I = (d: string, w = '1.9') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const LIST = '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="3.6" cy="18" r="1.1" fill="currentColor" stroke="none"/>'
const NUM  = '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 5h1v4"/><path d="M3.5 15.5A1.5 1.5 0 1 1 6 17l-2 2h3"/>'
const TICK = '<path d="M4 12.5l5 5L20 6.5"/>'
const QUOTE= '<path d="M7 15V9.5A2.5 2.5 0 0 1 9.5 7"/><path d="M4 15h6v-3H4z"/><path d="M17 15V9.5A2.5 2.5 0 0 1 19.5 7"/><path d="M14 15h6v-3h-6z"/>'
const CODE = '<path d="m9 7-5 5 5 5"/><path d="m15 7 5 5-5 5"/>'
const RULE = '<path d="M4 12h16"/>'

type Kind = {
  key: string; name: string; blurb: string; mark: JSX.Element
  run: (e: Editor) => void; is: (e: Editor) => boolean
}

/* The blocks a procedure actually needs. Nothing here is in the menu because a
   rich text editor is expected to have it -- every one earns its line. */
export const KINDS: Kind[] = [
  { key: 'h2', name: 'Heading', blurb: 'A section of the document',
    mark: <b>H2</b>,
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    is: (e) => e.isActive('heading', { level: 2 }) },
  { key: 'h3', name: 'Sub-heading', blurb: 'A step inside a section',
    mark: <b>H3</b>,
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    is: (e) => e.isActive('heading', { level: 3 }) },
  { key: 'ul', name: 'Bulleted list', blurb: 'A list that is not in order',
    mark: I(LIST),
    run: (e) => e.chain().focus().toggleBulletList().run(),
    is: (e) => e.isActive('bulletList') },
  { key: 'ol', name: 'Numbered list', blurb: 'Steps that happen in order',
    mark: I(NUM),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    is: (e) => e.isActive('orderedList') },
  { key: 'todo', name: 'To-do', blurb: 'A step somebody ticks off',
    mark: I(TICK, '2.4'),
    run: (e) => e.chain().focus().toggleTaskList().run(),
    is: (e) => e.isActive('taskList') },
  { key: 'quote', name: 'Quote', blurb: 'A rule, in the words it was written in',
    mark: I(QUOTE),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    is: (e) => e.isActive('blockquote') },
  { key: 'code', name: 'Code', blurb: 'Something typed exactly',
    mark: I(CODE),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    is: (e) => e.isActive('codeBlock') },
  { key: 'rule', name: 'Divider', blurb: 'A line between two parts',
    mark: I(RULE, '2.4'),
    run: (e) => e.chain().focus().setHorizontalRule().run(),
    is: () => false },
]

export default function WikiEditor({ start, onChange }: {
  start?: any; onChange: (doc: any) => void
}) {
  const [slash, setSlash] = useState(false)
  const [pick, setPick] = useState(0)
  const [term, setTerm] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    // Next renders this on the server first; without the flag React warns that
    // the tree it hydrated is not the tree it drew.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({
        placeholder: ({ node }) => node.type.name === 'heading'
          ? 'Section'
          : 'Write, or press / for a block',
      }),
      TaskList, TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: start ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: { attributes: { class: 'wbody wbody--edit' } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  }, [])

  /* The slash menu opens on "/" at the start of an empty block, which is the
     only place it can mean "what kind of block is this?" rather than a slash in
     a sentence about a date. */
  useEffect(() => {
    if (!editor) return
    const onKey = (_v: any, ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && slash) { setSlash(false); return true }
      return false
    }
    editor.on('transaction', () => {
      const { $from, empty } = editor.state.selection
      const before = $from.parent.textContent
      if (empty && before === '/') { setSlash(true); setPick(0); setTerm('') }
      else if (slash && !before.startsWith('/')) setSlash(false)
      else if (slash) setTerm(before.slice(1).toLowerCase())
    })
    return () => { void onKey }
  }, [editor, slash])

  const shown = KINDS.filter((k) => !term
    || k.name.toLowerCase().includes(term) || k.key.includes(term))

  const choose = (k: Kind) => {
    if (!editor) return
    // Take the "/" and whatever was typed after it back out before the block
    // changes, or the heading starts with "/head".
    const { $from } = editor.state.selection
    editor.chain().focus()
      .deleteRange({ from: $from.start(), to: $from.pos }).run()
    k.run(editor)
    setSlash(false)
  }

  useEffect(() => {
    if (!slash) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPick((p) => (p + 1) % shown.length) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setPick((p) => (p - 1 + shown.length) % shown.length) }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[pick]) choose(shown[pick]) }
      else if (e.key === 'Escape') { setSlash(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [slash, pick, shown.length])

  if (!editor) return <div className="wed__blocks" />

  return (
    <div className="wed__blocks" ref={box}>
      {/* The same blocks the slash menu offers, for anybody who would rather
          press a button than remember a key. */}
      <div className="wbar" role="toolbar" aria-label="Blocks">
        {KINDS.map((k) => (
          <button key={k.key} type="button"
                  className={`wbar__b${k.is(editor) ? ' is-on' : ''}`}
                  data-tip={k.name} aria-label={k.name}
                  onClick={() => k.run(editor)}>{k.mark}</button>
        ))}
        <span className="wbar__x" />
        <button type="button" className={`wbar__b${editor.isActive('bold') ? ' is-on' : ''}`}
                data-tip="Bold" aria-label="Bold"
                onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" className={`wbar__b${editor.isActive('italic') ? ' is-on' : ''}`}
                data-tip="Italic" aria-label="Italic"
                onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" className={`wbar__b${editor.isActive('code') ? ' is-on' : ''}`}
                data-tip="Code" aria-label="Code"
                onClick={() => editor.chain().focus().toggleCode().run()}>{I(CODE)}</button>
      </div>

      <div className="wedwrap">
        <EditorContent editor={editor} />
        {slash && (
          <div className="slash" role="listbox" aria-label="Blocks">
            <div className="slash__h">{shown.length ? 'Blocks' : 'Nothing matches'}</div>
            {shown.map((k, i) => (
              <div key={k.key} role="option" aria-selected={i === pick}
                   className={`slash__i${i === pick ? ' is-on' : ''}`}
                   onMouseEnter={() => setPick(i)}
                   onMouseDown={(e) => { e.preventDefault(); choose(k) }}>
                <span className="slash__k">{k.mark}</span>
                <span className="slash__n">{k.name}<small>{k.blurb}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
