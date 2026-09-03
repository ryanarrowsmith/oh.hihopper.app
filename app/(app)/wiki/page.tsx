import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadWikiHome, mayAuthor } from '@/lib/wiki'
import WikiSearch from '@/components/WikiSearch'
import { CatCard, DocRowLink } from '@/components/WikiBits'
import NewCategory from '@/components/NewCategory'

export const dynamic = 'force-dynamic'

/**
 * The wiki's front page.
 *
 * The search box is the middle of the page, not a control in a corner: a
 * handbook is a thing people arrive at with a question. Everything below it is
 * for the times they do not have one -- what exists, what is going stale, and
 * what moved.
 */
export default async function Page() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const [{ categories, recent, stale, tags, total }, mayWrite] =
    await Promise.all([loadWikiHome(), mayAuthor()])

  return (
    <>
      <div className="hi">
        <div className="hi__t" />
        {/* Nothing a person may not do is rendered. Writing documents is its
            own permission, so this button is simply absent for a reader. */}
        {mayWrite && (
          <div className="hi__go">
            <Link className="btn btn--amber" href="/wiki/new">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              New document
            </Link>
          </div>
        )}
      </div>

      <div className="whero">
        <h1>Wiki</h1>
        <p>
          How this business does things, written down where people look. Ask it a
          question — the search reads the words inside every document, not just the titles.
        </p>
        <WikiSearch total={total} categories={categories.length} />
      </div>

      {total === 0 && categories.length === 0 && !mayWrite ? (
        <p className="empty" style={{ marginTop: 8 }}>
          Nothing written down yet. The first document is usually the one somebody
          explains out loud twice a week.
        </p>
      ) : (
        <>
          {(categories.length > 0 || mayWrite) && (
            <section className="sec" style={{ marginTop: 12 }}>
              <div className="sec__h">
                <div className="sec__t">
                  <h2>Categories</h2><p>Every document belongs to exactly one.</p>
                </div>
                {mayWrite && <NewCategory />}
              </div>
              {categories.length === 0 ? (
                <p className="empty">
                  No categories yet. Three or four is usually the right number — any more
                  and people stop knowing which one a document is in.
                </p>
              ) : (
                <div className="wcats">
                  {categories.map((c) => <CatCard key={c.id} c={c} />)}
                </div>
              )}
            </section>
          )}

          {stale.length > 0 && (
            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Wants a look</h2>
                <p>A procedure nobody has confirmed in two years is worse than no procedure.</p>
              </div></div>
              <div className="wlist">
                {stale.map((d) => <DocRowLink key={d.id} d={d} when="checked" />)}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Changed lately</h2><p>What moved most recently.</p>
              </div></div>
              <div className="wlist">
                {recent.map((d) => <DocRowLink key={d.id} d={d} when="edited" />)}
              </div>
            </section>
          )}

          {tags.length > 0 && (
            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Tags</h2><p>The words people actually search for.</p>
              </div></div>
              <div className="wtags" style={{ marginTop: 12 }}>
                {tags.map((t) => (
                  <Link className="wtag" key={t.tag} href={`/wiki?tag=${t.tag}` as any}>{t.tag}</Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
