'use client'
import { useState, useTransition } from 'react'
import { setTaskDone, setNavusoftAccount } from '@/app/actions/fence'

/**
 * A job's tasks, and the one that cannot be ticked on the way past.
 *
 * Every other task is a person's word: they say it is done and it is done. The
 * Navusoft account is not, because it is a number rather than an opinion — the
 * task IS the number, so the box only closes once the number is there, and the
 * field to put it in is in the row rather than on some other screen.
 *
 * The tick is optimistic and puts itself back when the database refuses, which
 * it will for a section that is not this person's: the row is drawn from what
 * the server said, and a checkbox that stays ticked after a refusal is a lie
 * somebody acts on.
 */
type Task = {
  id: string; en: string; es: string | null; due_on: string | null
  done: boolean; needs?: string | null
}

export default function FenceTasks({
  jobId, tasks, mayEdit, navusoft, hasPlace,
}: {
  jobId: string
  tasks: Task[]
  mayEdit: boolean
  navusoft: string | null
  /** Whether the address already has a location record behind it. */
  hasPlace: boolean
}) {
  const [rows, setRows] = useState(tasks)
  const [account, setAccount] = useState(navusoft ?? '')
  const [say, setSay] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const [pending, start] = useTransition()

  const tick = (t: Task) => {
    if (!mayEdit) return
    const next = !t.done
    setRows((old) => old.map((r) => (r.id === t.id ? { ...r, done: next } : r)))
    setSay(null); setBad(false)
    const form = new FormData()
    form.set('task_id', t.id)
    form.set('done', String(next))
    start(async () => {
      const r = await setTaskDone(null, form)
      if (!r.ok) {
        setRows((old) => old.map((x) => (x.id === t.id ? { ...x, done: !next } : x)))
        setSay(r.message); setBad(true)
      }
    })
  }

  const saveAccount = () => {
    const form = new FormData()
    form.set('job_id', jobId)
    form.set('navusoft_account', account.trim())
    start(async () => {
      const r = await setNavusoftAccount(null, form)
      setSay(r.message); setBad(!r.ok)
    })
  }

  /* Open work first, finished work folded underneath.
     Reordering alone would not have done it -- eight struck-through rows above
     the one thing left to do is the same list, sorted differently. So the done
     ones go behind a count you can open, and a section with nothing left in it
     is that one line. A <details> rather than state, so it needs no JavaScript
     and survives the optimistic tick re-rendering underneath it. */
  const open = rows.filter((t) => !t.done)
  const shut = rows.filter((t) => t.done)

  const Row = (t: Task) => (
    <li key={t.id} className={t.done ? 'fjtask fjtask--done' : 'fjtask'}>
            {mayEdit ? (
              <button type="button" className="fjtask__box fjtask__box--go" onClick={() => tick(t)}
                      disabled={pending} aria-pressed={t.done}
                      aria-label={t.done ? `Put back: ${t.en}` : `Done: ${t.en}`} />
            ) : (
              <span className="fjtask__box" aria-hidden="true" />
            )}
            <span className="fjtask__t">
              <b>{t.en}</b>
              {t.due_on && <em>Due {t.due_on}</em>}

              {/* The task that is a number. The field is here because this is
                  where somebody is looking when they go to tick it. */}
              {t.needs === 'navusoft_account' && (
                <span className="fjnav">
                  <label htmlFor="nav-acct">Navusoft account number</label>
                  <span className="fjnav__go">
                    <input className="field" id="nav-acct" value={account} disabled={!mayEdit || pending}
                           onChange={(e) => setAccount(e.target.value)}
                           placeholder="As created in Navusoft" />
                    {mayEdit && (
                      <button className="btn" type="button" onClick={saveAccount}
                              disabled={pending || account.trim() === (navusoft ?? '')}>
                        Save it
                      </button>
                    )}
                  </span>
                  <small>
                    Kept against the address{hasPlace ? '' : ' — a location record is made for it'},
                    so every job at this site bills under the same account, and it travels with the
                    billing handoff.
                  </small>
                </span>
              )}
            </span>
    </li>
  )

  return (
    <>
      {open.length > 0 && <ul className="fjtasks">{open.map(Row)}</ul>}
      {shut.length > 0 && (
        <details className="fjdone">
          <summary>{shut.length} done</summary>
          <ul className="fjtasks">{shut.map(Row)}</ul>
        </details>
      )}
      {say && <p className={bad ? 'note note--err' : 'note note--ok'}>{say}</p>}
    </>
  )
}
