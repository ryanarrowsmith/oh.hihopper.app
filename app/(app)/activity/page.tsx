import { supabaseServer } from '@/lib/supabase/server'
import Avatar from '@/components/Avatar'
import { ActMark, OrgMark } from '@/components/Icons'

export const dynamic = 'force-dynamic'

/**
 * Activity -- what happened, for the person looking and everyone who reports
 * to them. It is not the audit log: the platform keeps that, and this reads
 * it. The difference that matters on screen is that every row here goes
 * somewhere. An entry you cannot open is a note about work rather than a way
 * back to it.
 */
type Row = {
  seq: number
  occurred_at: string
  action: string
  class: string
  subject_type: string
  subject_id: string | null
  summary: string
  actor_name: string | null
  actor_person_id: string | null
  actor_photo: string | null
  by_me: boolean | null
  entity_id: string | null
}

/** Which of the four marks a row wears, from the verb at the end of its action. */
function kindOf(r: Row): 'made' | 'changed' | 'access' | 'gone' {
  if (r.class === 'access') return 'access'
  const verb = r.action.split('.').pop() ?? ''
  if (verb.startsWith('creat') || verb.startsWith('add')) return 'made'
  if (verb.startsWith('delet') || verb.startsWith('remov')) return 'gone'
  return 'changed'
}

/**
 * Where a row goes. One table, so a subject type that has nowhere to go yet
 * says so in one place rather than being fudged at each call site.
 * `person` lands on Users until the People directory ships.
 */
function hrefFor(r: Row): string | null {
  const id = r.subject_id
  if (!id) return null
  switch (r.subject_type) {
    case 'organization': return `/admin/organizations/${id}`
    case 'location':     return r.entity_id ? `/admin/organizations/${r.entity_id}/locations/${id}` : null
    case 'department':
    case 'role':
    case 'module':       return r.entity_id ? `/admin/organizations/${r.entity_id}` : null
    case 'person':
    case 'person_profile': return '/admin/users'
    case 'grant':        return '/admin/permissions'
    default:             return null
  }
}

const DAY = new Intl.DateTimeFormat('en-US',
  { weekday: 'long', day: 'numeric', month: 'long' })
const CLOCK = new Intl.DateTimeFormat('en-US',
  { hour: 'numeric', minute: '2-digit' })

function dayKey(d: Date) { return d.toISOString().slice(0, 10) }

/** "Nothing on Tuesday" beats a hole -- you can tell quiet from broken. */
function gapsBetween(newer: string, older: string) {
  const out: string[] = []
  const a = new Date(newer + 'T12:00:00Z')
  const b = new Date(older + 'T12:00:00Z')
  for (let t = a.getTime() - 86400000; t > b.getTime(); t -= 86400000) {
    out.push(new Date(t).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }))
  }
  return out
}

