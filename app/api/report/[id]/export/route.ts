import { supabaseServer } from '@/lib/supabase/server'
import { readSpec } from '@/lib/pivot'

export const dynamic = 'force-dynamic'

/** Rows per trip to the database. Big enough that eighty-four thousand rows is
 *  seventeen round trips rather than four hundred; small enough that no single
 *  response has to be held whole. */
const PAGE = 5_000

/**
 * The whole sheet as a CSV, not the five hundred rows the browser happens to
 * hold.
 *
 * Export was built when the table WAS the data -- it wrote out what was in
 * memory, which was right while that was everything and quietly wrong the day
 * a report had eighty-four thousand rows and a sample of five hundred. A file
 * that says "Export" and gives you 0.6% of the sheet is worse than no button.
 *
 * Streamed rather than assembled: nineteen megabytes of JSON turned into CSV
 * is not something to build in memory on a server that also has other requests
 * to answer. Rows go out as they arrive.
 *
 * In sheet order, deliberately. The table's own sort runs over what it holds,
 * and re-sorting eighty-four thousand rows by an arbitrary spreadsheet column
 * costs a full sort per page with no index that could help -- so rather than
 * quietly export something that is neither sheet order nor the order on
 * screen, this is sheet order and the button says so.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: { cols?: string[]; spec?: unknown; cells?: { rk: string; ck: string }[] } = {}
  try { body = await req.json() } catch { /* everything, every column */ }

  const db = supabaseServer()

  // The columns as the sheet had them, so a CSV's headings are the sheet's
  // headings rather than A, B, C.
  const { data: shape } = await db.schema('hopper').from('report_rows')
    .select('columns, row_count').eq('report_id', params.id).maybeSingle()
  const all = (shape?.columns as { key: string; label: string }[] | null) ?? []
  if (all.length === 0) return new Response('', { status: 404 })

  // Only what is on screen. Hiding a column and exporting it anyway is the
  // same lie as exporting a different sort order.
  const want = Array.isArray(body.cols) && body.cols.length > 0
    ? all.filter((c) => body.cols!.includes(c.key))
    : all

  const cells = Array.isArray(body.cells) && body.cells.length > 0 ? body.cells : null
  const spec = cells ? readSpec(body.spec) : null

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const line = (cell: Record<string, unknown>) =>
    want.map((c) => esc(cell?.[c.key])).join(',') + '\n'

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const out = new TextEncoder()
      controller.enqueue(out.encode(want.map((c) => esc(c.label)).join(',') + '\n'))
      try {
        // Advance by what came BACK, not by what was asked for. PostgREST can
        // cap a response below the page size, and a loop that stops the first
        // time it gets less than it asked for would then export one page and
        // call it the whole sheet -- silently, with a plausible-looking file.
        // An empty page is the only honest end.
        let at = 0
        for (let trips = 0; trips < 400; trips++) {
          const { data, error } = cells
            ? await db.schema('hopper').rpc('pivot_rows', {
                p_report: params.id, p_spec: spec, p_cells: cells,
                p_limit: PAGE, p_offset: at,
              })
            : await db.schema('hopper').from('report_row')
                .select('cells').eq('report_id', params.id)
                .order('n', { ascending: true }).range(at, at + PAGE - 1)
          if (error) throw new Error(error.message)
          const page = (data ?? []) as { cells: Record<string, unknown> }[]
          if (page.length === 0) break
          for (const r of page) controller.enqueue(out.encode(line(r.cells)))
          at += page.length
          if (!cells && shape?.row_count != null && at >= shape.row_count) break
        }
      } catch (err) {
        // A CSV that stops early with no explanation is a CSV somebody files
        // and acts on. Say it in the file itself -- there is nowhere else left
        // to say it once the download has started.
        controller.enqueue(out.encode(
          `\n"Hopper could not finish this export: ${String((err as Error).message).replace(/"/g, "'")}"\n`))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
