import Section from '@/components/Section'

const AREAS = [
  { href: '/admin/organizations', title: 'Organizations',
    blurb: 'The tree, its departments and its office locations.' },
  { href: '/admin/people', title: 'People',
    blurb: 'Who is on the roster, where they sit, and who they answer to.' },
  { href: '/admin/permissions', title: 'Permissions',
    blurb: 'What each person may open. Grants are held per person, not by a group.' },
  { href: '/admin/modules', title: 'Modules',
    blurb: 'Which parts of Hopper each organization runs, within what you pay for.' },
  { href: '/admin/audit', title: 'Audit log',
    blurb: 'Append-only and hash chained. Always last.' },
]

export default function Admin() {
  return (
    <>
      <div className="hi"><h1>Admin</h1>
        <p className="scopeline"><span>The portfolio, the people in it, and what each may reach.</span></p>
      </div>
      <Section title="Where things are set" blurb="Five places, and nothing set in two of them.">
        <div className="cards">
          {AREAS.map((a) => (
            <article className="card" key={a.href}>
              <div className="card__h"><b>{a.title}</b></div>
              <div className="card__rows"><div className="row"><span>{a.blurb}</span></div></div>
              <div className="card__f"><a className="btn" href={a.href}>Open</a></div>
            </article>
          ))}
        </div>
      </Section>
    </>
  )
}
