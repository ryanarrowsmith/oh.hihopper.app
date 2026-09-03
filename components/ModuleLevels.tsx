'use client'
import { useState } from 'react'
import LevelPick from '@/components/LevelPick'
import { LEVEL_WORD, type Level } from '@/lib/access'

type Org = { id: string; name: string; mark: string | null; parent_id: string | null }

const CARET = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
       strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
)
const BULB = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 18h5" /><path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
  </svg>
)

/**
 * One module, with its exceptions folded away.
 *
 * Most of the time a single level covers everywhere, so that is the row. Five
 * organizations times nine modules is forty-five rows of a screen that usually
 * has nine, so the businesses that differ live behind a caret -- and the row
 * says how many there are, because an exception nobody can see is how somebody
 * ends up wondering why one yard cannot run a report.
 */
export default function ModuleLevels({ mod, orgs, everywhere, perOrg }: {
  mod: { key: string; label: string; blurb: string }
  orgs: Org[]
  everywhere: Level | null
  perOrg: Record<string, Level | null>
}) {
  const [open, setOpen] = useState(false)
  const [each, setEach] = useState<Record<string, Level | null>>(perOrg)
  // Which organization was just changed on its own, and therefore what the
  // prompt is about. Null means nothing to say.
  const [narrow, setNarrow] = useState<{ id: string; level: Level | null } | null>(null)
  const [bumped, setBumped] = useState(0)   // forces the pickers to redraw

  const differ = orgs.filter((o) => each[o.id] != null).length

  const applyToAll = () => {
    if (!narrow) return
    const next: Record<string, Level | null> = {}
    for (const o of orgs) next[o.id] = narrow.level
    setEach(next); setNarrow(null); setBumped((b) => b + 1)
  }

  return (
    <>
      <div className="grow">
        <span className="grow__n"><span>{mod.label}<small>{mod.blurb}</small></span></span>
        <span className="grow__x">
          <LevelPick name={`l:${mod.key}:-`} start={everywhere} />
        </span>
        <span>
          {differ === 0 ? (
            <span className="gcount gcount--none">Everywhere</span>
          ) : (
            <button type="button" className={`gcount${open ? ' gcount--open' : ''}`}
                    onClick={() => setOpen(!open)}>
              {CARET}{differ} organization{differ === 1 ? '' : 's'} differ{differ === 1 ? 's' : ''}
            </button>
          )}
        </span>
      </div>

      {/* Said the moment a level lands on one business alone. It never widens
          the grant on its own -- it only makes sure the narrow thing was the
          intended thing, because granting one organization what you meant to
          grant five is invisible until somebody cannot do their job. */}
      {narrow && (
        <div className="scopesay">
          {BULB}
          <span>
            That set <b>{mod.label}</b> to{' '}
            <b>{narrow.level ? LEVEL_WORD[narrow.level] : 'no access'}</b> for{' '}
            <b>{orgs.find((o) => o.id === narrow.id)?.name}</b> and nothing else.{' '}
            {orgs.length - 1} other {orgs.length - 1 === 1 ? 'organization' : 'organizations'}{' '}
            {orgs.length - 1 === 1 ? 'is' : 'are'} on this account.
          </span>
          <span className="scopesay__go">
            <button className="btn btn--amber" type="button" onClick={applyToAll}>
              Apply to all {orgs.length}
            </button>
            <button className="btn" type="button" onClick={() => setNarrow(null)}>
              Just this one
            </button>
          </span>
        </div>
      )}

      {(open || differ > 0) && open && (
        <div className="gsub">
          <div className="gsub__h">Where it differs</div>
          {orgs.map((o) => (
            <div className="grow" key={`${o.id}-${bumped}`}>
              <span className="grow__n">
                {o.mark && <span className="plate">{o.mark}</span>}
                <span>{o.name}</span>
              </span>
              <span className="grow__x">
                <LevelPick name={`l:${mod.key}:${o.id}`} start={each[o.id] ?? null}
                           onPick={(l) => {
                             setEach((e) => ({ ...e, [o.id]: l }))
                             setNarrow({ id: o.id, level: l })
                           }} />
              </span>
              <span />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
