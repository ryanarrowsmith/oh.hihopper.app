'use client'
import Link from 'next/link'
import { useState } from 'react'
import Avatar from '@/components/Avatar'
import { OrgMark, PlaceMark } from '@/components/Icons'

/**
 * The directory. Cards, not a table: a roster is about employment and reads
 * down a column, a directory is about faces -- you are looking for somebody
 * you half remember.
 *
 * Three densities, because it is browsed at three different intents: putting
 * names to faces, scanning a team you already know, and looking one person up.
 * The choice is the reader's and sits above the groups, since it governs all
 * of them.
 *
 * A card is a link to that person, and that is the whole of it. There used to
 * be a contact card over the page: everything the directory knew, laid out
 * beautifully, and at the foot of it a button called "Open their page". A
 * panel whose best row is a link to somewhere else is a toll gate -- it makes
 * everybody stop at a summary on the way to the thing they asked for, and it
 * has to be kept in step with the page it summarises forever. The page is
 * better than the summary was, so the summary is gone.
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
}

type View = 'lg' | 'md' | 'row'

export default function Directory({ groups }:
  { groups: { entity_id: string | null; name: string; people: Person[] }[] }) {
  const [view, setView] = useState<View>('lg')
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
                <Link className="prow" key={p.id} href={`/people/${p.id}`}>
                  <Avatar name={p.full_name} src={p.photo_url} size={38} />
                  <span className="prow__n">{p.full_name}</span>
                  <span className="prow__w">
                    {[p.location_name, p.department_name].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className="prow__r">{p.role_name ?? '—'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={`pgrid pgrid--${view}`}>
              {g.people.map((p) => (
                <Link className="pcard" key={p.id} href={`/people/${p.id}`}>
                  {p.photo_url
                    ? <img className="pcard__img" src={p.photo_url} alt="" />
                    : <span className="pcard__img pcard__img--none">{initials(p.full_name)}</span>}
                  <span className="pcard__b">
                    <span className="pcard__n">{p.full_name}</span>
                    <span className="pcard__r">{p.role_name ?? 'No role yet'}</span>
                    <span className="pwhere">
                      {p.entity_name && (
                        <span className="pw"><OrgMark /><span>{p.entity_name}</span></span>
                      )}
                      {p.location_name && (
                        <span className="pw"><PlaceMark /><span>{p.location_name}</span></span>
                      )}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  )
}

function initials(name: string) {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]).join('').toUpperCase() || '?'
}
