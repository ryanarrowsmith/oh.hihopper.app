import type { Takeoff, GateRow, Spec } from '@/lib/takeoff'
import type { Lang } from '@/lib/i18n'

/**
 * The scope of work: one set of facts, written twice.
 *
 * THE HEADINGS DO NOT MOVE. Every scope reads the same way, in the same order,
 * so a crew standing in a yard knows where to look for the thing they need. The
 * project manager writes the text under each heading and cannot add, remove or
 * reorder one — which is why the spine is a constant here beside SECTIONS rather
 * than a table somebody can edit. A list is a table when a customer might want a
 * different one; this is the module's own shape.
 *
 * THE SPANISH IS NOT A TRANSLATION OF THE ENGLISH. Both are rendered from the
 * same takeoff, the same spec and the same gates, so neither is downstream of the
 * other and there is no machine translation of prose anywhere in this file. That
 * matters twice over: a crew reading Spanish is reading the job rather than a
 * guess at what somebody wrote about the job, and the trade words come from the
 * glossary, which is the list the shop has agreed on.
 *
 * NOTHING HERE IS AI. The draft is arithmetic and templates — measurements out of
 * the takeoff, hardware out of the spec and the gate list. It is a first draft
 * that gets a person's judgement added to it, and the screen says so. When a
 * model is wired in later it should draft ON TOP of this, never instead of it:
 * the numbers in a scope of work are the part that must not be improvised.
 */

export type PartKey = 'where' | 'dig' | 'line' | 'gates' | 'finish'
export type Part = { key: string; text: string }

export const SPINE: { key: PartKey; en: string; es: string; hint: string }[] = [
  { key: 'where',  en: 'Where and what',       es: 'Dónde y qué',
    hint: 'The address, the length, the specification. What a crew reads first.' },
  { key: 'dig',    en: 'Before you dig',       es: 'Antes de excavar',
    hint: 'Locates, buried lines, anything that has to be true before a post hole.' },
  { key: 'line',   en: 'The line',             es: 'La línea',
    hint: 'How the runs go, where they close, what the grade does.' },
  { key: 'gates',  en: 'Gates and hardware',   es: 'Portones y herrajes',
    hint: 'Every opening, its width, and which way it swings.' },
  { key: 'finish', en: 'When you are done',    es: 'Al terminar',
    hint: 'Clean-up, what to photograph, who signs it off.' },
]

