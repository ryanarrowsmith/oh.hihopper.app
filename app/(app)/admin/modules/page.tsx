import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import ModuleToggle from '@/components/ModuleToggle'
import { MODULES, CORE_MODULES } from '@/lib/access'

export const dynamic = 'force-dynamic'

const WORD: Record<string, string> = {
  home: 'Home', organizations: 'Organizations', people: 'People', calendar: 'Calendar',
  wiki: 'Wiki', news: 'News', activity_log: 'Activity', support: 'Support',
  profile: 'Profile', favorites: 'Favorites',
}
const BLURB: Record<string, string> = {
  reporting: 'Sheets, charts and the dashboards built on them',
  projects: 'Projects, milestones and tasks',
  staffing: 'Rotas and who is on',
  meetings: 'Agendas and what was decided',
}

/**
 * Modules, on one model.
 *
 * There were two write paths for this setting: a checkbox matrix with a Save
 * button here, and instant confirmed toggles on each organization's own page.
 * Two interaction models and two control styles for one switch, which meant the
 * answer to "is Reporting on for the yard?" depended on which screen you asked.
 *
 * The per-organization toggle wins, because it is the one that asks before it
 * acts -- a module going live for everybody is not a thing to discover after
 * pressing Save on a page holding four other unsaved changes.
 */
export default async function Modules() {
  const session = await currentSession()
  if (!session) redirect('/no-access')

  const db = supabaseServer()
  const [{ data: entities }, { data: rows }] = await Promise.all([
    db.schema('hopper').from('entity').select('id, name, mark, parent_id').order('sort_order'),
    db.schema('hopper').from('entity_module').select('entity_id, module_key, enabled'),
  ])

  const orgs = (entities ?? []) as any[]
  const on = (ent: string, key: string) =>
    (rows ?? []).some((r: any) => r.entity_id === ent && r.module_key === key && r.enabled)
  /* Entitlement -- what the account may have AT ALL -- is the platform's, and
     internal.hopper_account_modules() is where it lives. It is not exposed to
     PostgREST and should not be: a self-scoped wrapper is the right shape and
     is not built yet. Until it is, every module is offered and the write is
     what refuses, which is how this screen already behaved. The "Not in your
     plan" state below is ready for it. */
  const paidFor = (_key: string) => true

  return (
    <>
      <div className="hi"><div className="hi__t">
        <h1>Modules</h1>
        <p className="scopeline"><span>
          Which parts of Hopper each organization runs, within what you pay for. Switching one
          off never deletes anything — turn it back on and it is where you left it.
        </span></p>
      </div></div>

      <section className="sec" style={{ marginTop: 20 }}>
        <div className="sec__h"><div className="sec__t">
          <h2>Always on</h2>
          <p>The parts every organization has. There is nothing to decide here.</p>
        </div></div>
        <div className="wtags" style={{ marginTop: 12 }}>
          {CORE_MODULES.map((m) => <span className="wtag" key={m}>{WORD[m] ?? m}</span>)}
        </div>
      </section>

      <section className="sec">
        <div className="sec__h"><div className="sec__t">
          <h2>What each organization runs</h2>
          <p>Switches save as you press them, and ask first. No Save button, because a page
            holding four unsaved switches is a page lying about what is on.</p>
        </div></div>

        {orgs.length === 0 ? <p className="empty">No organizations yet.</p> : (
          <div className="rst">
            <div className="modr modr--h" style={{ '--cols': orgs.length } as any}>
              <span>Module</span>
              {orgs.map((e: any) => (
                /* The mark is an abbreviation, and an abbreviation nobody can
                   expand is a puzzle. The full name is on hover, on keyboard
                   focus, and on the accessible name -- and printed outright on
                   a phone, where the header is gone and each switch carries the
                   organization's name itself. */
                <span key={e.id} className="modr__o" data-tip={e.name}
                      title={e.name} aria-label={e.name}>
                  {e.mark ?? e.name.slice(0, 3).toUpperCase()}
                </span>
              ))}
            </div>
            {MODULES.map((m) => (
              <div className="modr" key={m.key} style={{ '--cols': orgs.length } as any}>
                <span className="modr__n">{m.label}<small>{BLURB[m.key] ?? ''}</small></span>
                {orgs.map((e: any) => (
                  <span className="modr__c" key={e.id} data-org={e.name}>
                    {paidFor(m.key)
                      ? <ModuleToggle entityId={e.id} moduleKey={m.key} label={m.label}
                                      orgName={e.name} enabled={on(e.id, m.key)} />
                      /* Not paid for is not the same as switched off, and a
                         greyed toggle that looks switched off is a support
                         call. */
                      : <span className="modr__no">Not in your plan</span>}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
