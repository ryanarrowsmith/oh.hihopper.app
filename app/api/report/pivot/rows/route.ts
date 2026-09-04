import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { readSpec } from '@/lib/pivot'

export const dynamic = 'force-dynamic'

/**
 * The source rows behind one or more pivot cells.
 *
 * Clicking a bar used to filter the five hundred rows report_rows keeps, so a
 * cell worth three quarters of a million showed four rows and said "8,349 in
 * the sheet" about the ones you could not reach. hopper.pivot_rows() asks the
 * pivot's own arithmetic the question backwards -- which rows made this bar --
 * so a drill-down cannot disagree with the chart it drilled from.
 *
 * No service key: this goes through the caller's own session, and
 * hopper.report_row's policy is what decides.
 */
export async function POST(req: Request) {
  let body: { report?: string; spec?: unknown; cells?: unknown; limit?: number }
  try { body = await req.json() } catch { return bad('Nothing was sent.') }
  if (!body.report) return bad('Which report?')
  if (!Array.isArray(body.cells) || body.cells.length === 0) {
    return NextResponse.json({ ok: true, rows: [] })
  }

  const db = supabaseServer()
  const { data, error } = await db.schema('hopper').rpc('pivot_rows', {
    p_report: body.report,
    p_spec: readSpec(body.spec),
    p_cells: body.cells,
    // A drill-down nobody can scroll is an export. The table says how many
    // there are and points at the button that gets all of them.
    p_limit: Math.min(Math.max(1, Number(body.limit) || 1000), 2000),
    p_offset: 0,
  })
  if (error) return bad(error.message, 500)

  return NextResponse.json({ ok: true, rows: data ?? [] })
}

const bad = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status })