const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} ft`
/** Spanish gets both, because a crew works to feet and orders in metres. */
const mft = (n: number) =>
  `${(n / 3.280839895).toLocaleString('es-MX', { maximumFractionDigits: 0 })} m `
  + `(${Math.round(n).toLocaleString('es-MX')} pies)`
const metres = (n: number) => `${(n * 0.3048).toFixed(1).replace('.0', '')} m`

export type DraftInput = {
  job: { ref: string; name: string | null; site_address: string | null; cls: string | null }
  spec: Spec | null
  takeoff: Takeoff
  gates: GateRow[]
  /** Only the terms the shop has agreed on, so the draft uses the shop's words. */
  glossary: { en: string; es: string }[]
}

/**
 * A first draft, in one language, from the job's own figures.
 *
 * Every sentence here is either a fact from the takeoff or a standing
 * instruction. There is no sentence that guesses at something nobody has entered
 * — a scope that invents a locate ticket number is worse than one that says a
 * locate is still needed.
 */
export function draft(o: DraftInput, lang: Lang): Part[] {
  const { job, spec, takeoff: t, gates } = o
  const say = (en: string, es: string) => (lang === 'es' ? es : en)
  const L = (n: number) => (lang === 'es' ? mft(n) : ft(n))
  const word = (en: string) => {
    if (lang === 'en') return en
    const hit = o.glossary.find((g) => g.en.toLowerCase() === en.toLowerCase())
    return hit ? hit.es : en
  }

  const on = gates.filter((g) => g.qty > 0)
  /** A run nobody renamed is "Run 3", which is the app's word rather than the
   *  person's — so it translates. A run somebody named themselves does not. */
  const runName = (label: string) => {
    const auto = /^Run (\d+)$/.exec(label)
    return lang === 'es' && auto ? `Tramo ${auto[1]}` : label
  }
  const gateName = (g: GateRow) =>
    (lang === 'es' ? g.name_es ?? g.name : g.name) ?? (lang === 'es' ? 'portón' : 'gate')
  const specName = spec ? (lang === 'es' ? spec.name_es ?? spec.name_en : spec.name_en) : null
  const closed = t.runs.length > 0 && t.runs.every((r) => r.closed)

  // One sentence, not two: the spacing clause carries a glossary term, and a
  // term at the start of a sentence needs a capital and a plural that no
  // programme should be inventing in somebody else's language. Mid-sentence it
  // is the word the shop agreed on, exactly as agreed.
  const spacing = spec?.spacing_ft
    ? say(`, with ${word('line post')}s at ${Number(spec.spacing_ft)}′ centers`,
          `, con ${word('line post')} a ${metres(Number(spec.spacing_ft))} de separación`)
    : ''

  const where: string[] = []
  if (job.site_address) where.push(job.site_address + '.')
  if (specName && t.fenceFt > 0) {
    where.push(say(
      `Build ${L(t.fenceFt)} of ${specName}${spacing}.`,
      `Construir ${L(t.fenceFt)} de ${specName}${spacing}.`))
  } else if (t.fenceFt > 0) {
    where.push(say(
      `Build ${L(t.fenceFt)} of fence${spacing}.`,
      `Construir ${L(t.fenceFt)} de cerca${spacing}.`))
  }

  const dig: string[] = [say(
    'Locates must be marked and in date before any post hole is dug. Re-verify the marks each '
    + 'morning — a mark that was there yesterday is not a mark today.',
    'Las marcas de servicios deben estar vigentes antes de excavar cualquier hoyo. Verifique las '
    + 'marcas cada mañana: una marca de ayer no es una marca de hoy.')]
  if (t.linePosts + t.terminalPosts + t.cornerPosts > 0) {
    dig.push(say(
      `${t.linePosts + t.terminalPosts + t.cornerPosts} holes in all.`,
      `${t.linePosts + t.terminalPosts + t.cornerPosts} hoyos en total.`))
  }

  const line: string[] = []
  if (t.runs.length) {
    line.push(say(
      `${t.runs.length} run${t.runs.length === 1 ? '' : 's'}${closed ? ', closing on itself' : ''}.`,
      `${t.runs.length} tramo${t.runs.length === 1 ? '' : 's'}${closed ? ', cerrado sobre sí mismo' : ''}.`))
    for (const r of t.runs) {
      line.push(say(
        `${runName(r.label)}: ${ft(r.planFt)}${r.corners ? `, ${r.corners} corner${r.corners === 1 ? '' : 's'}` : ''}.`,
        `${runName(r.label)}: ${mft(r.planFt)}${r.corners ? `, ${r.corners} esquina${r.corners === 1 ? '' : 's'}` : ''}.`))
    }
  }
  if (t.slopeFt > t.planFt) {
    line.push(say(
      `The grade adds ${ft(t.slopeFt - t.planFt)} over the plan length — pull the `
      + `${word('chain link')} tight to grade rather than stepping it.`,
      `El desnivel agrega ${mft(t.slopeFt - t.planFt)} sobre la medida en plano: tense la `
      + `${word('chain link')} siguiendo el terreno, sin escalonarla.`))
  }

  const gateLines: string[] = on.length
    ? on.map((g) => say(
        `${g.qty} × ${gateName(g)}${g.width_ft ? `, ${Number(g.width_ft)}′ opening` : ''}.`,
        `${g.qty} × ${gateName(g)}${g.width_ft ? `, abertura de ${metres(Number(g.width_ft))}` : ''}.`))
    : [say('No gates on this job.', 'Este trabajo no lleva portones.')]
  if (t.openingFt > 0) {
    gateLines.push(say(
      `${L(t.openingFt)} of opening is taken out of the line, and each opening takes two `
      + `terminal posts.`,
      `Se descuentan ${L(t.openingFt)} de línea por las aberturas, y cada abertura lleva dos `
      + `postes terminales.`))
  }

  const finish: string[] = [say(
    'Photograph the finished line, every gate closed, and the site left clean. The project '
    + 'manager walks it before it is called done.',
    'Fotografíe la línea terminada, cada portón cerrado y el sitio limpio. El jefe de proyecto lo '
    + 'recorre antes de darlo por terminado.')]

  const byKey: Record<PartKey, string[]> = { where, dig, line, gates: gateLines, finish }
  return SPINE.map((s) => ({ key: s.key, text: byKey[s.key].join(' ').trim() }))
}

/* ==========================================================================
   HOW IT READS
   ========================================================================== */

const WORDS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]*/g

export type Score = { words: number; sentences: number; syllables: number; ease: number }

/**
 * Readability, and the honest size of the claim.
 *
 * English uses Flesch Reading Ease; Spanish uses Fernández Huerta, which is the
 * same shape fitted to Spanish. Both count syllables, and syllable counting is
 * approximate in English and nearly exact in Spanish — Spanish syllables are
 * vowel groups, English ones are a heuristic with a long tail of exceptions.
 *
 * So the number is a prompt, not a verdict: it says "this reads like a legal
 * notice" loudly enough to be worth a second look. A score is not an approval,
 * which is why a person signs.
 */
export function score(text: string, lang: Lang): Score {
  const clean = text.replace(/\s+/g, ' ').trim()
  const words = clean.match(WORDS) ?? []
  const sentences = Math.max(1, (clean.match(/[.!?…]+(\s|$)/g) ?? []).length)
  const syllables = words.reduce((s, w) => s + syllablesIn(w, lang), 0)
  if (words.length === 0) return { words: 0, sentences: 0, syllables: 0, ease: 0 }

  const wps = words.length / sentences
  const spw = syllables / words.length
  const ease = lang === 'es'
    ? 206.84 - 60 * spw - 1.02 * wps          // Fernández Huerta
    : 206.835 - 84.6 * spw - 1.015 * wps      // Flesch
  return {
    words: words.length, sentences, syllables,
    ease: Math.round(Math.max(0, Math.min(120, ease))),
  }
}

export function easeWord(ease: number, lang: Lang): string {
  if (ease >= 80) return lang === 'es' ? 'muy fácil' : 'very easy'
  if (ease >= 60) return lang === 'es' ? 'se lee claro' : 'reads plainly'
  if (ease >= 40) return lang === 'es' ? 'algo difícil' : 'somewhat hard'
  return lang === 'es' ? 'difícil' : 'hard going'
}

function syllablesIn(word: string, lang: Lang): number {
  const w = word.toLowerCase()
  if (lang === 'es') {
    // Vowel groups. Strong-strong pairs are two syllables; anything with a weak
    // vowel is one. Close enough that the score moves for the right reasons.
    const groups = w.match(/[aeiouáéíóúü]+/g) ?? []
    return Math.max(1, groups.reduce((n, g) => n + (/^[aeoáéó]{2}$/.test(g) ? 2 : 1), 0))
  }
  const groups = (w.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '').match(/[aeiouy]+/g) ?? [])
  return Math.max(1, groups.length)
}

/* ==========================================================================
   THE GLOSSARY, HELD TO
   ========================================================================== */

export type TermCheck = {
  en: string; es: string
  /** The English term appears in the English scope. */
  used: boolean
  /** …and its agreed Spanish appears in the Spanish scope. */
  paired: boolean
}

/**
 * Which agreed terms this scope uses, and whether the Spanish kept its side of
 * the bargain.
 *
 * The point of a glossary is that "top rail" is never three different words
 * across three jobs, so what matters is not how many terms exist but whether a
 * term used in the English has its agreed partner in the Spanish. A term used on
 * one side and not the other is the failure this check is for.
 */
export function heldTo(
  en: Part[], es: Part[], glossary: { en: string; es: string }[],
): TermCheck[] {
  const flat = (p: Part[]) => p.map((x) => x.text).join(' ').toLowerCase()
  const E = flat(en), S = flat(es)
  return glossary.map((g) => {
    const used = E.includes(g.en.toLowerCase())
    return { en: g.en, es: g.es, used, paired: used && S.includes(g.es.toLowerCase()) }
  })
}

/** Fill the gaps in a stored scope so every heading has a box to type in. */
export function spineOf(parts: Part[] | null | undefined): Part[] {
  const have = new Map((parts ?? []).map((p) => [p.key, p.text]))
  return SPINE.map((s) => ({ key: s.key, text: have.get(s.key) ?? '' }))
}

export function wordsIn(parts: Part[]): number {
  return (parts.map((p) => p.text).join(' ').match(WORDS) ?? []).length
}
