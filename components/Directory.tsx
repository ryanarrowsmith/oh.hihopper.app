'use client'
import { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import { OrgMark, PlaceMark } from '@/components/Icons'
import { Birthday } from '@/components/Favorites'

/**
 * The directory. Cards, not a table: a roster is about employment and reads
 * down a column, a directory is about faces -- you are looking for somebody
 * you half remember.
 *
 * Three densities, because it is browsed at three different intents: putting
 * names to faces, scanning a team you already know, and looking one person up.
 * The choice is the reader's and sits above the groups, since it governs all
 * of them.
 */
export type Person = {
  id: string
  full_name: string
  photo_url: string | null
  role_name: string | null
  department_name: string | null
  location_name: string | null
  entity_name: string | null
  entity_id: string | null
  birth_month: number | null
  favorite_color: string | null
  candy: string | null; candy_img_url: string | null
  restaurant_name: string | null
  song_title: string | null; song_artist: string | null; song_art_url: string | null
  movie_title: string | null; movie_art_url: string | null
  book_title: string | null; book_cover_url: string | null
  /** Only present for readers the roster grant lets see them. */
  email?: string | null
  phone?: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

type View = 'lg' | 'md' | 'row'

export default function Directory({ groups }:
  { groups: { entity_id: string | null; name: string; people: Person[] }[] }) {
  const [view, setView] = useState<View>('lg')
  const [open, setOpen] = useState<string | null>(null)

  // Outside click and Escape both shut it, and only one is ever open.
  useEffect(() => {
    if (!open) return
    const away = () => setOpen(null)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('click', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const total = groups.reduce((n, g) => n + g.people.length, 0)
  const shown = open
    ? groups.flatMap((g) => g.people).find((x) => x.id === open) ?? null
    : null

  // The page behind must not scroll while the card is up.
  useEffect(() => {
    if (!shown) return
    const had = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = had }
  }, [shown])

  return (
    <>
      <div className="viewbar">
        <span className="viewbar__l">{total} {total === 1 ? 'person' : 'people'}</span>
        <div className="seg" role="group" aria-label="How to show them">
          {([['lg', 'Large'], ['md', 'Medium'], ['row', 'Rows']] as [View, string][])
            .map(([v, label]) => (
              <button key={v} className="seg__b" type="button" aria-pressed={view === v}
                      onClick={() => setView(v)}>{label}</button>
            ))}
        </div>
      </div>

      {groups.map((g) => (
        <section className="sec" key={String(g.entity_id)}>
          <div className="sec__h">
            <div className="sec__t">
              <h2>{g.name}</h2>
              <p>{g.people.length} {g.people.length === 1 ? 'person' : 'people'}</p>
            </div>
          </div>

          {view === 'row' ? (
            <div className="plist">
              {g.people.map((p) => (
                <button className="prow" type="button" key={p.id}
                        onClick={(e) => { e.stopPropagation(); setOpen(p.id) }}>
                  <Avatar name={p.full_name} src={p.photo_url} size={38} />
                  <span className="prow__n">{p.full_name}</span>
                  <span className="prow__w">
                    {[p.location_name, p.department_name].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className="prow__r">{p.role_name ?? '—'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={`pgrid pgrid--${view}`}>
              {g.people.map((p) => (
                <Card key={p.id} p={p} open={open === p.id}
                      onOpen={(e) => { e.stopPropagation(); setOpen(open === p.id ? null : p.id) }} />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* One overlay for the whole page, not one hung off each card. It used
          to hang off the card that raised it and it did not work: a grid gives
          no z-order guarantee, and every card makes its own stacking context
          the moment it lifts on hover -- so the card after the one you clicked
          painted straight over the panel. z-index cannot fix that; a child
          cannot escape its parent's stacking context. */}
      {shown && <ContactCard p={shown} onClose={() => setOpen(null)} />}
    </>
  )
}

function Card({ p, open, onOpen }:
  { p: Person; open: boolean; onOpen: (e: React.MouseEvent) => void }) {
  return (
    <div className="pcard" role="button" tabIndex={0} onClick={onOpen}
         aria-expanded={open}
         onKeyDown={(e) => {
           if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e as any) }
         }}>
      {p.photo_url
        ? <img className="pcard__img" src={p.photo_url} alt="" />
        : <span className="pcard__img pcard__img--none">{initials(p.full_name)}</span>}
      <span className="pcard__b">
        <span className="pcard__n">{p.full_name}</span>
        <span className="pcard__r">{p.role_name ?? 'No role yet'}</span>
        <span className="pwhere">
          {p.entity_name && <span className="pw"><OrgMark /><span>{p.entity_name}</span></span>}
          {p.location_name && <span className="pw"><PlaceMark /><span>{p.location_name}</span></span>}
        </span>
      </span>
    </div>
  )
}

/**
 * Their contact card, centred over the page.
 *
 * Everything the directory knows, laid out the way a contact card is: who
 * first, then how to reach them, then where they sit, then the answers. It is
 * a dialog, so Escape closes it, a click on the scrim closes it, and the page
 * behind it does not scroll while it is up.
 */
function ContactCard({ p, onClose }: { p: Person; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    card.current?.focus()
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const minis = [
    { label: 'Birthday', value: p.birth_month ? MONTHS[p.birth_month - 1] : null, sub: null,
      media: <Birthday /> },
    { label: 'Color', value: p.favorite_color, sub: null,
      media: <span className="swatch__c" style={{ background: p.favorite_color ?? undefined }} /> },
    { label: 'Restaurant', value: p.restaurant_name, sub: null,
      media: <span className="gmap"><svg viewBox="0 0 24 32"><path d="M12 31C12 31 22 19.8 22 12A10 10 0 1 0 2 12c0 7.8 10 19 10 19z" /></svg></span> },
    { label: 'Song', value: p.song_title, sub: p.song_artist,
      media: <span className="disc">{p.song_art_url
        ? <img className="disc__lab" src={p.song_art_url} alt="" />
        : <span className="disc__lab"><i /></span>}</span> },
    { label: 'Movie', value: p.movie_title, sub: null,
      media: p.movie_art_url ? <img className="post__p" src={p.movie_art_url} alt="" />
        : <span className="post__p"><span>{p.movie_title}</span></span> },
    { label: 'Book', value: p.book_title, sub: null,
      media: p.book_cover_url ? <img className="book" src={p.book_cover_url} alt="" />
        : <span className="book"><span>{p.book_title}</span></span> },
    { label: 'Candy', value: p.candy, sub: null,
      media: <span className="candy">{p.candy_img_url
        ? <img src={p.candy_img_url} alt="" /> : <span>{p.candy}</span>}</span> },
  ].filter((m) => m.value)

  const where = [
    p.entity_name && { icon: <OrgMark />, text: p.entity_name, kind: 'Organization',
                       href: p.entity_id ? `/admin/organizations/${p.entity_id}` : null },
    p.department_name && { icon: <DeptMark />, text: p.department_name, kind: 'Department', href: null },
    p.location_name && { icon: <PlaceMark />, text: p.location_name, kind: 'Location', href: null },
  ].filter(Boolean) as { icon: React.ReactNode; text: string; kind: string; href: string | null }[]

  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div className="ccard" role="dialog" aria-modal="true" aria-label={p.full_name}
           tabIndex={-1} ref={card} onClick={(e) => e.stopPropagation()}>
        <div className="ccard__top">
          {p.photo_url && <img className="ccard__bg" src={p.photo_url} alt="" />}
          <button className="ccard__x" type="button" aria-label="Close" onClick={onClose}>&times;</button>
          <Avatar name={p.full_name} src={p.photo_url} size={72} />
          <span className="ccard__who">
            <b>{p.full_name}</b>
            <span>{[p.role_name, p.entity_name].filter(Boolean).join(' · ')}</span>
          </span>
        </div>

        <div className="ccard__b">
          {(p.email || p.phone) && (
            <>
              <p className="ccard__s">Get in touch</p>
              <div className="crows">
              {p.email && (
                <a className="crow" href={`mailto:${p.email}`}>
                  <MailMark /><b>{p.email}</b><span className="crow__k">Email</span>
                </a>
              )}
              {p.phone && (
                <a className="crow" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>
                  <TelMark /><b>{p.phone}</b><span className="crow__k">Phone</span>
                </a>
              )}
              </div>
            </>
          )}

          {where.length > 0 && (
            <>
              <p className={`ccard__s${p.email || p.phone ? ' ccard__gap' : ''}`}>Where they sit</p>
              <div className="crows">
              {where.map((w) =>
                w.href
                  ? <a className="crow" href={w.href} key={w.kind}>
                      {w.icon}{w.text}<span className="crow__k">{w.kind}</span></a>
                  : <span className="crow" key={w.kind}>
                      {w.icon}{w.text}<span className="crow__k">{w.kind}</span></span>,
              )}
              </div>
            </>
          )}

          {minis.length > 0 && (
            <>
              <p className="ccard__s ccard__gap">Get to know them</p>
              <div className="mini">
                {minis.map((m) => (
                  <span className="mini__c" key={m.label}>
                    <span className="mini__m">{m.media}</span>
                    <span className="mini__l">{m.label}</span>
                    <span className="mini__v">{m.value}</span>
                    {m.sub ? <span className="mini__s">{m.sub}</span> : null}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ccard__go">
          <a className="btn btn--amber" href={`/people/${p.id}`}>Open their page</a>
          {p.email && <a className="btn" href={`mailto:${p.email}`}>Email</a>}
        </div>
      </div>
    </div>
  )
}

const DeptMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 21V9l8-5 8 5v12" /><path d="M9 21v-6h6v6" />
  </svg>
)
const MailMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" /><path d="m3 7 9 6 9-6" />
  </svg>
)
const TelMark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
  </svg>
)

function initials(name: string) {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]).join('').toUpperCase() || '?'
}
