import Link from 'next/link'
import Avatar from '@/components/Avatar'
import Chart, { type Series } from '@/components/Chart'
import DrawnMap from '@/components/DrawnMap'
import LocalTime from '@/components/LocalTime'
import OrgLogo from '@/components/OrgLogo'

/**
 * The bodies of the home page's sections.
 *
 * Server components, every one, so a widget's data is read where its policies
 * are rather than shipped to the browser to be arranged. HomeBoard owns the
 * order and knows nothing about what is inside any of these.
 *
 * Each is a full-width section with its own mark, one line saying what it is,
 * and cards -- the same furniture, so a page of six of them reads as one page
 * rather than six products.
 */
/**
 * A section, its mark, its one line, and its one way out.
 *
 * The way out used to be a button carrying a word -- "All of them", "Manage" --
 * six of which down a page is six shouts of the same volume as the headings
 * they sit beside. It is an icon now, and it arrives when the pointer does.
 * Not hover ALONE: it comes back on keyboard focus too, or the only way to the
 * rest of a list would be to own a mouse.
 */
export function Sec({ mark, title, note, to, tip, children }: {
  mark: React.ReactNode; title: string; note: string
  to?: string; tip?: string; children: React.ReactNode
}) {
  return (
    <section className="hxsec">
      <div className="hxsec__h">
        <span className="hxsec__m" aria-hidden="true">{mark}</span>
        <h2>{title}</h2>
        <span className="hxsec__sp" />
        {to && (
          <span className="hxsec__a">
            <Link className="cbub" href={to as any} data-tip={tip} aria-label={tip}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" /><path d="M21 3l-9 9" />
                <path d="M20 14v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6" /></svg>
            </Link>
          </span>
        )}
      </div>
      <p className="hxsec__n">{note}</p>
      {children}
    </section>
  )
}

/**
 * The picture on a card.
 *
 * Every card carries one, and which one is decided by what the card IS: a
 * number gets its shape, a place gets its map, an organization gets its
 * artwork, a person gets their face. A grid where some cards have a picture
 * and others do not reads as a grid where something failed to load.
 */
export function Art({ chart, address, logo, mark, name, photo }: {
  chart?: { type: string; series: Series[] } | null
  address?: string; logo?: string | null; mark?: string | null
  name?: string; photo?: string | null
}) {
  if (chart && (chart.series[0]?.points.length ?? 0) > 0) {
    return (
      <span className="hxart hxart--chart">
        <Chart type={chart.type} series={chart.series} height={76} labels={false} bare compact />
      </span>
    )
  }
  if (address) return <span className="hxart">{<DrawnMapBand address={address} />}</span>
  if (name && (logo !== undefined || mark !== undefined)) {
    return <span className="hxart hxart--logo"><OrgLogo name={name} mark={mark} src={logo} /></span>
  }
  if (name) {
    return (
      <span className="hxart hxart--face">
        {photo
          ? <img className="hxport__f" src={photo} alt="" />
          : <span className="hxport__m"><Avatar name={name} size={52} /></span>}
      </span>
    )
  }
  // Nothing to draw is a real answer, and an empty band is not: the card simply
  // has no picture rather than a grey rectangle where one failed.
  return null
}

function DrawnMapBand({ address }: { address: string }) {
  return <DrawnMap address={address} label="" />
}

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)

export const MARKS = {
  favs: I('<path d="M12 20.2S4 15 4 9.6a4.4 4.4 0 0 1 8-2.5 4.4 4.4 0 0 1 8 2.5c0 5.4-8 10.6-8 10.6z"/>'),
  dash: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  locs: I('<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>'),
  orgs: I('<rect x="3" y="8" width="7" height="13"/><rect x="14" y="3" width="7" height="18"/>'),
  cont: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M17.5 20a6 6 0 0 0-2-4.5"/>'),
  team: I('<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/><path d="M17 11h5M19.5 8.5v5"/>'),
}

const KINDMARK: Record<string, string> = {
  report: 'Report', entity: 'Organization', person: 'Person', location: 'Place',
}

/* ─────────────────────────────────────────────── favorites */
export function FavsWidget({ items }: { items: any[] }) {
  return (
    <Sec mark={MARKS.favs} title="Favorites"
         note="Whatever you have hearted. Un-hearting happens on the Favorites page."
         to="/favorites" tip="All of your favorites">
      {items.length === 0
        ? <p className="empty">Nothing hearted yet. The heart on a card or a page puts it here.</p>
        : <div className="hxgrid">
            {items.slice(0, 8).map((f) => (
              <Link className="hxcard" key={`${f.kind}-${f.id}`} href={f.href as any}>
                <span className="hxcard__k">{KINDMARK[f.kind] ?? f.kind}</span>
                <b className="hxcard__t">{f.label}</b>
                <Art chart={f.chart} address={f.address}
                     name={f.kind === 'entity' || f.kind === 'person' ? f.label : undefined}
                     mark={f.kind === 'entity' ? f.mark : undefined}
                     logo={f.kind === 'entity' ? f.logo : undefined}
                     photo={f.kind === 'person' ? f.photo : undefined} />
                {f.sub && <span className="hxcard__s">{f.sub}</span>}
              </Link>
            ))}
          </div>}
    </Sec>
  )
}

