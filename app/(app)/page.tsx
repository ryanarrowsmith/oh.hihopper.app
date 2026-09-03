import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { loadCards } from '@/lib/cards'
import { loadWidgets } from '@/lib/home'
import { attentionOf } from '@/lib/freshness'
import type { WidgetKey } from '@/lib/widgets'
import Dolly from '@/components/Dolly'
import HomeBoard from '@/components/HomeBoard'
import HeroFacts from '@/components/HeroFacts'
import NeedsLine, { type Needy, type Org } from '@/components/NeedsLine'
import {
  FavsWidget, RepsWidget, LocsWidget, OrgsWidget, ContWidget, TeamWidget,
} from '@/components/HomeWidgets'

export const dynamic = 'force-dynamic'

/**
 * Home.
 *
 * Full-width sections one after another, no sidebar: a rail is a place to put
 * what would not fit, and everything that had been on this page's rail belonged
 * either in a section or nowhere.
 *
 * The hero is the only fixed thing -- greeting, the person's face and name under
 * one swipe, the time and the day, and one sentence saying what wants them.
 * Everything below is their own arrangement: HomeBoard owns the order, this
 * file owns what is inside each section, and the two never learn about each
 * other beyond a key.
 */
export default async function Home() {
  const session = (await currentSession())!
  const db = supabaseServer()

  const placed = await loadWidgets()
  const on = new Set(placed.filter((p) => p.on).map((p) => p.key))
  const want = (k: WidgetKey) => on.has(k)

  const [
    cards, { data: ents }, { data: locations }, { data: hearts },
    { data: people }, { data: me },
  ] = await Promise.all([
    // Always: the sentence in the hero counts these, and Favorites and
    // Dashboards draw their charts from the same read rather than a second one.
    loadCards(),
    db.schema('hopper').from('entity').select('id, name, mark, parent_id, logo_url').order('sort_order'),
    db.schema('hopper').from('location')
      .select('id, entity_id, name, address_line1, address_line2, city, region, postal_code, phone, time_zone, is_head_office, latitude, longitude'),
    want('favs') || want('cont')
      ? db.schema('hopper').from('my_favorites').select('object, object_id, created_at')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    want('favs') || want('cont') || want('team')
      ? db.schema('hopper').from('directory')
          .select('id, full_name, photo_url, role_name, entity_name, department_name, manager_id, email, phone')
      : Promise.resolve({ data: [] as any[] }),
    db.schema('hopper').from('person').select('photo_url, location_id')
      .eq('id', session.personId ?? '').maybeSingle(),
  ])

  const all = ents ?? []
  const entName = new Map(all.map((e: any) => [e.id, e.name]))
  const dir = people ?? []
  const heart = hearts ?? []
  const places = locations ?? []
  const byReport = new Map(cards.map((c) => [c.id, c]))

  const address = (l: any) => [l.address_line1, l.address_line2,
    [l.city, l.region].filter(Boolean).join(', '), l.postal_code].filter(Boolean).join('\n')

  /* ── what wants a person ────────────────────────────────────────── */

  const needy: Needy[] = cards
    .map((c) => ({ c, k: attentionOf(c) }))
    .filter((x): x is { c: typeof cards[0]; k: 'late' | 'bad' | 'never' } => x.k !== null)
    .map(({ c, k }) => ({
      id: c.id, name: c.name,
      where: [c.entity, c.department].filter(Boolean).join(' · '),
      why: k === 'bad' ? 'Look failed'
        : k === 'never' ? 'Never read'
        : c.lateBy ? `${c.lateBy} day${c.lateBy === 1 ? '' : 's'} late` : 'Behind',
      kind: k,
      href: `/reporting/${c.id}`,
    }))

  // Counted by organization NAME back to an id, because a card carries the name
  // it was drawn with. Anything whose organization has gone is left out of the
  // second count rather than counted as a blank one.
  const orgCount = new Map<string, number>()
  for (const c of cards) if (attentionOf(c)) orgCount.set(c.entity, (orgCount.get(c.entity) ?? 0) + 1)
  const orgs: Org[] = [...orgCount.entries()]
    .map(([name, n]) => {
      const e = all.find((x: any) => x.name === name)
      return e ? { id: e.id, name, n } : null
    })
    .filter(Boolean) as Org[]

  /* ── the sections ───────────────────────────────────────────────── */

  const favs = heart.map((h: any) => {
    if (h.object === 'report') {
      const c = byReport.get(h.object_id)
      return c ? { kind: 'report', id: c.id, label: c.name, sub: c.entity,
        href: `/reporting/${c.id}`, chart: { type: c.chartType, series: c.series.slice(0, 1) } } : null
    }
    if (h.object === 'entity') {
      const e = all.find((x: any) => x.id === h.object_id)
      return e ? { kind: 'entity', id: e.id, label: e.name,
        sub: e.parent_id ? entName.get(e.parent_id) ?? null : null,
        href: `/admin/organizations/${e.id}`, mark: e.mark, logo: e.logo_url } : null
    }
    if (h.object === 'person') {
      const p = dir.find((x: any) => x.id === h.object_id)
      return p ? { kind: 'person', id: p.id, label: p.full_name,
        sub: p.role_name ?? p.entity_name ?? null, href: `/people/${p.id}`,
        photo: p.photo_url ? `/api/photo/${p.id}` : null } : null
    }
    if (h.object === 'location') {
      const l = places.find((x: any) => x.id === h.object_id)
      return l ? { kind: 'location', id: l.id, label: l.name,
        sub: entName.get(l.entity_id) ?? null,
        href: `/admin/organizations/${l.entity_id}`, address: address(l) } : null
    }
    return null
  }).filter(Boolean) as any[]

  const contacts = heart.filter((h: any) => h.object === 'person')
    .map((h: any) => dir.find((p: any) => p.id === h.object_id)).filter(Boolean)
    .map((p: any) => ({ id: p.id, name: p.full_name, role: p.role_name,
      org: p.entity_name ?? p.department_name ?? null,
      photo: p.photo_url ? `/api/photo/${p.id}` : null,
      email: p.email ?? null, phone: p.phone ?? null }))

  const team = dir.filter((p: any) => p.manager_id && p.manager_id === session.personId)
    .map((p: any) => ({ id: p.id, name: p.full_name, role: p.role_name,
      photo: p.photo_url ? `/api/photo/${p.id}` : null }))

  const spots = places.map((l: any) => ({
    id: l.id, name: l.name, entity: entName.get(l.entity_id) ?? null,
    entityId: l.entity_id, address: address(l), phone: l.phone,
    tz: l.time_zone, head: !!l.is_head_office,
  })).filter((l: any) => l.address)

  const orgCards = all.filter((e: any) => !e.parent_id).map((e: any) => ({
    id: e.id, name: e.name, mark: e.mark, logo: e.logo_url,
    kids: all.filter((k: any) => k.parent_id === e.id).length,
    locs: places.filter((l: any) => l.entity_id === e.id).length,
  }))

  /**
   * The numbers, in the order somebody would read them: what you said matters,
   * then what has gone wrong, then everything else.
   */
  const reports = cards
    .map((c) => {
      const att = attentionOf(c)
      return {
        id: c.id, name: c.name, category: c.category, value: c.value,
        where: [c.entity, c.department].filter(Boolean).join(' · '),
        favorite: c.favorite, att,
        why: att === 'bad' ? 'Look failed'
          : att === 'never' ? 'Never read'
          : c.lateBy ? `${c.lateBy} day${c.lateBy === 1 ? '' : 's'} late` : 'Behind',
        since: c.freshness === 'snapshot' ? 'Snapshot'
          : att === 'never' ? null
          : c.valueOn ? `Since ${new Date(`${c.valueOn}T00:00:00`)
              .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null,
        chart: { type: c.chartType, series: c.series.slice(0, 1) },
      }
    })
    .sort((a, b) =>
      Number(b.favorite) - Number(a.favorite)
      || Number(!!b.att) - Number(!!a.att)
      || a.name.localeCompare(b.name))

  /* ── the hero ───────────────────────────────────────────────────── */

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = session.displayName.split(' ')[0]
  const photo = me?.photo_url && session.personId ? `/api/photo/${session.personId}` : null

  // The clock and the weather belong to where the PERSON is: their own office
  // if they have one, and the head office otherwise. A home page that told an
  // Oklahoma dispatcher the time in whichever office sorted first would be
  // worse than one with no clock.
  const mine = places.find((l: any) => l.id === me?.location_id)
  const anchor = mine ?? places.find((l: any) => l.is_head_office) ?? places[0] ?? null

  const hero = (
    <div className="hxhero">
      <h1>
        {greeting},{' '}
        {/* The face and the name are one thing, so one swipe runs behind both
            -- which is why that marker has to clear a round photo and not just
            a line of type. Only the name is marked: a swipe under the greeting
            as well made the sentence all emphasis and therefore none. */}
        <span className="hl hlwho">
          {photo ? <img className="hxface" src={photo} alt="" /> : null}
          {first}
        </span><span className="pn">.</span>
      </h1>
      <HeroFacts tz={anchor?.time_zone ?? null}
                 lat={anchor?.latitude ?? null} lon={anchor?.longitude ?? null} />
      <NeedsLine items={needy} orgs={orgs} />
    </div>
  )

  const bodies: Partial<Record<WidgetKey, React.ReactNode>> = {
    favs: want('favs') ? <FavsWidget items={favs} /> : null,
    reps: want('reps') ? <RepsWidget reports={reports} /> : null,
    locs: want('locs') ? <LocsWidget places={spots} /> : null,
    orgs: want('orgs') ? <OrgsWidget orgs={orgCards} /> : null,
    cont: want('cont') ? <ContWidget people={contacts} /> : null,
    team: want('team') ? <TeamWidget people={team} /> : null,
  }

  const counts: Partial<Record<WidgetKey, number>> = {
    favs: favs.length, reps: reports.length, locs: spots.length,
    orgs: orgCards.length, cont: contacts.length, team: team.length,
  }

  return (
    <div className="hx">
      <HomeBoard placed={placed} bodies={bodies} counts={counts}
                 dolly={<Dolly />} hero={hero} />
    </div>
  )
}
