import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadProjects } from '@/lib/projects'
import NewProject from '@/components/NewProject'
import { StatusKey, PROGRESS } from '@/components/ProjectBits'

export const dynamic = 'force-dynamic'

/**
 * The portfolio.
 *
 * One table rather than cards: you are scanning four to forty rows for the one
 * that is slipping, and a grid of cards makes that a hunt. The status is the
 * HEAD of the row -- read before the name, in the colour it already means --
 * rather than a column somewhere in the middle of the line.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [rows, { data: ents }, { data: people }] = await Promise.all([
    loadProjects(),
    // RLS answers this, so the picker can never offer an organization the
    // insert would then refuse.
    db.schema('hopper').from('entity').select('id, name').order('sort_order'),
    db.schema('hopper').from('directory').select('id, full_name').eq('active', true),
  ])
  const mayAdd = (ents ?? []).length > 0

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Projects</h1>
          <p className="scopeline"><span>
            {rows.length === 0
              ? 'Nothing running yet.'
              : `${rows.length} ${rows.length === 1 ? 'initiative' : 'initiatives'} across the organizations you can open.`}
          </span></p>
        </div>
        {mayAdd && (
          <div className="hi__go">
            <NewProject orgs={(ents ?? []) as any} people={(people ?? []) as any} />
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="empty" style={{ marginTop: 20 }}>
          A project is work with an end, as opposed to work that repeats. Start one and it
          gets milestones, tasks, and a log of every date that moved and why.
        </p>
      ) : (
        <div className="prjs">
          <div className="prj prj--h" aria-hidden="true">
            <span /><span>Project</span><span>Next milestone</span><span>Progress</span><span>Owner</span>
          </div>
          {rows.map((r) => (
            <Link className="prj" key={r.id} href={`/projects/${r.id}` as any}>
              <StatusKey status={r.status} />
              <span className="pname">{r.name}
                <small>{[r.entity, r.summary].filter(Boolean).join(' · ')}</small></span>
              <span className="pnext">
                {r.next
                  ? <>Next · <b>{r.next.name}</b>{r.next.on ? ` ${fmt(r.next.on)}` : ''}</>
                  : r.status === 'complete' ? 'Nothing left' : 'No milestones yet'}
              </span>
              <PROGRESS done={r.done} total={r.total} status={r.status} />
              <span className="pwho">
                {r.ownerInitials && <span className="pav">{r.ownerInitials}</span>}
                {r.owner?.split(' ')[0] ?? '—'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

const fmt = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
