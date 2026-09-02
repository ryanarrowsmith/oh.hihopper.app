import Avatar from '@/components/Avatar'

/**
 * The looked-up favorites, drawing themselves.
 *
 * Each one keeps whatever it needs to be recognisable without asking anyone
 * again -- the pin, the label, the two covers, the wrapper. When the artwork
 * is missing the shape stays and the drawn stand-in fills it, so a page of
 * answers never collapses into a page of alt text.
 */
export type Profile = {
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

export const Birthday = () => (
  <svg className="bday" viewBox="0 0 100 100" role="img" aria-label="Birthday">
    <path className="flame" d="M50 8c3.4 4.2 5.2 6.9 5.2 9.6a5.2 5.2 0 0 1-10.4 0C44.8 14.9 46.6 12.2 50 8z" />
    <path className="wick" d="M50 24v9" />
    <path className="icing" d="M22 52c4.7 0 4.7-6 9.3-6s4.7 6 9.4 6 4.6-6 9.3-6 4.7 6 9.3 6 4.7-6 9.4-6 4.6 6 9.3 6v8H22z" />
    <path className="cake" d="M22 60h56v26a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" />
    <path className="cake" d="M50 33v13" />
  </svg>
)

const Pin = () => (
  <svg viewBox="0 0 24 32" aria-hidden="true">
    <path d="M12 31C12 31 22 19.8 22 12A10 10 0 1 0 2 12c0 7.8 10 19 10 19z" />
  </svg>
)

/** A card, or nothing to say yet -- which is a normal state and says so. */
function Card({ label, media, value, sub, href }:
  { label: string; media?: React.ReactNode; value: string | null
    sub?: string | null; href?: string | null }) {
  const body = (
    <>
      <span className="gcard__l">{label}</span>
      {value && media ? <span className="gm">{media}</span> : null}
      <span className="gcard__t">
        {value
          ? <><span className="gcard__v">{value}</span>
              {sub ? <span className="gcard__s">{sub}</span> : null}</>
          : <span className="gcard__none">Not answered yet</span>}
      </span>
    </>
  )
  const cls = `gcard${value && media ? '' : ' gcard--plain'}`
  return href && value
    ? <a className={cls} href={href} target="_blank" rel="noreferrer noopener">{body}</a>
    : <div className={cls}>{body}</div>
}

export default function Favorites({ p, mapSrc }: { p: Profile; mapSrc: string | null }) {
  return (
    <div className="gg">
      <Card label="Birthday month" media={<Birthday />}
            value={p.birth_month ? MONTHS[p.birth_month - 1] : null}
            sub="The month, never the date." />

      <Card label="Favorite color"
            media={<span className="swatch__c"
                         style={{ background: p.favorite_color ?? 'transparent' }} />}
            value={p.favorite_color} />

      <Card label="Favorite restaurant" href={p.restaurant_url}
            media={mapSrc
              ? <img className="gmap" src={mapSrc} alt="" width={320} height={104} />
              : <span className="gmap"><Pin /></span>}
            value={p.restaurant_name} sub={p.restaurant_address} />

      <Card label="Favorite song" href={p.song_url}
            media={
              <span className="disc">
                {p.song_art_url
                  ? <img className="disc__lab" src={p.song_art_url} alt="" width={44} height={44} />
                  : <span className="disc__lab"><i /></span>}
              </span>}
            value={p.song_title} sub={p.song_artist} />

      <Card label="Favorite movie" href={p.movie_url}
            media={p.movie_art_url
              ? <img className="post__p" src={p.movie_art_url} alt="" width={70} height={104} />
              : <span className="post__p"><span>{p.movie_title}</span></span>}
            value={p.movie_title} sub={p.movie_year ? String(p.movie_year) : null} />

      <Card label="Favorite book" href={p.book_url}
            media={p.book_cover_url
              ? <img className="book" src={p.book_cover_url} alt="" width={74} height={104} />
              : <span className="book"><span>{p.book_title}</span></span>}
            value={p.book_title} sub={p.book_author} />

      <Card label="Favorite candy" href={p.candy_url}
            media={
              <span className="candy">
                {p.candy_img_url
                  ? <img src={p.candy_img_url} alt="" />
                  : <span>{p.candy}</span>}
              </span>}
            value={p.candy} />
    </div>
  )
}
