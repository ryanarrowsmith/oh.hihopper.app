'use server'

import { supabaseService } from '@/lib/supabase/service'
import { ticketJob } from '@/lib/crew'
import { englishOf } from '@/lib/translate'
import type { Result } from '@/app/actions/admin'

/* ==========================================================================
   WHAT THE CREW WRITES DOWN.

   Until now the ticket was read-only and `fence_note.by_crew` was a column
   with no writer. This is the writer, and it is the reason the billing letter's
   project log is a record of the job rather than a record of the office: the
   oak nobody could have known about, the rock at eighteen inches, the photograph
   of where the line actually stops.

   IT RUNS ON THE SERVICE ROLE, because the person doing it has no account and
   never will. That means RLS is not carrying the check here — the token is.
   The caller hands over a token and a sentence; the JOB is resolved from the
   token and never accepted from the caller, which is the same bargain the
   estimate signature makes and the same one the billing definer makes.

   THE ORIGINAL IS WHAT IS SAVED. A crew writing Spanish gets Spanish in `body`,
   because that is what they typed and it is what the crew's own ticket shows
   them back. The English twin goes in `body_en`, written once, here, for every
   reader outside the crew's own steps — and if the model is unreachable the
   note still saves, in the language it was written in.
   ========================================================================== */

/** Long enough for what happened, short enough that a phone keyboard is the
 *  right tool. Past this it is a phone call. */
const MAX = 2000
const MAX_BYTES = 15 * 1024 * 1024

export async function crewNote(token: string, form: FormData): Promise<Result> {
  const job = await ticketJob(token)
  // The same answer an expired ticket gets everywhere else, on purpose.
  if (!job) {
    return { ok: false, message: 'This link is no longer active. Ask your project manager for a new one.' }
  }
  const es = job.lang === 'es'
  const say = (en: string, spanish: string) => (es ? spanish : en)

  const body = String(form.get('body') ?? '').trim().slice(0, MAX)
  const file = form.get('file')
  const hasFile = file instanceof File && file.size > 0
  if (!body && !hasFile) {
    return { ok: false, message: say(
      'Nothing typed and no photograph chosen, so nothing was saved.',
      'No se escribió nada ni se eligió una foto, así que no se guardó nada.') }
  }

  const db = supabaseService()

  /* A LINK IN A YARD IS A LINK IN A GROUP CHAT. The token is the only thing
     standing between this and an open write endpoint, so the volume is capped
     per job the same way the billing letter caps itself: enough for a long day
     of real work, nowhere near enough to be worth abusing. */
  const { count } = await db.schema('hopper').from('fence_note')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', job.accountId).eq('job_id', job.jobId)
    .not('by_crew', 'is', null)
    .gte('created_at', new Date(Date.now() - 3600_000).toISOString())
  if ((count ?? 0) >= 40) {
    return { ok: false, message: say(
      'That is forty in an hour. Call the office.',
      'Son cuarenta en una hora. Llame a la oficina.') }
  }

  /* THE FILE GOES UP FIRST, for the reason it does everywhere else: an
     orphaned object is a file nobody can see, and a row pointing at nothing is
     worse to read. */
  let put: { path: string; name: string; bytes: number; mime: string | null } | null = null
  if (hasFile) {
    const f = file as File
    if (f.size > MAX_BYTES) {
      return { ok: false, message: say(
        'That photograph is over 15 MB. Take it again at a smaller size.',
        'Esa foto pasa de 15 MB. Tómela de nuevo en tamaño menor.') }
    }
    const dot = f.name.lastIndexOf('.')
    const ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
    const path = `${job.accountId}/${job.jobId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`
    const up = await db.storage.from('fence-files')
      .upload(path, f, { contentType: f.type || 'application/octet-stream' })
    if (up.error) {
      return { ok: false, message: say(
        'The photograph did not go up. Try again where the signal is better.',
        'La foto no subió. Inténtelo donde haya mejor señal.') }
    }
    put = { path, name: f.name.slice(0, 200), bytes: f.size, mime: f.type || null }
  }

  const twin = await englishOf(body, job.lang)

  const { data, error } = await db.schema('hopper').from('fence_note')
    .insert({
      account_id: job.accountId, job_id: job.jobId, section: 'ticket',
      kind: put ? 'file' : 'note',
      body: body || put!.name,
      // The name of the crew on the job, not a person: nobody on this screen
      // signed in, so there is no person id to honestly write down.
      by_crew: job.crew || (es ? 'La cuadrilla' : 'The crew'),
      author_id: null,
      lang: twin.lang, body_en: twin.en,
      file_path: put?.path ?? null, file_name: put?.name ?? null,
      file_bytes: put?.bytes ?? null, file_mime: put?.mime ?? null,
    })
    .select('id').maybeSingle()

  if (error || !data) {
    return { ok: false, message: say(
      'That did not save. Try again in a moment.',
      'No se guardó. Inténtelo de nuevo en un momento.') }
  }

  return { ok: true, message: say(
    put ? 'Sent, with the photograph.' : 'Sent to the office.',
    put ? 'Enviado, con la foto.' : 'Enviado a la oficina.') }
}
