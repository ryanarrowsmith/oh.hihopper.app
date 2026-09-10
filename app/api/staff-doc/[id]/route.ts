import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * A staff document, fetched by somebody the database agrees may open it.
 *
 * Two gates, and neither of them is in this file. The row is read with the
 * signed-in person's own session, so staff_document_read decides whether this
 * document exists as far as they are concerned -- including the sensitive flag,
 * which is what keeps a subject out of their own written warning. Then the
 * object is downloaded with the same session, so staff_docs_read has to agree
 * a second time. A 404 for "not yours" and a 404 for "not there" are the same
 * reply on purpose: the difference between them is itself a fact about
 * somebody's record.
 */
export async function GET(
  _req: Request, { params }: { params: { id: string } },
) {
  const session = await currentSession()
  if (!session) return new NextResponse('Not signed in.', { status: 401 })

  const db = supabaseServer()
  const { data: row } = await db.schema('hopper').from('staff_document')
    .select('path, mime, title').eq('id', params.id).maybeSingle()
  if (!row) return new NextResponse('No document.', { status: 404 })

  const { data, error } = await db.storage.from('staff-docs').download(row.path)
  if (error || !data) return new NextResponse('No document.', { status: 404 })

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      'Content-Type': row.mime || 'application/octet-stream',
      'Content-Disposition':
        `inline; filename="${(row.title || 'document').replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
