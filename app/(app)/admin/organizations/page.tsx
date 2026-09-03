import { supabaseServer } from '@/lib/supabase/server'
import { EditableSection, RowForm } from '@/components/RowEdit'
import Choice from '@/components/Choice'
import { Caret, Level } from '@/components/Icons'
import LocationMap from '@/components/LocationMap'
import { createEntity } from '@/app/actions/admin'

export default async function Organizations() {
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

  /**
   * One organization. The cells carry their own column names so the row can
   * become a card on a phone without being rebuilt -- and a child says it is a
   * child with the level arrow there, because 34px of indent is a third of a
   * phone's width.
   */
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
        {/* One link, to the page that actually holds Add and Import. Two links
            to the same page, one of them promising a form it cannot open, is
            worse than one that says where it goes. */}
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
    <div className={`tree__row${kid ? ' kid' : ''}`}>
      <span className="rcell rcell--lead">
        {toggles
          ? <label className="tcar" htmlFor={toggles}
                   title="Show or hide what sits under this"><Caret /></label>
          : <span className="tcar tcar--none" />}
        {kid && <Level className="lv lvm" />}
        <span className="plate">{e.mark ?? '—'}</span>
        <b style={{ fontSize: 14 }}>{e.name}</b>
      </span>
      <span className="rcell">
        <span className="rcell__lab">Status</span>
        <span className="rcell__val">
          <span className={`pill ${e.status === 'active' ? 'pill--good' : 'pill--setup'}`}>
            {e.status}</span>
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

      <EditableSection
        title="The portfolio"
        blurb={`${all.length} organizations, ${roots.length} at the top.`}
        addLabel="Adding an organization"
        addForm={
            <RowForm action={createEntity} label="Add it" busy="Adding…">
              <div className="formrow">
                <div><label htmlFor="e-name">Name</label>
                  <input className="field" id="e-name" name="name" required
                         placeholder="Locked Up Self Storage" /></div>
                <div><label htmlFor="e-legal">Legal name</label>
                  <input className="field" id="e-legal" name="legal_name" placeholder="Optional" /></div>
              </div>
              <div className="formrow" style={{ marginTop: 12 }}>
                <div><label htmlFor="e-mark">Mark</label>
                  <input className="field" id="e-mark" name="mark" maxLength={4} placeholder="LU" /></div>
                <div><label htmlFor="e-parent">Sits under</label>
                  <Choice id="e-parent" name="parent_id" placeholder="Nothing — top level"
                          options={[{ value: '', label: 'Nothing — it\u2019s a top-level organization' },
                                    ...all.map((e: any) => ({ value: e.id, label: e.name }))]} /></div>
                <div><label htmlFor="e-status">Status</label>
                  <Choice id="e-status" name="status" defaultValue="setup"
                          options={[{ value: 'setup', label: 'Setting up' },
                                    { value: 'active', label: 'Active' },
                                    { value: 'inactive', label: 'Inactive' }]} /></div>
              </div>
            </RowForm>
        }
      >
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
      </EditableSection>
    </>
  )
}
