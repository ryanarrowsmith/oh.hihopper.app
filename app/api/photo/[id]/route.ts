import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * Somebody's face, fetched by somebody who is allowed to look at it.
 *
 * The bucket is private, which is the whole point: a face is not a logo, and a
 * public bucket hands every photograph in the account to anyone who can guess
 * a uuid. So the browser never talks to storage. It asks Hopper for
 * /api/photo/<person>, Hopper asks storage with the signed-in person's own
 * session, and RLS decides -- people_photo_read says a member of the account
 * that owns the folder, and nothing here re-implements that in JavaScript.
 *
 * The reply is private and immutable. Immutable because the URL carries ?v=
 * with the moment it was written, so a new photograph is a new URL and there
 * is nothing to invalidate; private because it is one person's cache, not a
 * proxy's -- a shared cache holding somebody's face keyed only by path is the
 * same leak by a slower route.
 */
export async function GET(
  _req: Request, { params }: { params: { id: string } },
) {
  const session = await currentSession()
  if (!session) return new NextResponse('Not signed in.', { status: 401 })

  const db = supabaseServer()
  const path = `${session.accountId}/${params.id}.jpg`
  const { data, error } = await db.storage.from('people').download(path)
  if (error || !data) return new NextResponse('No photo.', { status: 404 })

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
