import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * A file attached to an announcement, fetched by somebody allowed to read it.
 *
 * Same shape as the to-do files and a person's photograph: the bucket is
 * private, the browser never talks to it, and the id in the URL is the ROW, not
 * the path -- a path in a URL is a path somebody can edit. Not there and not
 * yours give the same answer, because telling somebody a file exists is telling
 * them something.
 */
export async function GET(
  _req: Request, { params }: { params: { id: string } },
) {
  const session = await currentSession()
  if (!session) return new NextResponse('Not signed in.', { status: 401 })

  const db = supabaseServer()
  const { data: item } = await db.schema('hopper').from('post_item')
    .select('file_path, file_name, file_mime')
    .eq('id', params.id).eq('kind', 'file').maybeSingle()
  if (!item?.file_path) return new NextResponse('Not found.', { status: 404 })

  const got = await db.storage.from('news-files').download(item.file_path)
  if (got.error || !got.data) return new NextResponse('Not found.', { status: 404 })

  const safe = (item.file_name ?? 'file').replace(/["\\\r\n]/g, '')
  const mime = item.file_mime ?? 'application/octet-stream'
  const shows = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('text/')

  return new NextResponse(await got.data.arrayBuffer(), {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${shows ? 'inline' : 'attachment'}; filename="${safe}"`,
      // One person's cache, not a proxy's. The bytes never change under an id.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
