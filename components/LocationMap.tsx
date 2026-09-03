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
  lat, lng, label, height = 190, zoom, hq = false,
}: { lat: number; lng: number; label?: string; height?: number; zoom?: number
     hq?: boolean }) {
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
        {/* Flat marigold: no cutout, no outline. The shape is unmistakable on
            its own, and the drop shadow on .lmap__pin is what separates it
            from the terrain now that the stroke is gone. */}
        <svg viewBox="0 0 24 32">
          <path d="M12 31C12 31 22 19.8 22 12A10 10 0 1 0 2 12c0 7.8 10 19 10 19z"
                fill="#F2A93B" />
        </svg>
      </span>
      {/* The head office wears its star on the picture, bottom right. In the
          name it pushed one name in a column of names sideways and gave the
          column two left edges. */}
      {hq && <span className="lochq" title="Head office">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9z" />
        </svg>
      </span>}
    </figure>
  )
}
