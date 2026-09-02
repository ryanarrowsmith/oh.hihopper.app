import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import Dolly from '@/components/Dolly'
import Clock from '@/components/Clock'

const Handle = () => (
  <button className="grab" type="button" aria-label="Move this section">
    <svg viewBox="0 0 12 14"><circle cx="3" cy="2" r="1.3" /><circle cx="9" cy="2" r="1.3" />
      <circle cx="3" cy="7" r="1.3" /><circle cx="9" cy="7" r="1.3" />
      <circle cx="3" cy="12" r="1.3" /><circle cx="9" cy="12" r="1.3" /></svg>
  </button>
)

export default async function Home() {
  const session = (await currentSession())!
  const db = supabaseServer()

  const [{ data: entities }, { count: people }, { data: locations }] = await Promise.all([
    db.schema('hopper').from('entity').select('id, name, mark, status, parent_id').order('sort_order'),
    db.schema('hopper').from('person').select('id', { count: 'exact', head: true }),
    db.schema('hopper').from('location').select('id, entity_id'),
  ])

  const all = entities ?? []
  const roots = all.filter((e: any) => !e.parent_id)
  const kids = (id: string) => all.filter((e: any) => e.parent_id === id).length
  const locs = (id: string) => (locations ?? []).filter((l: any) => l.entity_id === id).length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = session.displayName.split(' ')[0]

  return (
    <>
      {/* canvas buttons: bubbled, canvas-toned, named on hover */}
      <div className="tools">
        <div className="bubw">
          <a className="bub" href="#" aria-label="Your favorites">
            <svg viewBox="0 0 24 24"><path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z" /></svg>
          </a>
          <span className="bubl" aria-hidden="true">Favorites</span>
        </div>
        <div className="bubw">
          <button className="bub" type="button" aria-label="Add a widget">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" />
              <rect x="3" y="13.5" width="7.5" height="7.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" />
              <path d="M17.25 3v7.5M13.5 6.75h7.5" /></svg>
          </button>
          <span className="bubl" aria-hidden="true">Add widget</span>
        </div>
        <div className="bubw">
          <button className="bub" type="button" aria-label="Reorganize this page">
            <svg viewBox="0 0 24 24"><path d="M8 4 5 7l3 3" /><path d="M5 7h9a4 4 0 0 1 0 8h-1" />
              <path d="M16 20l3-3-3-3" /><path d="M19 17h-9" /></svg>
          </button>
          <span className="bubl" aria-hidden="true">Reorganize</span>
        </div>
      </div>

      <div className="hi">
        <h1>{greeting}, <span className="hl">{first}</span>.</h1>
        <p className="scopeline">
          <span>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}Showing all {all.length} {all.length === 1 ? 'organization' : 'organizations'}
          </span>
        </p>
      </div>

      <Dolly />

      <div className="desk">
        <div>
          <section className="sec">
            <div className="sec__h">
              <div className="sec__t">
                <h2>Your organizations</h2>
                <p>Everything you can open. What you cannot open is absent, not greyed out.</p>
              </div>
              <div className="sec__a"><Handle /><a className="btn" href="/admin/organizations">Manage</a></div>
            </div>

            {all.length === 0 ? (
              <p className="empty">
                Nothing here yet. Either no organizations exist, or none have been granted to you.
              </p>
            ) : (
              <div className="cards">
                {roots.map((e: any) => (
                  <article className="card" key={e.id}>
                    <div className="card__h">
                      <span className="plate">{e.mark ?? '—'}</span>
                      <b>{e.name}</b>
                    </div>
                    <div className="card__rows">
                      <div className="row"><span>Child organizations</span><em className="tnum">{kids(e.id)}</em></div>
                      <div className="row"><span>Locations</span><em className="tnum">{locs(e.id)}</em></div>
                      <div className="row"><span>People</span><em className="tnum">{people ?? 0}</em></div>
                    </div>
                    <div className="card__f">
                      <a className="btn" href={`/admin/organizations/${e.id}`}>Open</a>
                      <a className="btn" href="/admin/people">People</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Open items, tickets and favourites are deliberately absent rather
              than faked: there is nothing behind them yet, and a home page that
              invents its own contents is worse than one that is honest. */}
        </div>

        <aside className="side">
          <div className="pane">
            <h3>Right now</h3>
            <Clock />
          </div>

          <div className="pane">
            <h3>Jump to an organization</h3>
            <div className="jump">
              {all.length === 0
                ? <p className="datel">Nothing to jump to yet.</p>
                : all.map((e: any) => (
                    <a key={e.id} href={`/admin/organizations/${e.id}`}>
                      <span className="pl">{e.mark ?? '—'}</span> {e.name}
                      {kids(e.id) > 0 && <em>{kids(e.id)}</em>}
                    </a>
                  ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
