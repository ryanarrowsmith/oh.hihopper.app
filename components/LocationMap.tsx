/**
 * A themed map. The image comes through our own proxy; the pin is drawn on top
 * in Hopper's amber rather than baked in by Mapbox, so it stays sharp at any
 * scale and stays on the brand's palette. The label is the alt text and
 * nothing else -- names belong on the canvas, not over the terrain.
 *
 * Two sources, one per theme, so dark mode gets Mapbox's dark style rather than
 * a light map dimmed with a filter -- which is what makes a map look like a
 * photograph of a map.
 */
export default function LocationMap({
  lat, lng, label, height = 190, zoom,
}: { lat: number; lng: number; label?: string; height?: number; zoom?: number }) {
  const q = (theme: 'light' | 'dark') =>
    `/api/map?lat=${lat}&lng=${lng}&w=760&h=${height * 2}`
    + (zoom ? `&z=${zoom}` : '') + (theme === 'dark' ? '&theme=dark' : '')

  return (
    <figure className="lmap" style={{ height }}>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={q('dark')} />
        <img src={q('light')} alt={label ? `Map of ${label}` : 'Map'} loading="lazy" />
      </picture>
      <span className="lmap__pin" aria-hidden="true">
        <svg viewBox="0 0 24 32">
          <path d="M12 31C12 31 22 19.8 22 12A10 10 0 1 0 2 12c0 7.8 10 19 10 19z"
                fill="#F2A93B" stroke="#231F20" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3.6" fill="#231F20" />
        </svg>
      </span>
    </figure>
  )
}
