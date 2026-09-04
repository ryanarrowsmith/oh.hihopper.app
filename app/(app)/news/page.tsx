import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadNews } from '@/lib/news'
import { I, Kat, Left, PLUS, PRINT, TUNE, day } from '@/components/NewsBits'
import PrintButton from '@/components/PrintButton'

export const dynamic = 'force-dynamic'

/**
 * News.
 *
 * What is running now, then the archive. Nothing is deleted: coming off the
 * banner is not being removed, and an announcement that no longer applies is
 * retired rather than erased, because somebody will ask about it.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const all = await loadNews()
  const mayWrite = all.some((p) => p.mayEdit)
  const running = all.filter((p) => p.status === 'posted' && p.banner
                                    && (p.daysLeft ?? -1) >= 0)
  const drafts = all.filter((p) => p.status === 'draft')
  const archive = all.filter((p) => !running.includes(p) && p.status !== 'draft')

  return (
    <>
      <div className="pj__h">
        <div className="pj__id">
          <h1>News</h1>
          <p className="pjline">
            {[running.length === 0 ? 'Nothing on the banner' : `${running.length} on the banner`,
              `${archive.length} in the archive`,
              drafts.length > 0 ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'}` : null]
              .filter(Boolean).map((bit, i) => <span key={i}>{bit}</span>)}
          </p>
        </div>
        <div className="pj__go">
          <PrintButton />
          {mayWrite && (
            <Link className="btn btn--amber btn--mark" href={"/news/new" as any}
                  aria-label="Write an announcement" data-tip="Write an announcement">
              {I(PLUS, '2.2')}
            </Link>
          )}
        </div>
      </div>

      {drafts.length > 0 && (
        <Band title="Drafts" sub="only the people who administer the organization can see these"
              rows={drafts} />
      )}
      <Band title="On the banner" sub={running.length === 0 ? 'nothing running' : 'across the top of home'}
            rows={running} banner />
      <Band title="The archive" sub={`${archive.length} · newest first`} rows={archive}
            empty="Nothing has been posted yet." />
    </>
  )
}

function Band({ title, sub, rows, banner, empty }: {
  title: string; sub: string; rows: any[]; banner?: boolean; empty?: string
}) {
  if (rows.length === 0 && !empty) return null
  return (
    <section className="tdcard">
      <div className="tdcard__bar">
        <b>{title}</b><span className="tdcard__sub">{sub}</span>
      </div>
      <div className="tdcard__body">
        {rows.length === 0
          ? <p className="pjnone pjnone--tight">{empty}</p>
          : rows.map((p) => (
              <div className="nrowi" key={p.id}>
                <span className={`nrowi__d${banner ? '' : ' nold'}`}>{day(p.postedOn)}</span>
                <span className="nrowi__b">
                  <p className="nrowi__t"><Link href={`/news/${p.id}` as any}>{p.title}</Link></p>
                  <p className="nrowi__s">
                    {[p.department ? `${p.department} · ${p.entity}` : `Everyone at ${p.entity}`,
                      p.category].filter(Boolean).join(' · ')}
                  </p>
                </span>
                <span className="nrowi__m">
                  <Kat mark={p.mark} name={p.category} />
                  {p.status === 'retired' && (
                    <span className="nret" role="img" aria-label="Retired"
                          data-tip="Retired — kept, but no longer current">{I(TUNE, '2')}</span>
                  )}
                  {banner && p.comesOff && <Left days={p.daysLeft ?? 0} off={p.comesOff} />}
                </span>
              </div>
            ))}
      </div>
    </section>
  )
}
