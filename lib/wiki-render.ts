import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'

/**
 * The stored document, as HTML, on the server.
 *
 * Rendering from the editor's JSON rather than storing HTML means a change of
 * typography is a stylesheet edit instead of a migration over everybody's
 * saved markup -- and it means the only nodes that can ever appear are the ones
 * this schema knows about. A stored blob of HTML would have to be trusted or
 * scrubbed; a tree that has to pass through this schema cannot carry a tag the
 * schema does not define.
 */
const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  // Link's own allowlist is what stops a javascript: href getting through.
  Link.configure({ openOnClick: false, autolink: true,
                   protocols: ['http', 'https', 'mailto'] }),
]

export function renderDoc(body: any): string {
  if (!body || typeof body !== 'object' || !Array.isArray(body.content)) return ''
  try { return generateHTML(body, EXTENSIONS as any) } catch { return '' }
}
