import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * A file on a job's log, fetched by somebody who is allowed to open it.
 *
 * The bucket is private, which is the point: a permit, a signed sketch or a
 * photograph of somebody's yard is not a logo, and a public bucket hands every
 * one of them to anyone who can guess a uuid. The browser never talks to
 * storage — it asks Hopper, Hopper asks storage with the reader's own session,
 * and RLS answers. Nothing here re-implements the rule in JavaScript.
 *
 * The id is the LOG ENTRY, not the path. A path in a URL is a path somebody can
 * edit; an entry id is a row that has to exist and has to be readable.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) return new NextResponse('Not signed in.', { status: 401 })

  const db = supabaseServer()
  const { data: note } = await db.schema('hopper').from('fence_note')
    .select('file_path, file_name, file_mime')
    .eq('account_id', session.accountId).eq('id', params.id).maybeSingle()
  // Not there, or not yours: the same answer either way. Telling somebody a
  // file exists but is not theirs is telling them something.
  if (!(note as any)?.file_path) return new NextResponse('Not found.', { status: 404 })

  const got = await db.storage.from('fence-files').download((note as any).file_path)
  if (got.error || !got.data) return new NextResponse('Not found.', { status: 404 })

  const safe = String((note as any).file_name ?? 'file').replace(/["\\\r\n]/g, '')
  const mime = (note as any).file_mime ?? 'application/octet-stream'
  const shows = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('text/')

  return new NextResponse(await got.data.arrayBuffer(), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${shows ? 'inline' : 'attachment'}; filename="${safe}"`,
      // One person's cache, never a proxy's. The bytes never change under an
      // id, so it can be held for good.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
