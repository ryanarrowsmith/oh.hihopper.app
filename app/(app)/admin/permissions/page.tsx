import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import ActionForm from '@/components/ActionForm'
import LevelPick from '@/components/LevelPick'
import ModuleLevels from '@/components/ModuleLevels'
import { savePermissions } from '@/app/actions/admin'
import {
  FLAT_MAX, FLAT_OBJECTS, LEVELLED_MODULES, LEVEL_WORD, asLevel, rank, type Level,
} from '@/lib/access'
import { initialsOf } from '@/lib/wiki-check'

export const dynamic = 'force-dynamic'

const LEVEL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4v9a4 4 0 0 0 4 4h10" /><path d="M15 13l4 4-4 4" />
  </svg>
)
const BULB = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 18h5" /><path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
  </svg>
)

export default async function Permissions({ searchParams }: {
  searchParams: { person?: string }
}) {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  const db = supabaseServer()

  const [{ data: people }, { data: entities }, { data: depts }] = await Promise.all([
    db.schema('hopper').from('person')
      .select('id, full_name, role_title, active').eq('active', true).order('full_name'),
    db.schema('hopper').from('entity').select('id, name, mark, parent_id').order('sort_order'),
    db.schema('hopper').from('department').select('id, name, entity_id').order('name'),
  ])
  const who = searchParams.person ?? people?.[0]?.id
  const person = (people ?? []).find((p: any) => p.id === who)
  const orgs = (entities ?? []) as any[]
  const orgName = new Map(orgs.map((e: any) => [e.id, e.name]))

  const { data: grants } = await db.schema('hopper').from('access_grant')
    .select('object, scope_id, may_view, may_edit, may_admin').eq('person_id', who ?? '')

  const at = (object: string, scope: string | null = null): Level | null =>
    asLevel((grants ?? []).find((g: any) =>
      g.object === object && (g.scope_id ?? null) === scope))

  /* What an organization inherits from the line above it -- shown, never
     silently applied, because a hole in the middle of a branch is a rule
     nobody can hold in their head. */
  const inheritedFor = (e: any): { level: Level; from: string } | null => {
    let cur = orgs.find((x) => x.id === e.parent_id)
    let best: { level: Level; from: string } | null = null
    while (cur) {
      const l = at('entity', cur.id)
      if (l && rank(l) > rank(best?.level ?? null)) best = { level: l, from: cur.name }
      cur = orgs.find((x) => x.id === cur!.parent_id)
    }
    return best
  }

  const held = (grants ?? []).map((g: any) => asLevel(g)).filter(Boolean) as Level[]
  const count = (l: Level) => held.filter((x) => x === l).length

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>Permissions</h1>
          <p className="scopeline"><span>
            Held per person. Editing one person changes that person and nobody else —
            which is why what somebody holds is readable in one place.
          </span></p>
        </div>
      </div>

      {!person ? <p className="empty">Nobody to set permissions for yet.</p> : (
        <>
          <div className="pwho2">
            <span className="ava ava--init">{initialsOf(person.full_name)}</span>
            <span>
              <span className="pwho2__n">{person.full_name}</span>
              <span className="pwho2__r">{person.role_title ?? 'No role on file'}</span>
            </span>
            <span className="pwho2__go">
              <span className="plevels">
                {(['admin', 'edit', 'read'] as Level[]).filter((l) => count(l)).map((l) => (
                  <span className={`plev plev--${l}`} key={l}>
                    {LEVEL_WORD[l]} · {count(l)}
                  </span>
                ))}
                {held.length === 0 && <span className="plev">No access yet</span>}
              </span>
            </span>
          </div>

          <div className="grantpick">
            {(people ?? []).map((p: any) => (
              <Link key={p.id} className={`gpick${p.id === who ? ' is-on' : ''}`}
                    href={`/admin/permissions?person=${p.id}` as any}>
                {p.full_name}
              </Link>
            ))}
          </div>

          {/* Said once, at the top, because it is the one thing about this
              screen that is not obvious from the words on it. */}
          <div className="adminsay">{BULB}<div>
            <b>Admin does not delete.</b> Nothing in Hopper is destroyed — a location, a
            department, a report or a project is made <b>inactive</b>, keeps its history, and
            can be turned back on where you left it. Admin is the power to take something out
            of use, and to hand the same access to somebody else. That is why it is a level of
            its own rather than a tick beside Edit.
          </div></div>

          <ActionForm action={savePermissions} label="Save" busy="Saving…">
            <input type="hidden" name="person_id" value={who} />

            {/* Everything that is not a place. These are rendered here because
                saving replaces this person's grants wholesale -- a screen that
                does not show a permission is a screen that silently removes
                it, which is how somebody loses the right to write documents by
                being given the right to read a yard. */}
            <section className="sec" style={{ marginTop: 22 }}>
              <div className="sec__h"><div className="sec__t">
                <h2>Across Hopper</h2>
                <p>The things that are not places. Each stops at the highest level that
                  means something for it.</p>
              </div></div>
              <div className="grants">
                {FLAT_OBJECTS.map((o) => (
                  <div className="grow" key={o.key}>
                    <span className="grow__n"><span>{o.label}<small>{o.blurb}</small></span></span>
                    <span className="grow__x">
                      <LevelPick name={`l:${o.key}:-`} start={at(o.key, null)}
                                 max={FLAT_MAX[o.key] ?? 'edit'} />
                    </span>
                    <span>
                      {o.ownerOnly && <span className="lvlvia"><b>Owner only</b></span>}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Organizations</h2>
                <p>A level here covers everything beneath it — that is what choosing a holding
                  company means.</p>
              </div></div>
              <div className="grants">
                {orgs.map((e: any) => {
                  const from = inheritedFor(e)
                  const own = at('entity', e.id)
                  return (
                    <div className={`grow${e.parent_id ? ' grow--kid' : ''}`} key={e.id}>
                      <span className="grow__n">
                        {e.mark && <span className="plate">{e.mark}</span>}
                        <span>{e.name}
                          {!e.parent_id && orgs.some((k: any) => k.parent_id === e.id) &&
                            <small>The parent — a level here covers the whole branch</small>}
                        </span>
                      </span>
                      <span className="grow__x">
                        {/* An inherited level is shown at its real strength and
                            cannot be lowered here; granting MORE on a child is
                            what this control is for. */}
                        <LevelPick name={`l:entity:${e.id}`} start={own}
                                   inherited={!own && !!from} />
                      </span>
                      <span>
                        {!own && from && (
                          <span className="lvlvia">{LEVEL}via <b>{from.from}</b></span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Departments</h2>
                <p>Only where somebody needs more than their organization already gives them.
                  A department cannot be read by anybody who cannot read the business it is in.</p>
              </div></div>
              {(depts ?? []).length === 0
                ? <p className="empty">No departments yet.</p>
                : <div className="grants">
                    {(depts ?? []).map((d: any) => {
                      const own = at('department', d.id)
                      const org = at('entity', d.entity_id)
                        ?? inheritedFor(orgs.find((e: any) => e.id === d.entity_id) ?? {})?.level
                        ?? null
                      return (
                        <div className="grow" key={d.id}>
                          <span className="grow__n"><span>{d.name}
                            <small>{orgName.get(d.entity_id) ?? ''}</small></span></span>
                          <span className="grow__x">
                            <LevelPick name={`l:department:${d.id}`} start={own}
                                       inherited={!own && !!org} />
                          </span>
                          <span>
                            {!own && org && (
                              <span className="lvlvia">{LEVEL}via{' '}
                                <b>{orgName.get(d.entity_id)}</b></span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>}
            </section>

            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Modules</h2>
                <p>One level covers every organization they can see. Open a module to give one
                  business more — or less — than the rest.</p>
              </div></div>
              <div className="grants">
                {LEVELLED_MODULES.map((m) => (
                  <ModuleLevels key={m.key} mod={m as any} orgs={orgs}
                                everywhere={at(m.key, null)}
                                perOrg={Object.fromEntries(
                                  orgs.map((e: any) => [e.id, at(m.key, e.id)]))} />
                ))}
              </div>
            </section>
          </ActionForm>
        </>
      )}
    </>
  )
}
