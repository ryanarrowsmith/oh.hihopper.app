import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { MODULES } from '@/lib/access'

export const dynamic = 'force-dynamic'

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const TREE  = '<path d="M12 3v6"/><rect x="9" y="9" width="6" height="4" rx="1"/><path d="M6 21v-4h12v4"/><path d="M12 13v4"/>'
const USERS = '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 5.2a3.4 3.4 0 0 1 0 5.6"/><path d="M18.4 14.6A5.6 5.6 0 0 1 21.5 20"/>'
const KEY   = '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>'
const BOX   = '<path d="M12 2.5 21 7v10l-9 4.5L3 17V7z"/><path d="m3 7 9 4.5L21 7"/><path d="M12 11.5V21"/>'
const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>'
const WARN  = '<path d="M12 4.5 21 20H3z"/><path d="M12 10v4"/><path d="M12 17v.1"/>'

function Card({ mark, title, blurb, href, big, word, flag }: {
  mark: string; title: string; blurb: string; href: string
  big: string | number; word: string; flag?: string | null
}) {
  return (
    <Link className="adc" href={href as any}>
      <span className="adc__t">{I(mark)}{title}</span>
      <span className="adc__b">{blurb}</span>
      <span className="adc__n">
        <span className="adc__big">{big}</span>
        <span className="adc__w">{word}</span>
        {/* The one thing in this area that wants a person. An area with nothing
            wrong says nothing at all, rather than drawing an empty green tick
            that has to be read before it can be dismissed. */}
        {flag && <span className="adc__f">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round"
               dangerouslySetInnerHTML={{ __html: WARN }} />{flag}
        </span>}
      </span>
    </Link>
  )
}

/**
 * Admin.
 *
 * This was five identical cards saying "Open" -- a menu, not a screen, and its
 * subtitle still said "nothing set in two of them" from before the screens were
 * wired. What somebody opening Admin actually wants to know is which of the
 * five wants them today, so each card carries its own count and, when there is
 * one, the thing that is wrong.
 */
export default async function Admin() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  const db = supabaseServer()

  const [{ data: ents }, { data: depts }, { data: locs }, { data: people },
         { data: grants }, { data: mods }, { data: audit }] = await Promise.all([
    db.schema('hopper').from('entity').select('id, status'),
    db.schema('hopper').from('department').select('id'),
    db.schema('hopper').from('location').select('id, address_line1, latitude'),
    db.schema('hopper').from('person').select('id, active, email, profile_id'),
    db.schema('hopper').from('access_grant').select('person_id, may_admin'),
    db.schema('hopper').from('entity_module').select('module_key, enabled'),
    db.schema('hopper').from('audit_entry').select('id')
      .gte('at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])

  const orgs = ents ?? []
  const places = locs ?? []
  const noPin = places.filter((l: any) => l.latitude == null).length
  const roster = (people ?? []).filter((p: any) => p.active)
  const canSignIn = roster.filter((p: any) => p.profile_id).length
  const never = roster.filter((p: any) => !p.profile_id && !p.email).length
  const withAccess = new Set((grants ?? []).map((g: any) => g.person_id)).size
  const admins = new Set((grants ?? []).filter((g: any) => g.may_admin)
    .map((g: any) => g.person_id)).size
  const liveModules = new Set((mods ?? []).filter((m: any) => m.enabled)
    .map((m: any) => m.module_key))
  const dark = MODULES.filter((m) => !liveModules.has(m.key))

  const n = (x: number, one: string, many?: string) =>
    `${one}${x === 1 ? '' : many ?? 's'}`

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Admin</h1>
        <p className="scopeline"><span>
          The portfolio, the people in it, and what each may reach.
        </span></p>
      </div></div>

      <div className="adg">
        <Card mark={TREE} title="Organizations" href="/admin/organizations"
              blurb="The tree, its departments and its offices."
              big={orgs.length}
              word={`${n(orgs.length, 'organization')} · ${depts?.length ?? 0} ${n(depts?.length ?? 0, 'department')} · ${places.length} ${n(places.length, 'office')}`}
              flag={noPin > 0 ? `${noPin} with no map pin` : null} />

        <Card mark={USERS} title="People" href="/admin/people"
              blurb="Everyone on the roster, whether or not they can sign in."
              big={roster.length}
              word={`on the roster · ${canSignIn} can sign in`}
              flag={never > 0 ? `${never} with no email` : null} />

        <Card mark={KEY} title="Permissions" href="/admin/permissions"
              blurb="What each person may open, and at what level."
              big={withAccess}
              word={`with access${admins ? ` · ${admins} hold Admin` : ''}`}
              flag={withAccess === 0 && roster.length > 1
                ? 'Nobody has been granted anything' : null} />

        <Card mark={BOX} title="Modules" href="/admin/modules"
              blurb="Which parts of Hopper each organization runs."
              big={`${liveModules.size} of ${MODULES.length}`}
              word="modules in use"
              flag={dark.length === 1 ? `${dark[0].label} is off everywhere` : null} />

        <Card mark={CLOCK} title="Activity" href="/activity"
              blurb="Every change, who made it and when."
              big={audit?.length ?? 0} word="entries in the last 30 days" />
      </div>
    </>
  )
}
