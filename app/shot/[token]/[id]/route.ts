import { NextResponse } from 'next/server'
import { supabaseService } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * A photograph out of a job's log, opened by somebody who has no account.
 *
 * The billing letter goes to accounting, and accounting is not in Hopper. A
 * link into the app opens nothing for them, so the pictures in the letter have
 * to be reachable on their own — the same problem the crew ticket and the
 * customer's estimate already solve, and solved the same way: the secret in the
 * path stands in for a session.
 *
 * THE TOKEN BELONGS TO THE JOB, NOT TO THE PICTURE. One key opens the
 * photographs on one job and nothing else — not another job's, not a permit,
 * not the sheet. Rotating hopper.fence_job.shot_token turns every letter
 * already sent dark in one update, which is the only revocation a mailed
 * document can have.
 *
 * TWO FACTS HAVE TO LINE UP, and neither is guessable on its own: the token has
 * to be a job's, and the note has to be on THAT job. A note id from a different
 * job with a valid token is a 404, which is also what a wrong token is, which is
 * also what a missing file is. Telling somebody which of the three they got
 * wrong is telling them something.
 *
 * IMAGES ONLY. The log carries permits, sketches and signed PDFs as well, and
 * none of those belong behind a key that was minted to show a fence. A letter
 * only ever composes this address for an image; this refuses to serve anything
 * else even if one is asked for.
 *
 * It runs on the service role because the reader has no session for RLS to
 * answer with. That means the check above IS the check — there is no second one
 * underneath it.
 */

const WIDTH = 620

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(token) || !uuid.test(id)) {
    return new NextResponse('Not found.', { status: 404 })
  }

  const db = supabaseService()

  const { data: job } = await db.schema('hopper').from('fence_job')
    .select('id, account_id').eq('shot_token', token).maybeSingle()
  if (!job) return new NextResponse('Not found.', { status: 404 })

  const { data: note } = await db.schema('hopper').from('fence_note')
    .select('file_path, file_mime, file_name')
    .eq('account_id', (job as any).account_id)
    .eq('job_id', (job as any).id)
    .eq('id', id).maybeSingle()

  const path = (note as any)?.file_path as string | undefined
  const mime = ((note as any)?.file_mime ?? '') as string
  if (!path || !mime.startsWith('image/')) {
    return new NextResponse('Not found.', { status: 404 })
  }

  /* RESIZED BY STORAGE, NOT BY US. A full-resolution photograph off a phone is
     four megabytes and a letter carrying five of them is a letter that bounces.
     620 px is letter width, prints sharp, and lands around 400 KB.

     IT DEGRADES TO THE ORIGINAL RATHER THAN TO NOTHING. Image transformation is
     a paid feature and can be off; a picture that is bigger than it needed to be
     is a worse letter, while a picture that is missing is a worse record. */
  let got = await db.storage.from('fence-files')
    .download(path, { transform: { width: WIDTH, resize: 'contain', quality: 82 } })
  if (got.error || !got.data) {
    got = await db.storage.from('fence-files').download(path)
  }
  if (got.error || !got.data) return new NextResponse('Not found.', { status: 404 })

  const safe = String((note as any).file_name ?? 'photo').replace(/["\\\r\n]/g, '')

  return new NextResponse(await got.data.arrayBuffer(), {
    headers: {
      'Content-Type': got.data.type || mime,
      'Content-Disposition': `inline; filename="${safe}"`,
      /* A mail client fetches this through its own image proxy, and the bytes
         under a note id never change, so a shared cache is safe and is the
         thing that stops fifty forwards from being fifty downloads. */
      'Cache-Control': 'public, max-age=31536000, immutable',
      // The letter is the only page that should be framing these.
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