export default async function Activity({
  searchParams,
}: { searchParams: { whose?: string; what?: string } }) {
  const db = supabaseServer()
  const mine = searchParams.whose === 'me'
  const accessOnly = searchParams.what === 'access'

  let q = db.schema('hopper').from('activity').select('*')
    .order('seq', { ascending: false }).limit(200)
  if (mine) q = q.eq('by_me', true)
  if (accessOnly) q = q.eq('class', 'access')

  const [{ data: rows }, { data: orgs }] = await Promise.all([
    q,
    db.schema('hopper').from('entity').select('id, name'),
  ])

  const nameOf = new Map((orgs ?? []).map((e: any) => [e.id, e.name]))
  const list = (rows ?? []) as Row[]

  // Day, then organization inside it. Both in the order they came back, which
  // is newest first, so nothing has to be sorted twice.
  const days: { key: string; when: Date; bands: { entity_id: string | null; rows: Row[] }[] }[] = []
  for (const r of list) {
    const when = new Date(r.occurred_at)
    const key = dayKey(when)
    let day = days.find((d) => d.key === key)
    if (!day) { day = { key, when, bands: [] }; days.push(day) }
    let band = day.bands.find((b) => b.entity_id === r.entity_id)
    if (!band) { band = { entity_id: r.entity_id, rows: [] }; day.bands.push(band) }
    band.rows.push(r)
  }

  const today = dayKey(new Date())
  const swap = (k: 'whose' | 'what', v: string | null) => {
    const p = new URLSearchParams()
    if (k === 'whose' ? v : mine) p.set('whose', k === 'whose' ? v! : 'me')
    if (k === 'what' ? v : accessOnly) p.set('what', k === 'what' ? v! : 'access')
    const s = p.toString()
    return `/activity${s ? '?' + s : ''}`
  }

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Activity</h1>
        <p className="scopeline">
          <span>What has happened, newest first. Yours, and everyone who reports to you.</span>
        </p>
      </div></div>

      <div className="viewbar">
        <span className="viewbar__l">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span>
        <div className="seg" role="group" aria-label="Whose activity">
          <a className="seg__b" aria-pressed={!mine} href={swap('whose', null)}>My team</a>
          <a className="seg__b" aria-pressed={mine} href={swap('whose', 'me')}>Just me</a>
        </div>
        <div className="seg" role="group" aria-label="What kind">
          <a className="seg__b" aria-pressed={!accessOnly} href={swap('what', null)}>Everything</a>
          <a className="seg__b" aria-pressed={accessOnly} href={swap('what', 'access')}>Access only</a>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="empty">Nothing has happened here yet.</p>
      ) : days.map((day, i) => {
        const faces = Array.from(new Map(
          day.bands.flatMap((b) => b.rows)
            .filter((r) => r.actor_name)
            .map((r) => [r.actor_name!, r])).values()).slice(0, 8)
        const gaps = i > 0 ? gapsBetween(days[i - 1].key, day.key) : []
        return (
          <div key={day.key}>
            {gaps.length > 0 && (
              <div className="gapline">
                {gaps.length === 1 ? `Nothing on ${gaps[0]}` : `Nothing for ${gaps.length} days`}
              </div>
            )}

            <div className="day">
              <span className="day__t">
                {day.key === today ? 'Today · ' : ''}{DAY.format(day.when)}
              </span>
              <span className="day__r" />
              <span className="day__w">
                <span>{faces.length} {faces.length === 1 ? 'person' : 'people'}</span>
                <span className="faces">
                  {faces.map((r) => (
                    <Avatar key={r.seq} name={r.actor_name ?? '?'} src={r.actor_photo} size={24} />
                  ))}
                </span>
              </span>
            </div>

            {day.bands.map((band) => (
              <div className="band" key={String(band.entity_id)}>
                {band.entity_id && nameOf.get(band.entity_id) && (
                  <a className="band__t" href={`/admin/organizations/${band.entity_id}`}>
                    <OrgMark />{nameOf.get(band.entity_id)}
                  </a>
                )}
                <div className="acts">
                  {band.rows.map((r) => {
                    const href = hrefFor(r)
                    const kind = kindOf(r)
                    const inner = (
                      <>
                        <span className={`act__i act__i--${kind}`}><ActMark kind={kind} /></span>
                        <span className="act__b">
                          <span className="act__t">{r.summary}</span>
                          <span className="act__w">
                            <Avatar name={r.actor_name ?? 'system'} src={r.actor_photo} size={19} />
                            <b>{r.actor_name ?? 'Hopper'}</b>
                            <span>{r.action.replace(/[._]/g, ' ')}</span>
                          </span>
                        </span>
                        <span className="act__when">{CLOCK.format(new Date(r.occurred_at))}</span>
                      </>
                    )
                    // A row with nowhere to go is rendered flat rather than as a
                    // link that 404s. Every subject type that has a page links.
                    return href
                      ? <a className="act" href={href} key={r.seq}>{inner}</a>
                      : <div className="act act--flat" key={r.seq}>{inner}</div>
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
