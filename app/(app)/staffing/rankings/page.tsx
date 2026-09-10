import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Avatar from '@/components/Avatar'
import { CEILING, PROMPT_AT, MEASURES, STEPS, quarterLabel, quarterStart, stanceIn } from '@/lib/staffing'

export const dynamic = 'force-dynamic'

/**
 * Stack Rankings — one quarter, everyone in reach, in order.
 *
 * Only SETTLED quarters are here. A draft with two measures answered would
 * sort to the bottom and read as a verdict, when what it actually is is a
 * manager who has not finished. The quarters offered are the ones that have
 * something settled in them, so an empty quarter is not a page you can land on
 * and wonder about.
 *
 * Nobody sees their own row here, because nobody sees their own score at all.
 * That is not a filter in this file; staff_review_read never returns it.
 */
export default async function Page({
  searchParams,
}: { searchParams: { q?: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const stance = await stanceIn(session.accountId)

  const [{ data: rows }, { data: people }] = await Promise.all([
    db.schema('hopper').from('staff_review')
      .select('id, person_id, period, score, caring, communication, reliability, job_knowledge, summary')
      .eq('settled', true).order('period', { ascending: false }),
    db.schema('hopper').from('person')
      .select('id, full_name, role_title, photo_url').eq('active', true),
  ])

  const who = new Map<string, any>((people ?? []).map((p: any) => [p.id, p]))
  const periods = [...new Set((rows ?? []).map((r: any) => r.period))]
  const period = searchParams.q && periods.includes(searchParams.q)
    ? searchParams.q
    : periods[0] ?? quarterStart()

  const stack = (rows ?? []).filter((r: any) => r.period === period)
    .sort((a: any, b: any) =>
      (b.score ?? 0) - (a.score ?? 0)
      || (who.get(a.person_id)?.full_name ?? '').localeCompare(who.get(b.person_id)?.full_name ?? ''))

  return (
    <>

      <div className="hi"><div className="hi__t">
        <h1>Stack Rankings</h1>
        <p className="scopeline">
          <span>Settled quarters only, for everyone in your line of report.</span>
        </p>
      </div></div>

      {periods.length > 1 && (
        <nav className="stnav stnav--quarters">
          {periods.map((p) => (
            <Link key={p} href={`/staffing/rankings?q=${p}` as any}
                  className={p === period ? 'is-on' : undefined}>
              {quarterLabel(p)}
            </Link>
          ))}
        </nav>
      )}

      {stack.length === 0 ? (
        <p className="empty">
          Nothing settled yet. A quarter appears here once all four measures are
          answered and it has been marked settled on somebody&rsquo;s file.
        </p>
      ) : (
        <div className="tblwrap">
          <table className="tbl ststack">
            <thead>
              <tr>
                <th className="ststack__n">#</th>
                <th>Person</th>
                {MEASURES.map((m) => <th key={m.key}>{m.label}</th>)}
                <th>Of {CEILING}</th>
              </tr>
            </thead>
            <tbody>
              {stack.map((r: any, i: number) => {
                const p = who.get(r.person_id)
                const low = r.score <= PROMPT_AT
                return (
                  <tr key={r.id} className={low ? 'is-low' : undefined}>
                    <td className="ststack__n">{i + 1}</td>
                    <td>
                      <Link className="ststack__who" href={`/staffing/${r.person_id}` as any}>
                        <Avatar name={p?.full_name ?? 'Somebody'} src={p?.photo_url} size={30} />
                        <span>
                          <b>{p?.full_name ?? 'Somebody'}</b>
                          {p?.role_title && <em>{p.role_title}</em>}
                        </span>
                      </Link>
                    </td>
                    {MEASURES.map((m) => (
                      <td key={m.key}>{STEPS.find((s) => s.n === r[m.key])?.word ?? '—'}</td>
                    ))}
                    <td className="ststack__v"><b>{r.score}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="stsay">
        {quarterLabel(period)} · {stack.length} settled.
        Seven or under is marked, and it is the prompt to have the conversation
        rather than the conversation itself.
        {stance.stance === 'records' && ' You are seeing this as a holder of staff records rather than as a manager.'}
      </p>
    </>
  )
}
