import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import AddReport from '@/components/AddReport'

export const dynamic = 'force-dynamic'

/**
 * Add a report — under Reporting, not only under Admin.
 *
 * Registering was an administrator's job only because the form only existed in
 * Admin. The person who knows what a number means is the one who should be
 * pointing Hopper at it, so the same form lives here with one difference: the
 * organization list is only the organizations this person may already edit, and
 * departments and categories narrow the same way.
 */
export default async function NewReport() {
  const db = supabaseServer()

  const [{ data: ents }, { data: depts }, { data: cats }, { data: rights }] = await Promise.all([
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('department').select('id, name, entity_id').order('name'),
    db.schema('hopper').from('report_category').select('id, name, department_id').order('name'),
    db.schema('hopper').from('entity_rights').select('entity_id, may_edit'),
  ])

  const mayEdit = new Set((rights ?? []).filter((r: any) => r.may_edit).map((r: any) => r.entity_id))
  const orgs = (ents ?? []).filter((e: any) => mayEdit.has(e.id))

  // Nothing a person may not do is rendered. Landing on the form and finding
  // an organization list you cannot choose from is worse than not arriving.
  if (orgs.length === 0) redirect('/reporting')

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Add a report</h1>
        <p className="scopeline">
          <span>A pointer, not data: a spreadsheet, one tab inside it, and a schedule for going
            back to look.</span>
        </p>
      </div></div>

      <AddReport
        orgs={orgs.map((e: any) => ({ id: e.id, name: e.name }))}
        depts={(depts ?? []).filter((d: any) => mayEdit.has(d.entity_id))}
        cats={cats ?? []}
      />
    </>
  )
}
