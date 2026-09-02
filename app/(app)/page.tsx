import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'

export default async function Home() {
  const session = (await currentSession())!
  const db = supabaseServer()

  const { data: entities } = await db.schema('hopper')
    .from('entity').select('id, name, mark, status, parent_id').order('sort_order')
  const { count: people } = await db.schema('hopper')
    .from('person').select('id', { count: 'exact', head: true })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = session.displayName.split(' ')[0]
  const roots = (entities ?? []).filter((e: any) => !e.parent_id)

  return (
    <>
      <div className="hi">
        <h1>{greeting}, {first}.</h1>
        <p className="scopeline">
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}Showing all {entities?.length ?? 0} organizations</span>
        </p>
      </div>

      <Section title="Your organizations"
        blurb="Everything you can open. What you cannot open is absent, not greyed out."
        action={<a className="btn" href="/admin/organizations">Manage</a>}>
        {(entities?.length ?? 0) === 0 ? (
          <p className="empty">Nothing here yet. Add your first organization in Admin.</p>
        ) : (
          <div className="cards">
            {roots.map((e: any) => {
              const kids = (entities ?? []).filter((c: any) => c.parent_id === e.id)
              return (
                <article className="card" key={e.id}>
                  <div className="card__h">
                    <span className="plate">{e.mark ?? '—'}</span>
                    <b>{e.name}</b>
                  </div>
                  <div className="card__rows">
                    <div className="row"><span>Child organizations</span><em className="tnum">{kids.length}</em></div>
                    <div className="row"><span>People</span><em className="tnum">{people ?? 0}</em></div>
                    <div className="row"><span>Status</span><em>{e.status}</em></div>
                  </div>
                  <div className="card__f">
                    <a className="btn" href={`/admin/organizations/${e.id}`}>Open</a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </Section>
    </>
  )
}
