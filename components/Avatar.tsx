/**
 * Somebody's face, or their initials when there isn't one.
 *
 * A missing photo is the normal case on a fresh roster, so the fallback is a
 * real design rather than a broken image icon -- initials on Steel, the same
 * plate the organizations wear.
 */
export default function Avatar({
  name, src, size = 34, title,
}: { name: string; src?: string | null; size?: number; title?: string }) {
  const initials = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
    .slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'

  if (src) {
    return (
      <img className="ava" src={src} alt="" title={title ?? name}
           width={size} height={size} style={{ width: size, height: size }} />
    )
  }
  return (
    <span className="ava ava--init" title={title ?? name} aria-hidden="true"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {initials}
    </span>
  )
}
