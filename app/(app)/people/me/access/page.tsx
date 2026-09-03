import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/tenant'
import { supabaseServer } from '@/lib/supabase/server'
import { LEVEL_MEANS, LEVEL_WORD, LEVELLED_MODULES, type Level } from '@/lib/access'
import { LEVEL_MARK } from '@/components/LevelPick'

export const dynamic = 'force-dynamic'

/**
 * What you may do.
 *
 * "Why can't I see that report" is a question people ask about themselves, and
 * Admin -> Permissions answers it about somebody else and only opens for an
 * administrator -- exactly the wrong shape, because the person who needs the
 * answer is the person who cannot reach the screen.
 *
 * Every row comes from hopper.my_levels() and hopper.my_module_levels(), which
 * call the same predicates the policies call. This page therefore cannot claim
 * access the database would refuse, which is the one property an access screen
 * has to have.
 *
 * A table rather than cards: the question is "what do I have, and where does it
 * come from?", and that is four facts per row read down a column.
 */
const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)
const VIA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4v9a4 4 0 0 0 4 4h10" /><path d="M15 13l4 4-4 4" />
  </svg>
)

function Head() {
  return (
    <div className="mayr mayr__h">
      <span /><span>What</span><span>What that lets you do</span><span>Where it comes from</span>
    </div>
  )
}

function Row({ level, name, sub, from }: {
  level: Level; name: string; sub?: string | null; from?: string | null
}) {
  return (
    <div className="mayr">
      <span className={`mayr__k mayr__k--${level}`} data-tip={LEVEL_WORD[level]}
            role="img" aria-label={LEVEL_WORD[level]}>
        {I(LEVEL_MARK[level])}<b>{LEVEL_WORD[level]}</b>
      </span>
      <span className="mayr__n">{name}{sub && <small>{sub}</small>}</span>
      <span className="mayr__d">{LEVEL_MEANS[level]}</span>
      <span className="mayr__f">
        {from ? <>{VIA}via <b>{from}</b></> : <b>Granted to you</b>}
      </span>
    </div>
  )
}

export default async function MyAccess() {
  const session = await currentSession()
  if (!session) redirect('/no-access')
  const db = supabaseServer()
  const acct = session.accountId

  const [{ data: levels }, { data: mods }] = await Promise.all([
    db.schema('hopper').rpc('my_levels', { acct }),
    db.schema('hopper').rpc('my_module_levels', { acct }),
  ])

  const orgs = (levels ?? []).filter((r: any) => r.kind === 'entity')
  const deps = (levels ?? []).filter((r: any) => r.kind === 'department')

  // A module level is held per organization, but it is nearly always the same
  // everywhere -- so it is collapsed into one row unless it genuinely differs.
  const byModule = new Map<string, any[]>()
  for (const r of mods ?? []) byModule.set(r.module, [...(byModule.get(r.module) ?? []), r])

  const nothing = orgs.length === 0 && deps.length === 0 && (mods ?? []).length === 0

  return (
    <>
      <div className="hi">
        <div className="hi__t">
          <h1>What you may do</h1>
          <p className="scopeline"><span>
            Everything Hopper will let you do, and where. If something you need is missing,
            this is the page to send to whoever administers your organization.
          </span></p>
        </div>
      </div>

      {nothing ? (
        <p className="empty" style={{ marginTop: 18 }}>
          Nothing has been granted to you yet. Whoever administers your organization can
          change that from Admin → Permissions.
        </p>
      ) : (
        <>
          {orgs.length > 0 && (
            <section className="sec" style={{ marginTop: 20 }}>
              <div className="sec__h"><div className="sec__t">
                <h2>Organizations</h2>
                <p>{orgs.length === 1 ? 'One.' : `${orgs.length}.`} A level on a parent covers
                  everything beneath it.</p>
              </div></div>
              <div className="maytbl">
                <Head />
                {orgs.map((r: any) => (
                  <Row key={r.id} level={r.level} name={r.name} from={r.via_name} />
                ))}
              </div>
            </section>
          )}

          {deps.length > 0 && (
            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Departments</h2>
                <p>Where you have more than the organization already gives you.</p>
              </div></div>
              <div className="maytbl">
                <Head />
                {deps.map((r: any) => (
                  <Row key={r.id} level={r.level} name={r.name} sub={r.sub} from={r.via_name} />
                ))}
              </div>
            </section>
          )}

          {byModule.size > 0 && (
            <section className="sec">
              <div className="sec__h"><div className="sec__t">
                <h2>Modules</h2>
                <p>What you may do with each part of Hopper, wherever you can already see
                  the business.</p>
              </div></div>
              <div className="maytbl">
                <Head />
                {LEVELLED_MODULES.filter((m) => byModule.has(m.key)).map((m) => {
                  const rows = byModule.get(m.key)!
                  const same = new Set(rows.map((r: any) => r.level))
                  // One row when it is the same everywhere; one row per business
                  // when it is not, because "Edit" that is only true in one yard
                  // is a sentence that gets somebody stuck.
                  return same.size === 1
                    ? <Row key={m.key} level={rows[0].level} name={m.label} sub={m.blurb} />
                    : <>{rows.map((r: any) => (
                        <Row key={`${m.key}-${r.entity_id}`} level={r.level}
                             name={m.label} sub={r.entity_name}
                             from={r.scoped ? null : 'your level everywhere'} />
                      ))}</>
                })}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
