import 'server-only'
import { supabaseService } from '@/lib/supabase/service'
import type { Lang } from '@/lib/i18n'

/* ==========================================================================
   The crew ticket.

   A token in, one job out. Nothing here is reached by anybody signed in, and
   nothing here reads a price: the ticket carries quantities and never dollars,
   which is why every select names its columns instead of taking `*`. A `*` on
   fence_job would put the sold price one careless render away from a yard.
   ========================================================================== */

export type CrewTicket = {
  lang: Lang
  job: {
    id: string; ref: string; name: string; customer: string | null
    site_address: string | null; pin_note: string | null
    crew: string | null; starts_on: string | null
    lat: number | null; lon: number | null
  }
  sow: { en: string | null; es: string | null } | null
  materials: { code: string; name_en: string; name_es: string | null; uom: string; qty: number }[]
  tools: { name_en: string; name_es: string | null; qty: number }[]
  tasks: { id: string; en: string; es: string | null; due_on: string | null; done: boolean }[]
}

/** Null for a token that is unknown, revoked or past its date — all the same
 *  answer on purpose, because a reply that differs is a way to test tokens. */
export async function openTicket(token: string): Promise<CrewTicket | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const db = supabaseService()

  const { data: link } = await db.schema('hopper')
    .from('fence_ticket_link')
    .select('job_id, lang, revoked, expires_on')
    .eq('token', token).maybeSingle()

  if (!link || link.revoked) return null
  if (link.expires_on && link.expires_on < new Date().toISOString().slice(0, 10)) return null

  const jobId = link.job_id

  const [{ data: job }, { data: sow }, { data: runs }, { data: gates }, { data: tasks }] =
    await Promise.all([
      db.schema('hopper').from('fence_job')
        .select('id, ref, name, customer, site_address, pin_note, crew, starts_on, lat, lon, account_id, spec_code, cls')
        .eq('id', jobId).maybeSingle(),
      db.schema('hopper').from('fence_sow')
        .select('body_en, body_es').eq('job_id', jobId).maybeSingle(),
      db.schema('hopper').from('fence_run')
        .select('plan_ft, grade_pct').eq('job_id', jobId),
      db.schema('hopper').from('fence_gate')
        .select('rate_code, qty').eq('job_id', jobId),
      db.schema('hopper').from('fence_task')
        .select('id, en, es, due_on, done')
        .eq('job_id', jobId).eq('section', 'ticket').order('sort'),
    ])

  if (!job) return null

  /* The material list is quantities worked out from the takeoff, not a copy of
     the quote. Rates are read for their NAMES and their unit — never for cost,
     markup or sell, which this path has no business holding. */
  const feet = (runs ?? []).reduce(
    (n: number, r: any) => n + Number(r.plan_ft ?? 0) * (1 + Number(r.grade_pct ?? 0) / 100), 0)

  const codes = ['CL-FAB6', 'CL-LINE', 'CL-TERM', 'CL-RAIL', 'CL-TIE', 'CL-CONC']
    .concat((gates ?? []).map((g: any) => g.rate_code))
  const { data: rates } = await db.schema('hopper').from('fence_rate')
    .select('code, name_en, name_es, uom')
    .eq('account_id', (job as any).account_id).in('code', codes)

  const qtyFor = (code: string): number => {
    const gate = (gates ?? []).find((g: any) => g.rate_code === code)
    if (gate) return Number(gate.qty ?? 1)
    switch (code) {
      case 'CL-FAB6': case 'CL-RAIL': return Math.round(feet)
      case 'CL-LINE': return Math.max(0, Math.ceil(feet / 10) - 1)
      case 'CL-TERM': return 8
      case 'CL-TIE':  return Math.round(feet * 0.63)
      case 'CL-CONC': return Math.ceil(feet / 10) * 2
      default: return 1
    }
  }

  const materials = (rates ?? []).map((r: any) => ({
    code: r.code, name_en: r.name_en, name_es: r.name_es, uom: r.uom, qty: qtyFor(r.code),
  })).filter((m) => m.qty > 0)

  /* Tools are generated from the fence class, not maintained per job — the
     crew that builds secure line needs a trencher and a telehandler whether or
     not anybody remembered to write them down. */
  const TOOLS: Record<string, { name_en: string; name_es: string; qty: number }[]> = {
    permanent: [
      { name_en: 'Auger truck',   name_es: 'Camión hoyadora', qty: 1 },
      { name_en: 'Fabric puller', name_es: 'Tensor de malla',  qty: 2 },
      { name_en: 'Laser level',   name_es: 'Nivel láser',      qty: 1 },
    ],
    temporary: [
      { name_en: 'Flatbed',       name_es: 'Camión plataforma', qty: 1 },
      { name_en: 'Panel dolly',   name_es: 'Diablo para paneles', qty: 2 },
    ],
    secure: [
      { name_en: 'Auger truck',   name_es: 'Camión hoyadora',  qty: 1 },
      { name_en: 'Trencher',      name_es: 'Zanjadora',        qty: 1 },
      { name_en: 'Telehandler',   name_es: 'Manipulador telescópico', qty: 1 },
      { name_en: 'Torque wrench', name_es: 'Llave de torque',  qty: 2 },
    ],
  }

  return {
    lang: (link.lang === 'en' ? 'en' : 'es') as Lang,
    job: {
      id: (job as any).id, ref: (job as any).ref, name: (job as any).name,
      customer: (job as any).customer, site_address: (job as any).site_address,
      pin_note: (job as any).pin_note, crew: (job as any).crew,
      starts_on: (job as any).starts_on, lat: (job as any).lat, lon: (job as any).lon,
    },
    sow: sow ? { en: (sow as any).body_en, es: (sow as any).body_es } : null,
    materials,
    tools: TOOLS[(job as any).cls ?? 'permanent'] ?? TOOLS.permanent,
    tasks: (tasks ?? []) as CrewTicket['tasks'],
  }
}
