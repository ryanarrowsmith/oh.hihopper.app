import { supabaseServer } from '@/lib/supabase/server'
import Section from '@/components/Section'
import { Caret, Level } from '@/components/Icons'
import LocationMap from '@/components/LocationMap'

/**
 * The portfolio -- what the business looks like, for looking at.
 *
 * This is the browsing view. It used to live at /admin/organizations, which
 * meant Admin > Organizations and the rail's Organizations were the same page,
 * so the one screen had to be both a picture of the group and a place to change
 * it, and was not much good at either. Managing organizations happens at
 * /admin/organizations now. Nothing here changes anything.
 */
export default async function Portfolio() {
  const db = supabaseServer()
  const { data: entities } = await db.schema('hopper')
    .from('entity').select('id, name, mark, status, parent_id').order('sort_order')
  const { data: departments } = await db.schema('hopper')
    .from('department').select('id, entity_id')
  // Enough of a location to draw its card. Head office first, then by name --
  // the order the drawer prints them in, decided once here rather than in the
  // markup.
  const { data: locations } = await db.schema('hopper')
    .from('location')
    .select('id, entity_id, name, address_line1, city, region, postal_code, latitude, longitude, is_head_office')
    .order('is_head_office', { ascending: false }).order('name')

  const all = entities ?? []
  const roots = all.filter((e: any) => !e.parent_id)
  const count = (list: any[] | null, id: string) =>
    (list ?? []).filter((x) => x.entity_id === id).length
  const placesOf = (id: string) => (locations ?? []).filter((l: any) => l.entity_id === id)

  /**
   * An organization's offices, under its own row.
   *
   * A business card each: the map is the photograph and the address is the
   * print under it, which is how you recognise a place you have been to. The
   * whole thing is a checkbox and a sibling selector -- no script, and the
   * row's own Open button stays clickable, which is the reason the branch
   * toggle was built this way too.
   */
  const Places = ({ e }: { e: any }) => {
    const places = placesOf(e.id)
    return (
      <div className="locwrap"><div><div className="locs">
        {places.length === 0 ? (
          <p className="locnone">No offices on file for {e.name} yet.</p>
        ) : (
          <div className="loccards">
            {places.map((l: any) => (
              <a className="loccard" key={l.id}
                 href={`/admin/organizations/${e.id}/locations/${l.id}`}>
                {l.latitude != null && l.longitude != null
                  ? <LocationMap lat={l.latitude} lng={l.longitude} label={l.name}
                                 height={84} zoom={13} hq={!!l.is_head_office} />
                  : <span className="lmap lmap--none" style={{ height: 84 }}>
                      <span>No pin yet</span>
                      {l.is_head_office && <span className="lochq" title="Head office">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path
                          d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9z" />
                        </svg></span>}
                    </span>}
                <span className="loccard__n">{l.name}</span>
                <span className="loccard__a">
                  {[l.address_line1, [l.city, l.region].filter(Boolean).join(', '), l.postal_code]
                    .filter(Boolean).join(', ') || 'No address yet'}
                </span>
              </a>
            ))}
          </div>
        )}
        <p className="locfoot">
          <a href={`/admin/organizations/${e.id}/locations`}>
            {places.length === 0 ? 'Add the first one' : 'All locations'}
          </a>
        </p>
      </div></div></div>
    )
  }

  const Row = ({ e, kid, toggles, places }: {
    e: any; kid?: boolean; toggles?: string; places?: string
  }) => (
    <div className={`tree__row${kid ? ' kid' : ''}${e.status === 'inactive' ? ' is-off' : ''}`}>
      <span className="rcell rcell--lead">
        {toggles
          ? <label className="tcar" htmlFor={toggles}
                   title="Show or hide what sits under this"><Caret /></label>
          : <span className="tcar tcar--none" />}
        {kid && <Level className="lv lvm" />}
        <span className="plate">{e.mark ?? '—'}</span>
        <a className="orgname" href={`/admin/organizations/${e.id}`}>{e.name}</a>
      </span>
      <span className="rcell">
        <span className="rcell__lab">Status</span>
        <span className="rcell__val">
          <span className={`pill ${e.status === 'active' ? 'pill--good'
            : e.status === 'inactive' ? 'pill--off' : 'pill--setup'}`}>
            {e.status === 'inactive' ? 'retired' : e.status}</span>
        </span>
      </span>
      <span className="rcell">
        <span className="rcell__lab">Contains</span>
        <span className="rcell__val">
          {(() => { const d = count(departments, e.id)
                    return `${d} ${d === 1 ? 'department' : 'departments'}` })()} ·{' '}
          {/* The count is the drawer. A count of nothing has nothing to open,
              so it is printed rather than dressed up as a control. */}
          {placesOf(e.id).length === 0
            ? <span className="lcount lcount--none">0 locations</span>
            : <label className="lcount" htmlFor={places}
                     title={`Show or hide the offices in ${e.name}`}>
                <Caret />{placesOf(e.id).length}
                {placesOf(e.id).length === 1 ? ' location' : ' locations'}
              </label>}
        </span>
      </span>
      <span className="rcell rcell--act">
        <a className="btn" href={`/admin/organizations/${e.id}`}>Open</a>
      </span>
    </div>
  )

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Organizations</h1>
          <p className="scopeline"><span>
            A parent and everything beneath it. Granting somebody a parent grants
            them the whole branch — that is what choosing a holding company means.
          </span></p>
        </div>
      </div>

      <Section title="The portfolio"
               blurb={`${all.length} organizations, ${roots.length} at the top.`}
               action={<a className="btn" href="/admin/organizations">Manage</a>}>
        {all.length === 0 ? (
          <p className="empty">
            No organizations you can open. Either none exist yet, or none have been granted to you.
          </p>
        ) : (
          <div className="tree">
            {roots.map((r: any) => {
              const kids = all.filter((c: any) => c.parent_id === r.id)
              /* A checkbox nobody sees does the opening, so the row's own Open
                 button stays clickable -- inside a <summary> the browser eats
                 the click. The branch is open by default: a portfolio that
                 hides itself on arrival is a portfolio you have to unpack every
                 visit. The locations are shut by default, because nine
                 organizations' worth of open drawers is not a portfolio either.
                 Two checkboxes, two independent things. */
              const id = `t-${r.id}`
              const lid = `l-${r.id}`
              return (
                <div className="tnode" key={r.id}>
                  {kids.length > 0 && (
                    <input type="checkbox" id={id} className="tvis" defaultChecked
                           aria-label={`Show or hide what sits under ${r.name}`} />
                  )}
                  <input type="checkbox" id={lid} className="lvis"
                         aria-label={`Show or hide the offices in ${r.name}`} />
                  <Row e={r} toggles={kids.length ? id : undefined} places={lid} />
                  <Places e={r} />
                  {kids.length > 0 && (
                    <div className="tree__kids"><div className="tree__clip">
                      {kids.map((c: any) => {
                        /* The child is a card, and its offices open inside that
                           card rather than across the slab underneath it. */
                        const kl = `l-${c.id}`
                        return (
                          <div className="tnode" key={c.id}>
                            <input type="checkbox" id={kl} className="lvis"
                                   aria-label={`Show or hide the offices in ${c.name}`} />
                            <div className="okid">
                              <Row e={c} kid places={kl} />
                              <Places e={c} />
                            </div>
                          </div>
                        )
                      })}
                    </div></div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </>
  )
}
