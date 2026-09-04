import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { readSpec, type Spec } from '@/lib/pivot'

export const dynamic = 'force-dynamic'

/**
 * The pivot, run in the database.
 *
 * The browser does this itself for anything it already holds -- the sample on
 * report_rows is 500 rows and moving a chip over it costs nothing. Past that
 * the rows are not in the browser to pivot, so the same spec comes here and
 * hopper.pivot() answers it over the whole table.
 *
 * No service key: this goes through the caller's own session, and
 * hopper.report_row's policy is what decides. A report somebody may not open
 * cannot be pivoted by asking politely.
 */
export async function POST(req: Request) {
  let body: { report?: string; spec?: unknown }
  try { body = await req.json() } catch { return bad('Nothing was sent.') }
  if (!body.report) return bad('Which report?')

  const spec: Spec = readSpec(body.spec)
  if (spec.values.length === 0 || spec.rows.length === 0) {
    return NextResponse.json({ ok: true, long: [], reason: 'nothing to pivot' })
  }

  // The sort column rides along as one extra value the renderers never see, so
  // "order these five accounts by PL Display Order" needs no second query and
  // no second code path -- the database is already grouping by the same keys.
  const sent = spec.sort === 'by' && spec.sortBy
    ? { ...spec, values: [...spec.values, { field: spec.sortBy, agg: 'min' as const }] }
    : spec

  const db = supabaseServer()
  const { data, error } = await db.schema('hopper').rpc('pivot', {
    p_report: body.report, p_spec: sent,
  })
  if (error) return bad(error.message, 500)

  return NextResponse.json({ ok: true, long: data ?? [] })
}

const bad = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status })
