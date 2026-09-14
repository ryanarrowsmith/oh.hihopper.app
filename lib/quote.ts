import 'server-only'
import { supabaseService } from '@/lib/supabase/service'
import type { Frozen } from '@/lib/estimate'

/* ==========================================================================
   THE CUSTOMER'S ESTIMATE, OPENED BY TOKEN.

   The second and last route in Hopper with no signed-in person, and the first
   one that carries money on purpose: the whole point of the page is a price in
   front of the person who has to agree to it.

   That makes the rules stricter here than on the crew ticket, not looser:

    1. ONE OPTION, NAMED BY THE LINK. Not the job's options, not the latest
       price — the row the link was issued against and nothing else. A customer
       signs the number they were sent.
    2. NO COST, NO MARGIN, NO RATE BOOK. The frozen takeoff carries quantities
       and sell; fence_option_cost is not touched by anything in this file.
    3. NO OTHER JOB. Every select is scoped to the job the token resolved to.
    4. THE SAME ANSWER FOR EVERY BAD TOKEN. Unknown, revoked, expired or
       already signed all render one page, because a reply that differs is a
       way to test tokens. (Signed is the exception that earns its own page —
       see `signed` below — and only once the token is known to be real.)
   ========================================================================== */

export type OpenQuote = {
  linkId: string
  accountId: string
  jobId: string
  optionId: string
  issuedOn: string
  goodThrough: string | null
  signedAt: string | null
  signedName: string | null
  job: {
    ref: string; name: string; customer: string | null; site_address: string | null
    cls: string | null
  }
  place: {
    line1: string | null; line2: string | null; city: string | null
    region: string | null; postcode: string | null
  } | null
  option: { id: string; label: string; price: number; spec_code: string | null }
  frozen: Frozen
  gateNames: Map<string, string>
  specName: string | null
  seller: { name: string; email: string | null; phone: string | null; title: string | null } | null
  company: {
    name: string | null; line1: string | null; line2: string | null
    phone: string | null; site: string | null; license: string | null
  }
}

export async function openQuote(token: string): Promise<OpenQuote | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const db = supabaseService()

  const { data: link } = await db.schema('hopper').from('fence_quote_link')
    .select('id, account_id, job_id, option_id, issued_by, issued_at, expires_on, revoked, signed_at')
    .eq('token', token).maybeSingle()
  if (!link || (link as any).revoked) return null
  const today = new Date().toISOString().slice(0, 10)
  // An expired link that was already signed still opens: the customer who signed
  // it should be able to look at what they signed. An expired UNSIGNED one does
  // not, which is what "good through" means.
  if ((link as any).expires_on && (link as any).expires_on < today && !(link as any).signed_at) {
    return null
  }

  const acct = (link as any).account_id as string
  const jobId = (link as any).job_id as string

  const [{ data: job }, { data: option }, { data: gateTypes }, { data: seller },
         { data: settings }, { data: sig }] = await Promise.all([
    db.schema('hopper').from('fence_job')
      .select('id, ref, name, customer, site_address, cls, location_id')
      .eq('account_id', acct).eq('id', jobId).maybeSingle(),
    db.schema('hopper').from('fence_option')
      .select('id, label, price, spec_code, takeoff')
      .eq('account_id', acct).eq('id', (link as any).option_id).maybeSingle(),
    db.schema('hopper').from('fence_gate_type')
      .select('code, name_en, width_ft').eq('account_id', acct),
    (link as any).issued_by
      ? db.schema('hopper').from('person').select('full_name, email, phone, role_title')
          .eq('account_id', acct).eq('id', (link as any).issued_by).maybeSingle()
      : Promise.resolve({ data: null }),
    db.schema('hopper').from('fence_settings')
      .select('company_name, company_line1, company_line2, company_phone, company_site, company_license')
      .eq('account_id', acct).maybeSingle(),
    db.schema('hopper').from('fence_signature')
      .select('signed_name, signed_at').eq('account_id', acct).eq('link_id', (link as any).id)
      .maybeSingle(),
  ])
  if (!job || !option || !(option as any).takeoff) return null

  const { data: place } = (job as any).location_id
    ? await db.schema('hopper').from('fence_location')
        .select('line1, line2, city, region, postcode')
        .eq('account_id', acct).eq('id', (job as any).location_id).maybeSingle()
    : { data: null }

  const { data: spec } = (option as any).spec_code
    ? await db.schema('hopper').from('fence_spec').select('name_en')
        .eq('account_id', acct).eq('code', (option as any).spec_code).maybeSingle()
    : { data: null }

  const names = new Map<string, string>()
  for (const g of ((gateTypes ?? []) as any[])) {
    const w = g.width_ft ? `${Number(g.width_ft)}′ ` : ''
    names.set(g.code, `${w}${String(g.name_en ?? g.code).toLowerCase()}`)
  }

  return {
    linkId: (link as any).id,
    accountId: acct,
    jobId,
    optionId: (option as any).id,
    issuedOn: String((link as any).issued_at).slice(0, 10),
    goodThrough: (link as any).expires_on ?? null,
    signedAt: (link as any).signed_at ?? null,
    signedName: (sig as any)?.signed_name ?? null,
    job: {
      ref: (job as any).ref, name: (job as any).name,
      customer: (job as any).customer, site_address: (job as any).site_address,
      cls: (job as any).cls,
    },
    place: (place as any) ?? null,
    option: {
      id: (option as any).id, label: (option as any).label,
      price: Number((option as any).price ?? 0), spec_code: (option as any).spec_code,
    },
    frozen: (option as any).takeoff as Frozen,
    gateNames: names,
    specName: (spec as any)?.name_en ?? null,
    seller: seller
      ? {
          name: (seller as any).full_name, email: (seller as any).email,
          phone: (seller as any).phone, title: (seller as any).role_title,
        }
      : null,
    company: {
      name: (settings as any)?.company_name ?? null,
      line1: (settings as any)?.company_line1 ?? null,
      line2: (settings as any)?.company_line2 ?? null,
      phone: (settings as any)?.company_phone ?? null,
      site: (settings as any)?.company_site ?? null,
      license: (settings as any)?.company_license ?? null,
    },
  }
}
