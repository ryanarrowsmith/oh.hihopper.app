'use client'
import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveProfile } from '@/app/actions/profile'
import { PALETTE } from '@/lib/palette'
import Choice from '@/components/Choice'

/**
 * Answering Get to know me.
 *
 * It follows the house rules rather than inventing its own: the form slides
 * out in place under the heading rather than opening a page, the drawer closes
 * because the save worked and stays open with the reason when it did not, and
 * every choice is Hopper's own popover rather than the operating system's.
 *
 * The five looked-up answers are searched, not typed. What comes back is
 * stored with the pick -- the pin, the artwork, the link -- so a profile draws
 * itself later without asking anyone again, and a save never depends on
 * somebody else's service being awake.
 */
type Hit = {
  id: string; title: string; sub?: string | null; img?: string | null
  url?: string | null; lat?: number | null; lng?: number | null
  address?: string | null; year?: number | null
}

export type Answers = {
  birth_month: number | null
  favorite_color: string | null
  candy: string | null; candy_img_url: string | null; candy_url: string | null
  restaurant_name: string | null; restaurant_address: string | null
  restaurant_lat: number | null; restaurant_lng: number | null; restaurant_url: string | null
  song_title: string | null; song_artist: string | null
  song_art_url: string | null; song_url: string | null
  movie_title: string | null; movie_year: number | null
  movie_art_url: string | null; movie_url: string | null
  book_title: string | null; book_author: string | null
  book_cover_url: string | null; book_url: string | null
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function GetToKnowEdit({ personId, mine, answers, title }:
  { personId: string; mine: boolean; answers: Answers; title: string }) {
  const [open, setOpen] = useState(false)
  const [state, run] = useFormState(saveProfile, null)
  const [a, setA] = useState<Answers>(answers)

  // Closes because the save worked, never because a button was pressed.
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = panel.current
    if (!el) return
    if (open) el.removeAttribute('inert'); else el.setAttribute('inert', '')
  }, [open])

  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }))

  // The heading row and the drawer are one component on purpose. The drawer
  // has to sit *under* the row, and .gtkm__h is a flex line -- a drawer
  // returned alongside the pencil would be laid out beside it instead.
  return (
    <>
      <div className="gtkm__h">
        <h3>{title}</h3>
        <span className="rule" />
      <button className={`cbub cbub--pen${open ? ' is-on' : ''}`} type="button"
              aria-expanded={open} onClick={() => setOpen(!open)}
              title={open ? 'Close' : mine ? 'Answer these' : 'Edit these answers'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z" /><path d="M14.5 5.5 18.5 9.5" />
        </svg>
      </button>
      </div>

      <div className={`gedit${open ? ' is-open' : ''}`}>
        <div className="gedit__clip"><div className="gedit__p" ref={panel}>
          <form action={run}>
            <input type="hidden" name="person_id" value={personId} />

            <div className="formrow">
              <div>
                <label htmlFor="gk-month">Birthday month</label>
                <Choice id="gk-month" name="birth_month"
                        defaultValue={a.birth_month ? String(a.birth_month) : ''}
                        options={[{ value: '', label: 'Rather not say' },
                          ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]} />
                <p className="fine">The month. Never the date, never the year.</p>
              </div>
              <div>
                <label>Favorite color</label>
                <input type="hidden" name="favorite_color" value={a.favorite_color ?? ''} />
                <div className="pal">
                  {PALETTE.map(([name, hex]) => (
                    <button key={name} type="button" title={name}
                            aria-pressed={a.favorite_color === name}
                            className="pal__c" style={{ background: hex }}
                            onClick={() => set({ favorite_color: a.favorite_color === name ? null : name })}>
                      <span className="vh">{name}</span>
                    </button>
                  ))}
                </div>
                <p className="fine">{a.favorite_color ?? 'Nothing picked.'}</p>
              </div>
            </div>

            <Lookup kind="restaurant" label="Favorite restaurant"
                    placeholder="Tally's Good Food Cafe, Tulsa"
                    picked={a.restaurant_name
                      ? { title: a.restaurant_name, sub: a.restaurant_address }
                      : null}
                    onPick={(h) => set({
                      restaurant_name: h && h.title, restaurant_address: h?.address ?? null,
                      restaurant_lat: h?.lat ?? null, restaurant_lng: h?.lng ?? null,
                      restaurant_url: h?.url ?? null,
                    })} />
            <input type="hidden" name="restaurant_name" value={a.restaurant_name ?? ''} />
            <input type="hidden" name="restaurant_address" value={a.restaurant_address ?? ''} />
            <input type="hidden" name="restaurant_lat" value={a.restaurant_lat ?? ''} />
            <input type="hidden" name="restaurant_lng" value={a.restaurant_lng ?? ''} />
            <input type="hidden" name="restaurant_url" value={a.restaurant_url ?? ''} />

            <Lookup kind="song" label="Favorite song" placeholder="Tupelo Honey"
                    picked={a.song_title ? { title: a.song_title, sub: a.song_artist, img: a.song_art_url } : null}
                    onPick={(h) => set({
                      song_title: h && h.title, song_artist: h?.sub ?? null,
                      song_art_url: h?.img ?? null, song_url: h?.url ?? null,
                    })} />
            <input type="hidden" name="song_title" value={a.song_title ?? ''} />
            <input type="hidden" name="song_artist" value={a.song_artist ?? ''} />
            <input type="hidden" name="song_art_url" value={a.song_art_url ?? ''} />
            <input type="hidden" name="song_url" value={a.song_url ?? ''} />

            <Lookup kind="movie" label="Favorite movie" placeholder="The Out-of-Towners"
                    picked={a.movie_title
                      ? { title: a.movie_title, sub: a.movie_year ? String(a.movie_year) : null,
                          img: a.movie_art_url } : null}
                    onPick={(h) => set({
                      movie_title: h && h.title, movie_year: h?.year ?? null,
                      movie_art_url: h?.img ?? null, movie_url: h?.url ?? null,
                    })} />
            <input type="hidden" name="movie_title" value={a.movie_title ?? ''} />
            <input type="hidden" name="movie_year" value={a.movie_year ?? ''} />
            <input type="hidden" name="movie_art_url" value={a.movie_art_url ?? ''} />
            <input type="hidden" name="movie_url" value={a.movie_url ?? ''} />

            <Lookup kind="book" label="Favorite book" placeholder="East of Eden"
                    picked={a.book_title ? { title: a.book_title, sub: a.book_author, img: a.book_cover_url } : null}
                    onPick={(h) => set({
                      book_title: h && h.title, book_author: h?.sub ?? null,
                      book_cover_url: h?.img ?? null, book_url: h?.url ?? null,
                    })} />
            <input type="hidden" name="book_title" value={a.book_title ?? ''} />
            <input type="hidden" name="book_author" value={a.book_author ?? ''} />
            <input type="hidden" name="book_cover_url" value={a.book_cover_url ?? ''} />
            <input type="hidden" name="book_url" value={a.book_url ?? ''} />

            <Lookup kind="candy" label="Favorite candy" placeholder="Bit-O-Honey"
                    freeText
                    picked={a.candy ? { title: a.candy, sub: null, img: a.candy_img_url } : null}
                    onPick={(h) => set({
                      candy: h && h.title, candy_img_url: h?.img ?? null, candy_url: h?.url ?? null,
                    })} />
            <input type="hidden" name="candy" value={a.candy ?? ''} />
            <input type="hidden" name="candy_img_url" value={a.candy_img_url ?? ''} />
            <input type="hidden" name="candy_url" value={a.candy_url ?? ''} />

            {state && !state.ok && <p className="formerr">{state.message}</p>}

            <div className="rowacts">
              <Save />
              <button className="lnk" type="button" onClick={() => setOpen(false)}>Cancel</button>
              {!mine && (
                <span className="fine">
                  You are answering for somebody else because you administer their organization.
                </span>
              )}
            </div>
          </form>
        </div></div>
      </div>
    </>
  )
}