/* ─────────────────────────────────────────────── dashboards */
export function DashWidget({ boards }: { boards: any[] }) {
  return (
    <Sec mark={MARKS.dash} title="Dashboards"
         note="The boards you keep, and how many numbers are on each."
         to="/dashboards" tip="All of your dashboards">
      {boards.length === 0
        ? <p className="empty">No boards yet. Dashboards is where you make one.</p>
        : <div className="hxgrid">
            {boards.slice(0, 6).map((b) => (
              <Link className="hxcard" key={b.id} href={`/dashboards/${b.id}` as any}>
                <span className="hxcard__k">
                  {b.mine ? (b.shared ? 'Shared by you' : 'Yours') : 'Shared with you'}
                </span>
                <b className="hxcard__t">{b.title}</b>
                <Art chart={b.chart} />
                <span className="hxcard__s">{b.cards} {b.cards === 1 ? 'report' : 'reports'}</span>
              </Link>
            ))}
          </div>}
    </Sec>
  )
}

/* ─────────────────────────────────────────────── locations */
export function LocsWidget({ places }: { places: any[] }) {
  return (
    <Sec mark={MARKS.locs} title="Locations"
         note="Addresses you keep coming back to, with the local time at each."
         to="/admin/organizations/locations" tip="All of your locations">
      {places.length === 0
        ? <p className="empty">No addresses on file yet.</p>
        : <div className="hxgrid hxgrid--wide">
            {places.slice(0, 4).map((l) => (
              <article className="hxcard hxcard--map" key={l.id}>
                <span className="hxcard__h">
                  <b className="hxcard__t">{l.name}</b>
                  {l.head && <em className="pill">Head office</em>}
                </span>
                <DrawnMap address={l.address} />
                <span className="hxrows">
                  {l.entity && <span className="hxrow"><span>Organization</span><em>{l.entity}</em></span>}
                  {l.phone && <span className="hxrow"><span>Phone</span><em>{l.phone}</em></span>}
                  {l.tz && <span className="hxrow"><span>Local time</span><em><LocalTime tz={l.tz} /></em></span>}
                </span>
                <span className="hxcard__f">
                  <a className="btn" target="_blank" rel="noreferrer"
                     href={`https://maps.google.com/?q=${encodeURIComponent(String(l.address).replace(/\n/g, ', '))}`}>
                    Directions
                  </a>
                </span>
              </article>
            ))}
          </div>}
    </Sec>
  )
}

/* ─────────────────────────────────────────────── organizations */
export function OrgsWidget({ orgs }: { orgs: any[] }) {
  return (
    <Sec mark={MARKS.orgs} title="Your organizations"
         note="Everywhere you can go. What you cannot open is absent, not greyed out."
         to="/admin/organizations" tip="Manage organizations">
      {orgs.length === 0
        ? <p className="empty">Either none exist, or none have been granted to you.</p>
        : <div className="hxgrid">
            {orgs.map((e) => (
              <Link className="hxcard" key={e.id} href={`/admin/organizations/${e.id}` as any}>
                <b className="hxcard__t">{e.name}</b>
                <Art name={e.name} mark={e.mark} logo={e.logo} />
                <span className="hxrows">
                  <span className="hxrow"><span>Child organizations</span><em className="tnum">{e.kids}</em></span>
                  <span className="hxrow"><span>Locations</span><em className="tnum">{e.locs}</em></span>
                </span>
              </Link>
            ))}
          </div>}
    </Sec>
  )
}

/* ─────────────────────────────────────────────── contacts */
export function ContWidget({ people }: { people: any[] }) {
  return (
    <Sec mark={MARKS.cont} title="Contacts"
         note="People you have hearted, with a number and an email on the card."
         to="/people" tip="Everyone">
      {people.length === 0
        ? <p className="empty">Nobody hearted yet. The heart on a person&rsquo;s page puts them here.</p>
        : <div className="hxgrid">
            {people.map((p) => (
              <article className="hxcard hxcard--face" key={p.id}>
                <Art name={p.name} photo={p.photo} />
                <Link className="hxcard__t" href={`/people/${p.id}` as any}>{p.name}</Link>
                {(p.role || p.org) && (
                  <span className="hxcard__s">{[p.role, p.org].filter(Boolean).join(' · ')}</span>
                )}
                <span className="hxcard__f">
                  {p.phone && <a className="btn" href={`tel:${p.phone}`}>Call</a>}
                  {p.email && <a className="btn" href={`mailto:${p.email}`}>Email</a>}
                </span>
              </article>
            ))}
          </div>}
    </Sec>
  )
}

/* ─────────────────────────────────────────────── my team */
export function TeamWidget({ people }: { people: any[] }) {
  return (
    <Sec mark={MARKS.team} title="My team" note="Everyone who reports to you."
         to="/people" tip="Everyone">
      {people.length === 0
        ? <p className="empty">Nobody reports to you yet.</p>
        : <div className="hxgrid">
            {people.map((p) => (
              <Link className="hxcard" key={p.id} href={`/people/${p.id}` as any}>
                <b className="hxcard__t">{p.name}</b>
                <Art name={p.name} photo={p.photo} />
                {p.role && <span className="hxcard__s">{p.role}</span>}
              </Link>
            ))}
          </div>}
    </Sec>
  )
}
