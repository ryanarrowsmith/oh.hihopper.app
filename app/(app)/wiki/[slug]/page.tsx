import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadDoc, mayAuthor } from '@/lib/wiki'
import { renderDoc } from '@/lib/wiki-render'
import { CheckMark, ago } from '@/components/WikiBits'
import CheckedButton from '@/components/CheckedButton'
import CrumbTail from '@/components/CrumbTail'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { slug: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const [found, mayWrite] = await Promise.all([loadDoc(params.slug), mayAuthor()])
  if (!found) notFound()
  const { doc, related } = found

  return (
    <>
      <CrumbTail>{doc.title}</CrumbTail>
      <div className="hi">
        <div className="hi__t" />
        <div className="hi__go">
          {mayWrite && (
            <>
              <Link className="btn" href={`/wiki/${doc.slug}/edit` as any}>Edit</Link>
              <CheckedButton id={doc.id} at={doc.checkedAt} />
            </>
          )}
        </div>
      </div>

      {/* A sheet, not a panel: nearly white, with a measure short enough that
          the eye finds the start of the next line. */}
      <div className="wpage">
        <div className="wdoc">
          <h1>{doc.title}</h1>
          <p className="wpage__sub">
            {[doc.category, doc.entity ?? 'Every organization'].filter(Boolean).join(' · ')}
            {doc.status === 'draft' && ' · draft, nobody else can see it'}
          </p>

          <div className="wmeta">
            {doc.owner && (
              <span className="wmeta__who">
                <span className="pav">{doc.initials}</span><b>{doc.owner}</b> keeps this
              </span>
            )}
            <CheckMark at={doc.checkedAt} />
            <span>Edited {ago(doc.updatedAt)}</span>
          </div>

          {doc.tags.length > 0 && (
            <div className="wtags" style={{ margin: '-8px 0 22px' }}>
              {doc.tags.map((t) => (
                <Link className="wtag" key={t} href={`/wiki?tag=${t}` as any}>{t}</Link>
              ))}
            </div>
          )}

          {/* Generated on the server from the stored tree by the same schema
              the editor uses, so nothing here can be a tag that schema does not
              define. */}
          <div className="wbody" dangerouslySetInnerHTML={{ __html: renderDoc(doc.body) }} />

          {related.length > 0 && (
            <div className="wrel">
              <div className="wrel__h">
                <h2>Related documents</h2>
                <p>Found by the tags they share, the category they sit in, and the words in them.</p>
              </div>
              <div className="wrels">
                {related.map((r) => (
                  <Link className="wrelc" key={r.id} href={`/wiki/${r.slug}` as any}>
                    <span className="wrelc__t">{r.title}</span>
                    {r.summary && <span className="wrelc__s">{r.summary}</span>}
                    <span className="wrelc__y">{r.why}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
