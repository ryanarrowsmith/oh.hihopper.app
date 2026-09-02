/**
 * An organization's artwork, hard right of the page header. No logo on file is
 * not an empty box -- it falls back to the mark on its plate, which is what
 * every list already shows, one size up. Same rule as a person's face falling
 * back to their initials: a monogram is a real answer, not a placeholder.
 */
export default function OrgLogo({
  name, mark, src,
}: { name: string; mark?: string | null; src?: string | null }) {
  if (src) {
    return (
      <div className="orglogo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name} logo`} />
      </div>
    )
  }
  const monogram = (mark ?? name.replace(/[^A-Za-z ]/g, '').split(/\s+/)
    .filter(Boolean).slice(0, 2).map((w) => w[0]).join('') ?? '')
    .toUpperCase().slice(0, 4)
  return (
    <div className="orglogo orglogo--mark" role="img" aria-label={`${name} monogram`}>
      {monogram || '—'}
    </div>
  )
}
