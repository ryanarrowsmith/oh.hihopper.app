import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Avatar from '@/components/Avatar'
import { DOC_KINDS } from '@/lib/staffing'

export const dynamic = 'force-dynamic'

/**
 * Every document in reach, newest first.
 *
 * There is no "all documents" query here that a filter then narrows -- the
 * select IS the whole query, and staff_document_read decides what comes back.
 * A document belonging to a line that is not yours does not arrive and get
 * hidden; it does not arrive.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: docs }, { data: people }] = await Promise.all([
    db.schema('hopper').from('staff_document')
      .select('id, person_id, kind, title, happened_on, sensitive, bytes')
      .order('happened_on', { ascending: false }).limit(300),
    db.schema('hopper').from('person').select('id, full_name, photo_url, role_title'),
  ])
  const who = new Map<string, any>((people ?? []).map((p: any) => [p.id, p]))

  const size = (b: number | null) =>
    b == null ? '' : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`

  return (
    <>

      <div className="hi"><div className="hi__t">
        <h1>Documents</h1>
        <p className="scopeline">
          <span>Everything filed against a record you can open.</span>
        </p>
      </div></div>

      {(docs ?? []).length === 0 ? (
        <p className="empty">
          Nothing filed yet. A document is added from the person&rsquo;s own page,
          which is also the only place it can be.
        </p>
      ) : (
        <ul className="stfiles">
          {(docs ?? []).map((d: any) => {
            const p = who.get(d.person_id)
            return (
              <li key={d.id}>
                <Link className="stfiles__who" href={`/staffing/${d.person_id}` as any}>
                  <Avatar name={p?.full_name ?? 'Somebody'} src={p?.photo_url} size={32} />
                  <span>
                    <b>{p?.full_name ?? 'Somebody'}</b>
                    {p?.role_title && <em>{p.role_title}</em>}
                  </span>
                </Link>
                <a className="stfiles__t" href={`/api/staff-doc/${d.id}`}
                   target="_blank" rel="noreferrer">{d.title}</a>
                <span className="stfiles__k">
                  {DOC_KINDS.find((k) => k.key === d.kind)?.label ?? d.kind}
                </span>
                <span className="stfiles__d">{d.happened_on} · {size(d.bytes)}</span>
                {d.sensitive && <span className="stseal">Sensitive</span>}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
