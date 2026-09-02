import { supabaseServer } from '@/lib/supabase/server'
import Directory, { type Person } from '@/components/Directory'

export const dynamic = 'force-dynamic'

/**
 * People -- everyone in the organizations you can open.
 *
 * It reads hopper.directory rather than hopper.person, because everyone signed
 * in may see the top half of anybody in a business they can already open, and
 * row-level security cannot hide a column. The view never selects email or
 * phone; those live on the person's own page, behind the roster grant.
 */
export default async function People() {
  const db = supabaseServer()

  // Contact details are a second read on purpose. hopper.person is behind the
  // roster grant, so for a reader without it this comes back empty and the
  // card simply has no "Get in touch" section -- rather than the directory
  // view carrying columns some readers must not see.
  const [{ data: rows }, { data: contacts }] = await Promise.all([
    db.schema('hopper').from('directory').select('*').eq('active', true).order('full_name'),
    db.schema('hopper').from('person').select('id, email, phone'),
  ])

  const reach = new Map((contacts ?? []).map((c: any) => [c.id, c]))
  const people = (rows ?? []).map((r: any) => ({
    ...r,
    email: reach.get(r.id)?.email ?? null,
    phone: reach.get(r.id)?.phone ?? null,
  })) as Person[]

  // Grouped by organization, in the order the names sort, so the page reads
  // the same way twice running.
  const byOrg = new Map<string, { entity_id: string | null; name: string; people: Person[] }>()
  for (const p of people) {
    const key = p.entity_id ?? 'none'
    if (!byOrg.has(key)) {
      byOrg.set(key, { entity_id: p.entity_id, name: p.entity_name ?? 'Not placed yet', people: [] })
    }
    byOrg.get(key)!.people.push(p)
  }
  const groups = [...byOrg.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>People</h1>
        <p className="scopeline">
          <span>Everyone in the organizations you can open.</span>
        </p>
      </div></div>

      {groups.length === 0
        ? <p className="empty">Nobody you can see yet.</p>
        : <Directory groups={groups} />}
    </>
  )
}
