'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Reports, { type Card } from '@/components/Reports'
import CrumbTail from '@/components/CrumbTail'
import { toggleCard, reorderCards, setShares, renameDashboard, deleteDashboard }
  from '@/app/actions/dashboards'

/**
 * A dashboard, and the two things you do to one.
 *
 * The cards are drawn by Reports, not by a second card component. Everything
 * that makes a report readable there -- the density switch, the shared date
 * range, the popover with the graph and the source data, Print -- is the same
 * here for free, and a dashboard that behaved differently from Reporting would
 * be a second set of habits to learn for the same objects.
 *
 * What is different is what you do to the page rather than to a card: which
 * reports are on it, in what order, and who else sees it. Both live behind one
 * button, because they are one question -- what is this board -- asked twice.
 */
type Board = {
  id: string; title: string; name: string; owner_name: string
  is_mine: boolean; shared: boolean; card_count: number; shared_with: number
}
type Person = { id: string; full_name: string; entity_name: string | null }

export default function DashboardPage(
  { board, chosen, rest, shares, people }:
  { board: Board; chosen: Card[]; rest: Card[]; shares: string[]; people: Person[] },
) {
  const [editing, setEditing] = useState(false)

  return (
    <>
      <CrumbTail>{board.is_mine ? board.title : board.name}</CrumbTail>

      <div className="hi">
        <div className="hi__t">
          <h1>{board.is_mine ? board.title : board.name}</h1>
          <p className="scopeline"><span>
            {board.is_mine
              ? (board.shared && shares.length > 0
                  ? `Yours — shown to ${shares.length} ${shares.length === 1 ? 'person' : 'people'}.`
                  : 'Yours. Nobody else can see it.')
              : `${board.owner_name} shared this with you.`}
          </span></p>
        </div>
        <div className="hi__go">
          <Link className="btn" href="/dashboards">All dashboards</Link>
          {/* An icon, because it sits between two worded buttons and a third
              word would make the row a sentence nobody reads. */}
          <a className="btn btn--icon" href={`/dashboards/${board.id}/print`}
             target="_blank" rel="noreferrer"
             data-tip="Print or save as PDF" aria-label="Print or save as PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V3h12v6" /><path d="M6 18H4a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
              <rect x="6" y="14" width="12" height="7" rx="1" />
            </svg>
          </a>
          {/* Nothing a person may not do is rendered: on somebody else's board
              there is no greyed-out Edit to explain. */}
          {board.is_mine && (
            <button className="btn btn--amber" type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      {chosen.length === 0 ? (
        <div className="empty">
          <p>Nothing on it yet.</p>
          {board.is_mine && (
            <p><button className="btn btn--amber" type="button" onClick={() => setEditing(true)}>
              Choose some reports
            </button></p>
          )}
        </div>
      ) : (
        <Reports cards={chosen} />
      )}

      {editing && (
        <Editor board={board} chosen={chosen} rest={rest} shares={shares} people={people}
                onClose={() => setEditing(false)} />
      )}
    </>
  )
}

/**
 * Centred over the page rather than hung off the button.
 *
 * The same reason the report popover is: this panel is taller than the button
 * that raised it and the page under it scrolls. Anchoring it would put half of
 * it off the bottom on the one screen size somebody actually has.
 */
function Editor(
  { board, chosen, rest, shares, people, onClose }:
  { board: Board; chosen: Card[]; rest: Card[]; shares: string[]
    people: Person[]; onClose: () => void },
) {
  const router = useRouter()
  const [tab, setTab] = useState<'cards' | 'who'>('cards')
  const [order, setOrder] = useState<string[]>(chosen.map((c) => c.id))
  const [on, setOn] = useState<Set<string>>(new Set(chosen.map((c) => c.id)))
  const [who, setWho] = useState<Set<string>>(new Set(shares))
  const [title, setTitle] = useState(board.title)
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    const had = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = had
    }
  }, [onClose])

  const byId = useMemo(
    () => new Map([...chosen, ...rest].map((c) => [c.id, c])), [chosen, rest])

  async function flip(id: string) {
    const nowOn = !on.has(id)
    setBusy(true); setWhy(null)
    const fd = new FormData()
    fd.set('dashboard_id', board.id); fd.set('report_id', id); fd.set('on', nowOn ? '1' : '0')
    const r = await toggleCard(null, fd)
    setBusy(false)
    if (!r.ok) { setWhy(r.message); return }
    setOn((s) => { const n = new Set(s); nowOn ? n.add(id) : n.delete(id); return n })
    setOrder((o) => nowOn ? [...o, id] : o.filter((x) => x !== id))
    router.refresh()
  }

  async function move(id: string, by: -1 | 1) {
    const i = order.indexOf(id)
    const j = i + by
    if (i < 0 || j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
    setBusy(true)
    const fd = new FormData()
    fd.set('dashboard_id', board.id); fd.set('order', next.join(','))
    const r = await reorderCards(null, fd)
    setBusy(false)
    if (!r.ok) { setWhy(r.message); return }
    router.refresh()
  }

  async function saveWho() {
    setBusy(true); setWhy(null)
    const fd = new FormData()
    fd.set('dashboard_id', board.id)
    who.forEach((p) => fd.append('person_id', p))
    const r = await setShares(null, fd)
    setBusy(false)
    if (!r.ok) { setWhy(r.message); return }
    router.refresh()
  }

  async function saveTitle() {
    if (title.trim() === board.title) return
    setBusy(true); setWhy(null)
    const fd = new FormData()
    fd.set('id', board.id); fd.set('title', title.trim())
    const r = await renameDashboard(null, fd)
    setBusy(false)
    if (!r.ok) { setWhy(r.message); return }
    router.refresh()
  }

  async function remove() {
    setBusy(true)
    const fd = new FormData()
    fd.set('id', board.id); fd.set('title', board.title)
    const r = await deleteDashboard(null, fd)
    setBusy(false)
    if (!r.ok) { setWhy(r.message); return }
    router.push('/dashboards')
  }

  return (
    <div className="rscrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bedit" ref={box} role="dialog" aria-label={`Edit ${board.title}`}>
        <div className="rpop__h">
          <span className="rpop__t"><b>{board.title}</b></span>
          <div className="rpop__tabs bedit__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'cards'}
                    onClick={() => setTab('cards')}>What&rsquo;s on it</button>
            <button type="button" role="tab" aria-selected={tab === 'who'}
                    onClick={() => setTab('who')}>Who sees it</button>
          </div>
          <button className="rpop__x" type="button" aria-label="Close" onClick={onClose}>&times;</button>
        </div>

        <div className="bedit__b">
          {tab === 'cards' ? (
            <>
              <label htmlFor="b-title">Name</label>
              <input className="field" id="b-title" value={title} maxLength={80}
                     onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} />

              <p className="bedit__s">On it — top to bottom</p>
              {order.length === 0
                ? <p className="muted">Nothing yet. Pick from below.</p>
                : (
                  <ul className="bpick">
                    {order.map((id, i) => {
                      const c = byId.get(id)
                      if (!c) return null
                      return (
                        <li key={id}>
                          <span className="bpick__n">{c.name}</span>
                          <span className="bpick__w">{c.entity}</span>
                          <button type="button" aria-label="Move up" disabled={i === 0 || busy}
                                  onClick={() => move(id, -1)}>&uarr;</button>
                          <button type="button" aria-label="Move down"
                                  disabled={i === order.length - 1 || busy}
                                  onClick={() => move(id, 1)}>&darr;</button>
                          <button type="button" className="bpick__off" aria-label="Take off"
                                  disabled={busy} onClick={() => flip(id)}>&times;</button>
                        </li>
                      )
                    })}
                  </ul>
                )}

              <p className="bedit__s">Everything else you can see</p>
              {rest.filter((c) => !on.has(c.id)).length === 0
                ? <p className="muted">That is all of them.</p>
                : (
                  <ul className="bpick bpick--off">
                    {rest.filter((c) => !on.has(c.id)).map((c) => (
                      <li key={c.id}>
                        <span className="bpick__n">{c.name}</span>
                        <span className="bpick__w">{c.entity}</span>
                        <button type="button" className="bpick__add" disabled={busy}
                                onClick={() => flip(c.id)}>Add</button>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          ) : (
            <>
              <p className="fine">
                Sharing shows this board and nothing else. Somebody who cannot already
                see a report on it still cannot — the report decides that, not the board.
              </p>
              {people.length === 0
                ? <p className="muted">Nobody else on the roster yet.</p>
                : (
                  <ul className="bwho">
                    {people.map((p) => {
                      const isOn = who.has(p.id)
                      return (
                        <li key={p.id}>
                          <button type="button" role="switch" aria-checked={isOn}
                                  className={`tog${isOn ? ' is-on' : ''}`}
                                  onClick={() => setWho((s) => {
                                    const n = new Set(s)
                                    isOn ? n.delete(p.id) : n.add(p.id)
                                    return n
                                  })}>
                            <span className="tog__k" />
                          </button>
                          <span className="bwho__n">{p.full_name}</span>
                          <span className="bwho__w">{p.entity_name ?? '—'}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              <div className="rowacts">
                <button className="btn btn--amber" type="button" onClick={saveWho} disabled={busy}>
                  {busy ? 'Saving…' : who.size === 0 ? 'Keep it to myself' : 'Share it'}
                </button>
              </div>
            </>
          )}

          {why && <p className="swhy">{why}</p>}

          <div className="bedit__end">
            {confirming ? (
              <>
                <span>Delete {board.title}? The board goes, the reports stay.</span>
                <button className="btn btn--danger" type="button" onClick={remove} disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete it'}
                </button>
                <button className="btn" type="button" onClick={() => setConfirming(false)}>Keep it</button>
              </>
            ) : (
              <button className="btn bedit__del" type="button" onClick={() => setConfirming(true)}>
                Delete this dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
