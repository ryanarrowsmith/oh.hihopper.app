/**
 * Language, for the whole of Hopper.
 *
 * English and Spanish, one dictionary, one lookup. The language is a fact about
 * the PERSON (`hopper.person.lang`), not a toggle on a screen: a crew foreman
 * who reads Spanish gets a Spanish ticket, a Spanish scope of work and a
 * Spanish shell without finding a control first.
 *
 * Two rules that keep this honest:
 *
 *  1. A MISSING TRANSLATION FALLS BACK TO ENGLISH, never to the key. A screen
 *     showing `job.stage.survey` to a customer is worse than a screen showing
 *     English to somebody who reads some.
 *  2. NOTHING IS TRANSLATED AT RENDER TIME BY MACHINE. These strings are
 *     written; the only machine translation in the product is the scope of
 *     work, which is drafted, edited by the PM, scored for readability and
 *     signed by a bilingual person before a crew builds from it.
 *
 * Fence Builder's copy is here in full because that is where a crew actually
 * reads Spanish. The rest of Hopper's modules join as they are touched.
 */

export type Lang = 'en' | 'es'
export const LANGS: Lang[] = ['en', 'es']
export const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Español' }

type Pair = { en: string; es?: string }

export const STRINGS: Record<string, Pair> = {
  /* ---------------------------------------------------------------- shell */
  'nav.home':            { en: 'Home',           es: 'Inicio' },
  'nav.reporting':       { en: 'Reporting',      es: 'Informes' },
  'nav.people':          { en: 'People',         es: 'Personas' },
  'nav.projects':        { en: 'Projects',       es: 'Proyectos' },
  'nav.tickets':         { en: 'Tickets',        es: 'Tickets' },
  'nav.admin':           { en: 'Admin',          es: 'Administración' },
  'nav.fence':           { en: 'Fence Builder',  es: 'Fence Builder' },
  'nav.collapse':        { en: 'Collapse',       es: 'Contraer' },
  'shell.signout':       { en: 'Sign out',       es: 'Cerrar sesión' },
  'shell.search':        { en: 'Search',         es: 'Buscar' },
  'shell.save':          { en: 'Save',           es: 'Guardar' },
  'shell.cancel':        { en: 'Cancel',         es: 'Cancelar' },
  'shell.add':           { en: 'Add',            es: 'Agregar' },
  'shell.edit':          { en: 'Edit',           es: 'Editar' },
  'shell.print':         { en: 'Print',          es: 'Imprimir' },
  'shell.note':          { en: 'Add a note',     es: 'Agregar una nota' },
  'shell.readonly':      { en: 'Read only',      es: 'Solo lectura' },

  /* ------------------------------------------------------- fence: sections */
  'fence.section.intake':   { en: 'Intake',            es: 'Recepción' },
  'fence.section.estimate': { en: 'Estimate',          es: 'Presupuesto' },
  'fence.section.survey':   { en: 'Site survey',       es: 'Inspección del sitio' },
  'fence.section.schedule': { en: 'Schedule',          es: 'Programación' },
  'fence.section.sow':      { en: 'Scope of work',     es: 'Alcance del trabajo' },
  'fence.section.ticket':   { en: 'Crew ticket',       es: 'Boleta de cuadrilla' },
  'fence.section.closeout': { en: 'Close-out',         es: 'Cierre' },
  'fence.section.billing':  { en: 'Billing handoff',   es: 'Entrega a facturación' },

  /* ---------------------------------------------------------- fence: roles */
  'fence.role.sales':    { en: 'Sales',            es: 'Ventas' },
  'fence.role.pm':       { en: 'Project manager',  es: 'Gerente de proyecto' },
  'fence.role.field':    { en: 'Field crew',       es: 'Cuadrilla de campo' },
  'fence.role.billing':  { en: 'Billing',          es: 'Facturación' },
  'fence.own.yours':     { en: 'Yours · edit',     es: 'Tuyo · editar' },
  'fence.own.theirs':    { en: 'Theirs · read and note', es: 'De ellos · leer y anotar' },
  'fence.own.sealed':    { en: 'Sealed · read only',     es: 'Sellado · solo lectura' },

  /* -------------------------------------------------------- fence: classes */
  'fence.class.permanent': { en: 'Permanent',        es: 'Permanente' },
  'fence.class.temporary': { en: 'Temporary',        es: 'Temporal' },
  'fence.class.secure':    { en: 'Secure facility',  es: 'Instalación segura' },

  /* --------------------------------------------------- fence: the ticket */
  'ticket.materials':    { en: 'Materials',          es: 'Materiales' },
  'ticket.tools':        { en: 'Tools',              es: 'Herramientas' },
  'ticket.closeout':     { en: 'Close out',          es: 'Cierre' },
  'ticket.pull':         { en: 'Pull the materials', es: 'Surtir los materiales' },
  'ticket.short':        { en: 'Report a shortage',  es: 'Reportar faltante' },
  'ticket.photos':       { en: 'Photographs',        es: 'Fotografías' },
  'ticket.photos.need':  { en: 'Three photographs are required', es: 'Se requieren tres fotografías' },
  'ticket.sign':         { en: 'Foreman signature',  es: 'Firma del capataz' },
  'ticket.sign.needs':   { en: 'Signing needs a sign-in', es: 'Firmar requiere inicio de sesión' },
  'ticket.locates':      { en: 'Re-verify the locates every morning',
                           es: 'Verificar las marcas de servicios subterráneos cada mañana' },
  'ticket.noprices':     { en: 'Quantities only. This ticket carries no prices.',
                           es: 'Solo cantidades. Esta boleta no lleva precios.' },

  /* The note a crew sends from the yard. Written plainly on purpose: the
     reader is holding a phone with a glove on and has something to say. */
  'ticket.note':         { en: 'Tell the office',    es: 'Avisar a la oficina' },
  'ticket.note.hint':    { en: 'What you found, what you changed, where you stopped. Add a photograph if it is easier to show than to say.',
                           es: 'Lo que encontró, lo que cambió, dónde paró. Agregue una foto si es más fácil mostrarlo que decirlo.' },
  'ticket.note.ph':      { en: 'Rock at eighteen inches on the east line…',
                           es: 'Piedra a cuarenta y cinco centímetros en la línea este…' },
  'ticket.note.photo':   { en: 'Add a photograph',   es: 'Agregar una foto' },
  'ticket.note.send':    { en: 'Send',               es: 'Enviar' },
  'ticket.note.sending': { en: 'Sending…',           es: 'Enviando…' },
  'ticket.note.sent':    { en: 'Sent from this ticket', es: 'Enviado desde esta boleta' },
  'ticket.note.none':    { en: 'Nothing sent from this ticket yet.',
                           es: 'Todavía no se ha enviado nada desde esta boleta.' },
  'ticket.note.shot':    { en: 'Photograph',         es: 'Foto' },
  'ticket.note.shots':   { en: 'photographs',        es: 'fotos' },

  /* ------------------------------------------------------ fence: the plan */
  'fence.job.sold':      { en: 'Sold',               es: 'Vendido' },
  'fence.job.measured':  { en: 'Measured on site',   es: 'Medido en sitio' },
  'fence.job.difference':{ en: 'Difference',         es: 'Diferencia' },
  'fence.job.crew':      { en: 'Crew',               es: 'Cuadrilla' },
  'fence.job.starts':    { en: 'Starts',             es: 'Comienza' },
  'fence.job.site':      { en: 'Site',               es: 'Sitio' },
  'fence.preliminary':   { en: 'Preliminary — the price is finalized at the site survey',
                           es: 'Preliminar — el precio se confirma en la inspección del sitio' },
}

/** Look a string up. Missing Spanish falls back to English, never to the key. */
export function t(key: string, lang: Lang = 'en'): string {
  const pair = STRINGS[key]
  if (!pair) return key
  return (lang === 'es' && pair.es) || pair.en
}

/** Every string, for a client component that needs the whole dictionary once. */
export function dictionary(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(STRINGS)) out[key] = t(key, lang)
  return out
}

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-MX' }

export function fmtDate(d: Date | string, lang: Lang = 'en'): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date)
}

export function fmtNumber(n: number, lang: Lang = 'en', digits = 0): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n)
}

/**
 * Money is always US dollars — the currency is a fact about the invoice, not
 * about the reader — but the grouping follows the reader's locale.
 */
export function fmtMoney(n: number, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(n)
}

/**
 * Feet, for a crew that works in meters. The ticket shows both because the
 * material is bought in feet and the crew measures in meters, and a conversion
 * done in somebody's head on site is a conversion done wrong.
 */
export function fmtLength(feet: number, lang: Lang = 'en'): string {
  if (lang !== 'es') return `${fmtNumber(feet, lang)} ft`
  const m = feet * 0.3048
  return `${fmtNumber(m, lang, 0)} m (${fmtNumber(feet, lang)} pies)`
}
