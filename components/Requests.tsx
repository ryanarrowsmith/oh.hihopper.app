'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

/**
 * What you have asked, and what came back.
 *
 * The thread is fetched when a request is opened rather than with the list --
 * most requests are never reopened, and forty threads to draw two is forty
 * round trips for nothing.
 *
 * Internal staff notes are not filtered here. beebee.request_thread does not
 * return them to anybody who is not staff, which is the right place for that
 * rule: a UI that hides a row still received it, and "hidden" and "never sent"
 * are different promises.
 */
export type Row = {
  id: string; ref: string; subject: string; body: string
  kind: string; urgency: string; status: string
  opened_at: string; resolved_at: string | null
  route: string | null
}
type Message = {
  id: string; author_label: string; from_staff: boolean
  internal: boolean; body: string; sent_at: string
}

const OPEN_STATES = new Set(['open', 'in_progress', 'waiting'])

const SAYS: Record<string, string> = {
  open: 'Waiting on us',
  in_progress: 'Being looked at',
  waiting: 'Waiting on you',
  resolved: 'Answered',
  closed: 'Closed',
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US',
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Requests({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState<string | null>(null)

  if (rows.length === 0) {
    return <p className="empty">Nothing yet. When you ask something it will be here, with the answer.</p>
  }

  return (
    <div className="reqs">
      {rows.map((r) => (
        <div className={`req${open === r.id ? ' is-open' : ''}`} key={r.id}>
          <button className="req__h" type="button" aria-expanded={open === r.id}
                  onClick={() => setOpen(open === r.id ? null : r.id)}>
            <span className="req__ref">{r.ref}</span>
            <span className="req__s">{r.subject}</span>
            <span className={`pill${OPEN_STATES.has(r.status) ? '' : ' pill--good'}`}>
              {SAYS[r.status] ?? r.status}
            </span>
            <span className="req__w">{when(r.opened_at)}</span>
          </button>
          {open === r.id && <Thread request={r} />}
        </div>
      ))}
    </div>
  )
}

function Thread({ request }: { request: Row }) {
  const router = useRouter()
  const [msgs, setMsgs] = useState<Message[] | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  // In an effect, not in the render. Called from the body it would fire again
  // on every re-render between the request going out and the state coming
  // back -- which is not one stray fetch, it is as many as React re-renders.
  const load = useCallback(async () => {
    const db = supabaseBrowser()
    const { data, error } = await db.schema('beebee')
      .rpc('request_thread', { p_request: request.id })
    if (error) { setWhy(error.message); return }
    setMsgs((data ?? []) as Message[])
  }, [request.id])

  useEffect(() => { load() }, [load])

  async function send() {
    if (!reply.trim()) return
    setBusy(true); setWhy(null)
    const db = supabaseBrowser()
    const { error } = await db.schema('beebee')
      .rpc('reply_to_request', { p_request: request.id, p_body: reply.trim() })
    setBusy(false)
    if (error) { setWhy(error.message); return }
    setReply('')
    await load()
    // A reply from the reporter reopens anything resolved or waiting, so the
    // status on the row above is now stale.
    router.refresh()
  }

  return (
    <div className="req__b">
      {why && <p className="swhy">{why}</p>}
      {msgs === null ? (
        <p className="muted">Fetching…</p>
      ) : (
        <div className="thread">
          {msgs.map((m) => (
            <div className={`msg${m.from_staff ? ' msg--them' : ''}`} key={m.id}>
              <p className="msg__w"><b>{m.author_label}</b>{when(m.sent_at)}</p>
              <p className="msg__b">{m.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="reqreply">
        <textarea className="field" rows={3} value={reply} placeholder="Add something…"
                  onChange={(e) => setReply(e.target.value)} />
        <button className="btn" type="button" onClick={send} disabled={busy || !reply.trim()}>
          {busy ? 'Sending…' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
