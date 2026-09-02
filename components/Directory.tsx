'use client'
import { useEffect, useState } from 'react'
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
                <a className="prow" href={`/people/${p.id}`} key={p.id}>
                  <Avatar name={p.full_name} src={p.photo_url} size={38} />
                  <span className="prow__n">{p.full_name}</span>
                  <span className="prow__w">
                    {[p.location_name, p.department_name].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className="prow__r">{p.role_name ?? '—'}</span>
                </a>
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
      {open && <Popover p={p} />}
    </div>
  )
}

/** Their information without leaving the directory you were searching. */
function Popover({ p }: { p: Person }) {
  const minis: { label: string; value: string | null; media: React.ReactNode }[] = [
    { label: 'Birthday', value: p.birth_month ? MONTHS[p.birth_month - 1] : null,
      media: <Birthday /> },
    { label: 'Color', value: p.favorite_color,
      media: <span className="swatch__c" style={{ background: p.favorite_color ?? undefined }} /> },
    { label: 'Restaurant', value: p.restaurant_name,
      media: <span className="gmap"><svg viewBox="0 0 24 32"><path d="M12 31C12 31 22 19.8 22 12A10 10 0 1 0 2 12c0 7.8 10 19 10 19z" /></svg></span> },
    { label: 'Song', value: p.song_title,
      media: <span className="disc">{p.song_art_url
        ? <img className="disc__lab" src={p.song_art_url} alt="" />
        : <span className="disc__lab"><i /></span>}</span> },
    { label: 'Movie', value: p.movie_title,
      media: p.movie_art_url ? <img className="post__p" src={p.movie_art_url} alt="" />
        : <span className="post__p"><span>{p.movie_title}</span></span> },
    { label: 'Book', value: p.book_title,
      media: p.book_cover_url ? <img className="book" src={p.book_cover_url} alt="" />
        : <span className="book"><span>{p.book_title}</span></span> },
    { label: 'Candy', value: p.candy,
      media: <span className="candy">{p.candy_img_url
        ? <img src={p.candy_img_url} alt="" /> : <span>{p.candy}</span>}</span> },
  ].filter((m) => m.value)

  return (
    <div className="ppop" role="dialog" aria-label={p.full_name}
         onClick={(e) => e.stopPropagation()}>
      <div className="ppop__h">
        <Avatar name={p.full_name} src={p.photo_url} size={52} />
        <span className="ppop__t">
          <b>{p.full_name}</b><span>{p.role_name ?? 'No role yet'}</span>
        </span>
      </div>

      <div className="ppop__b">
        <p className="ppop__s">Where they sit</p>
        <div className="ppop__w">
          {p.entity_name && <span className="pw"><OrgMark /><span>{p.entity_name}</span></span>}
          {p.department_name && <span className="pw"><OrgMark /><span>{p.department_name}</span></span>}
          {p.location_name && <span className="pw"><PlaceMark /><span>{p.location_name}</span></span>}
        </div>

        {minis.length > 0 && (
          <>
            <p className="ppop__s ppop__gap">Get to know them</p>
            <div className="mini">
              {minis.map((m) => (
                <span className="mini__c" key={m.label}>
                  <span className="mini__m">{m.media}</span>
                  <span className="mini__l">{m.label}</span>
                  <span className="mini__v">{m.value}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="ppop__go">
        <a className="btn btn--amber" href={`/people/${p.id}`}>Open their page</a>
      </div>
    </div>
  )
}

function initials(name: string) {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]).join('').toUpperCase() || '?'
}
