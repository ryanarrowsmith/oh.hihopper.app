import 'server-only'
import { askClaude } from '@/lib/ai'

/* ==========================================================================
   A NOTE WRITTEN IN ONE LANGUAGE, READ IN ANOTHER.

   Ryan's rule, 14 Sep: the crew's Spanish should read back in English
   everywhere outside the crew's own steps. The crew ticket stays Spanish
   because the crew is; the project log, the record and the billing letter are
   read by people who are not.

   IT HAPPENS ONCE, AT THE MOMENT OF WRITING, AND NEVER AT READING.

     · The billing letter is assembled in SQL by a security definer. A definer
       cannot call a model, and it should not be able to.
     · Translating at read time means the same sentence comes out slightly
       differently on the screen and in the letter somebody filed — and the
       filed copy is the one that gets argued with.
     · A log with forty notes on it would be forty model calls every time
       anybody opened the job.

   THE ORIGINAL IS NEVER REPLACED. body is what was typed and stays
   authoritative; body_en sits beside it and every reader of it says out loud
   that the original was Spanish. A record that quietly shows a translation as
   if it were what somebody wrote is a record that has lost an argument it has
   not had yet.

   IT DOES NOT THROW AND IT DOES NOT BLOCK THE SAVE. If the model is unreachable
   or unconfigured the note still saves, in the language it was written in, and
   the log shows the Spanish. A missing translation is a smaller problem than a
   lost note.
   ========================================================================== */

/** The languages a note may be tagged with. Anything else reads as English. */
export type Lang = 'en' | 'es'

export type Twinned = {
  /** What it was actually typed in. Null when nobody said. */
  lang: Lang | null
  /** The English of it, or null when body is already the English. */
  en: string | null
}

const SYSTEM = [
  'You translate short work notes from a fencing crew into American English.',
  'Return the translation and nothing else — no preamble, no quotation marks,',
  'no explanation, no note about what you did.',
  'Keep it the length it was. Keep measurements, counts and units exactly as',
  'written. Keep proper names, street names, job references and product codes',
  'untouched. Keep the plain, direct tone of somebody typing on a phone in a',
  'yard; do not make it more formal than it was.',
  'If the text is already English, return it unchanged.',
].join(' ')

/**
 * The English twin of a note, when there is one to make.
 *
 * `from` is what the writer writes in — the person's own `lang`, or the crew
 * ticket's. Anything but 'es' returns immediately without a model call, which
 * is the common case and has to cost nothing: a project manager typing an
 * English note must not wait on a network round trip to somebody else's
 * computer to save it.
 */
export async function englishOf(body: string, from: string | null | undefined): Promise<Twinned> {
  const said = (from ?? '').trim().toLowerCase().slice(0, 2)
  const lang: Lang | null = said === 'es' ? 'es' : said === 'en' ? 'en' : null
  const text = (body ?? '').trim()
  if (lang !== 'es' || !text) return { lang, en: null }

  const out = await askClaude({
    system: SYSTEM,
    user: text.slice(0, 4000),
    // A translation is not a draft. Nothing here should be invented.
    temperature: 0,
    maxTokens: 1200,
    // Short, because a note save is a button somebody is waiting on.
    timeoutMs: 15_000,
  })
  if (!out.ok) return { lang, en: null }

  const en = out.text.trim()
  // A model that handed back the Spanish, or handed back nothing, has given us
  // no twin — and a twin identical to the original is a line of noise in the
  // letter saying a translation happened when it did not.
  if (!en || en === text) return { lang, en: null }
  return { lang, en: en.slice(0, 6000) }
}
