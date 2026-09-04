import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * A file attached to a to-do, fetched by somebody who is allowed to open it.
 *
 * The bucket is private, which is the whole point: a quote, a contract or a
 * screenshot of somebody's pay run is not a logo, and a public bucket hands
 * every one of them to anyone who can guess a uuid. So the browser never talks
 * to storage. It asks Hopper for /api/todo/file/<entry>, Hopper looks the entry
 * up and asks storage with the signed-in person's own session, and RLS decides
 * -- note_read says you may see a list you can see, todo_files_read says the
 * same about the object, and nothing here re-implements either in JavaScript.
 *
 * The id is the LOG ENTRY, not the storage path. A path in a URL is a path
 * somebody can edit; an entry id is a row that has to exist and has to be one
 * this person may read.
 */
export async function GET(
  _req: Request, { params }: { params: { id: string } },
) {
  const session = await currentSession()
  if (!session) return new NextResponse('Not signed in.', { status: 401 })

  const db = supabaseServer()
  const { data: note } = await db.schema('hopper').from('list_note')
    .select('file_path, file_name, file_mime')
    .eq('id', params.id).eq('kind', 'file').maybeSingle()
  // Not there, or not yours: the same answer either way. Telling somebody a
  // file exists but is not theirs is telling them something.
  if (!note?.file_path) return new NextResponse('Not found.', { status: 404 })

  const got = await db.storage.from('todo-files').download(note.file_path)
  if (got.error || !got.data) return new NextResponse('Not found.', { status: 404 })

  // Inline where a browser can show it, a download where it cannot; the name is
  // quoted and stripped of anything that would break the header.
  const safe = (note.file_name ?? 'file').replace(/["\\\r\n]/g, '')
  const mime = note.file_mime ?? 'application/octet-stream'
  const shows = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('text/')

  return new NextResponse(await got.data.arrayBuffer(), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${shows ? 'inline' : 'attachment'}; filename="${safe}"`,
      // One person's cache, not a proxy's -- a shared cache holding somebody's
      // contract keyed only by path is the same leak by a slower route. The
      // bytes never change under an id, so it can be held for good.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