function Save() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </button>
  )
}

/**
 * Search, pick one, keep what it came with.
 *
 * A failure says which service and what happened, in the words the route sent
 * -- "iTunes answered 503" is a thing somebody can wait out; "no results" is a
 * thing they would keep retyping.
 */
function Lookup({ kind, label, placeholder, picked, onPick, freeText }: {
  kind: string; label: string; placeholder: string; freeText?: boolean
  picked: { title: string; sub?: string | null; img?: string | null } | null
  onPick: (h: Hit | null) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [why, setWhy] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!searching || q.trim().length < 2) { setHits([]); setWhy(null); return }
    const t = setTimeout(async () => {
      setBusy(true); setWhy(null)
      try {
        const r = await fetch(`/api/lookup?kind=${kind}&q=${encodeURIComponent(q)}`)
        const j = await r.json()
        if (j.ok) { setHits(j.hits); if (!j.hits.length) setWhy('Nothing came back for that.') }
        else { setHits([]); setWhy(j.why ?? 'The search did not work.') }
      } catch {
        setHits([]); setWhy('The search never left the page.')
      } finally { setBusy(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q, kind, searching])

  if (picked && !searching) {
    return (
      <div className="lk">
        <label>{label}</label>
        <div className="lk__has">
          {picked.img
            ? <img className="lk__i" src={picked.img} alt="" />
            : <span className="lk__i lk__i--none" aria-hidden="true" />}
          <span className="lk__t">
            <b>{picked.title}</b>
            {picked.sub ? <span>{picked.sub}</span> : null}
          </span>
          <button className="lnk" type="button" onClick={() => { setSearching(true); setQ('') }}>
            Change
          </button>
          <button className="lnk" type="button" onClick={() => onPick(null)}>Clear</button>
        </div>
      </div>
    )
  }

  return (
    <div className="lk">
      <label htmlFor={`lk-${kind}`}>{label}</label>
      <input className="field" id={`lk-${kind}`} value={q} placeholder={placeholder}
             autoComplete="off"
             onChange={(e) => { setQ(e.target.value); setSearching(true) }} />
      {busy && <p className="fine">Looking…</p>}
      {why && (
        <p className="fine">
          {why}
          {freeText && q.trim().length > 1 && (
            <>
              {' '}
              <button className="lnk" type="button"
                      onClick={() => { onPick({ id: q, title: q.trim() }); setSearching(false) }}>
                Just use “{q.trim()}”
              </button>
            </>
          )}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="lk__list">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => { onPick(h); setSearching(false); setQ('') }}>
                {h.img
                  ? <img className="lk__i" src={h.img} alt="" />
                  : <span className="lk__i lk__i--none" aria-hidden="true" />}
                <span className="lk__t">
                  <b>{h.title}</b>
                  {h.sub || h.address ? <span>{h.sub ?? h.address}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
