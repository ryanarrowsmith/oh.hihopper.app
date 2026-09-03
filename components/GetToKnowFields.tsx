'use client'
import { useEffect, useState } from 'react'
import { PALETTE } from '@/lib/palette'
import Choice from '@/components/Choice'

/**
 * The Get to know me answers, as fields.
 *
 * They used to be a form of their own with its own pencil, which meant a
 * person's page had two edit buttons a hand's width apart -- one for the
 * things the business knows about you and one for the things you know about
 * yourself. Ryan: "1 plus their fun about me stuff. Edit the same screen."
 *
 * So this is only the fields. Whoever renders them owns the form, the save and
 * the closing -- see PersonEdit.
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
  birth_day: number | null
  start_month: number | null
  start_year: number | null
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

export default function GetToKnowFields({ answers }: { answers: Answers }) {
  const [a, setA] = useState<Answers>(answers)
  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }))
  return (
    <>
      <div className="formrow">
        <div>
          <label htmlFor="gk-month">Birthday month</label>
          <Choice id="gk-month" name="birth_month"
                  defaultValue={a.birth_month ? String(a.birth_month) : ''}
                  options={[{ value: '', label: 'Rather not say' },
                    ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]} />
          <p className="fine">
            The month and the day, so a birthday lands on its own square.
            Never the year &mdash; Hopper has no use for anybody&rsquo;s age.
          </p>
        </div>
        <div>
          <label htmlFor="gk-day">Birthday day</label>
          <Choice id="gk-day" name="birth_day"
                  defaultValue={a.birth_day ? String(a.birth_day) : ''}
                  options={[{ value: '', label: 'Rather not say' },
                    ...Array.from({ length: 31 }, (_, i) => ({
                      value: String(i + 1), label: String(i + 1) }))]} />
          <p className="fine">Leave it empty and your birthday stays a month rather than a date.</p>
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
              picked={a.candy ? { title: a.candy, sub: null, img: a.candy_img_url } : null}
              onPick={(h) => set({
                candy: h && h.title, candy_img_url: h?.img ?? null, candy_url: h?.url ?? null,
              })} />
      <input type="hidden" name="candy" value={a.candy ?? ''} />
      <input type="hidden" name="candy_img_url" value={a.candy_img_url ?? ''} />
      <input type="hidden" name="candy_url" value={a.candy_url ?? ''} />

    </>
  )
}

/**
 * Search, pick one, keep what it came with.
 *
 * A failure says which service and what happened, in the words the route sent
 * -- "iTunes answered 503" is a thing somebody can wait out; "no results" is a
 * thing they would keep retyping.
 */
/**
 * Search is a convenience here, never a gate.
 *
 * A favourite film is whatever somebody says it is. When the search came back
 * empty -- or rate-limited, or 503, all of which these free services do -- the
 * field simply refused to accept the answer that was already typed into it.
 * That is a personal detail held hostage by somebody else's API.
 *
 * So what you typed is always keepable, whether the search failed, succeeded
 * with the wrong things, or is still thinking. A picture is a bonus.
 */
function Lookup({ kind, label, placeholder, picked, onPick }: {
  kind: string; label: string; placeholder: string
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
      {why && <p className="fine">{why}</p>}

      {/* Always available once there is something to keep -- above the results,
          because when the list is wrong this is the thing you want. */}
      {q.trim().length > 1 && !busy && (
        <p className="fine">
          <button className="lnk" type="button"
                  onClick={() => { onPick({ id: q, title: q.trim() }); setSearching(false) }}>
            Keep “{q.trim()}”
          </button>
          {hits.length > 0 && ' — or pick one below.'}
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
