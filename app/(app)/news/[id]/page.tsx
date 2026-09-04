import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { loadPost } from '@/lib/news'
import CrumbTail from '@/components/CrumbTail'
import PrintButton from '@/components/PrintButton'
import { renderDoc } from '@/lib/wiki-render'
import PostExtras from '@/components/PostExtras'
import { I, Kat, Left, LINK, PAGE, PEN, day, size } from '@/components/NewsBits'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: { id: string } }) {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  const post = await loadPost(params.id)
  if (!post) notFound()

  const files = post.items.filter((i) => i.kind === 'file')
  const links = post.items.filter((i) => i.kind === 'link')

  return (
    <>
      <CrumbTail>{post.title}</CrumbTail>
      <div className="pj__h">
        <div className="pj__id">
          <h1>{post.title}</h1>
          <p className="pjline">
            <Kat mark={post.mark} name={post.category} />
            {[post.department ? `${post.department} · ${post.entity}`
                              : `Everyone at ${post.entity}`,
              post.author, day(post.postedOn),
              post.status === 'draft' ? 'A draft — nobody else can see it' : null,
              post.status === 'retired' ? 'Retired — kept, but no longer current' : null]
              .filter(Boolean).map((bit, i) => <span key={i}>{bit}</span>)}
            {post.banner && post.comesOff && (
              <span><Left days={post.daysLeft ?? 0} off={post.comesOff} /></span>
            )}
            {post.tags.map((t) => <span className="td__tag" key={t}>{t}</span>)}
          </p>
        </div>
        <div className="pj__go">
          <PrintButton />
          {post.mayEdit && (
            <Link className="btn btn--mark" href={`/news/${post.id}/edit` as any}
                  aria-label="Edit this announcement" data-tip="Edit this announcement">
              {I(PEN, '1.8')}
            </Link>
          )}
        </div>
      </div>

      {/* The same renderer the wiki uses, so a heading in an announcement and a
          heading in the handbook are the same heading. */}
      <article className="npost wbody"
               dangerouslySetInnerHTML={{ __html: renderDoc(post.body) }} />

      {files.length > 0 && (
        <section className="tdcard">
          <div className="tdcard__bar"><b>Attachments</b>
            <span className="tdcard__sub">{files.length}</span></div>
          <div className="tdcard__body">
            {files.map((f) => (
              <p className="tdfile" key={f.id}>
                {I(PAGE, '1.8')}
                <b>{f.file?.name}</b>
                <span>{size(f.file?.bytes ?? 0)}</span>
                <a className="lnk" href={`/api/news/file/${f.id}`} target="_blank" rel="noreferrer">
                  Open
                </a>
              </p>
            ))}
          </div>
        </section>
      )}

      {links.length > 0 && (
        <section className="tdcard">
          <div className="tdcard__bar"><b>Links</b>
            <span className="tdcard__sub">{links.length}</span></div>
          <div className="tdcard__body">
            {links.map((l) => (
              <p className="tdfile" key={l.id}>
                {I(LINK, '1.8')}
                <b>{l.label}</b>
                <span>{host(l.url)}</span>
                <a className="lnk" href={l.url ?? '#'} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
              </p>
            ))}
          </div>
        </section>
      )}

      {post.mayEdit && <PostExtras post={post} />}
    </>
  )
}

const host = (u: string | null) => {
  if (!u) return ''
  try { return new URL(u).host.replace(/^www\./, '') } catch { return '' }
}
