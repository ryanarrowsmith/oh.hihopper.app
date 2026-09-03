export const dynamic = 'force-dynamic'

/**
 * The template, with a filled-in example row.
 *
 * An empty header row leaves somebody guessing what "Manager" wants -- a name?
 * an email? -- so the file answers that by showing one. The example is
 * obviously an example, which is what stops it being imported by accident.
 */
const TEMPLATE = [
  ['Name', 'Email', 'Role', 'Department', 'Organization', 'Phone', 'Manager', 'Location'],
  ['Dana Whitfield', 'dana@example.com', 'Dispatcher', 'Dispatch',
   'On Call Services and Rentals', '(918) 555-0142', 'Tom Vickers', 'Tulsa Yard'],
  ['Marcus Reyes', 'marcus@example.com', 'Driver', 'Operations', '', '', 'Dana Whitfield', ''],
]

const cell = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

export async function GET() {
  // A BOM, because Excel opens a UTF-8 CSV without one as Latin-1 and turns
  // every accented name into mojibake before anybody has typed a thing.
  const csv = '﻿' + TEMPLATE.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hopper-people-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
