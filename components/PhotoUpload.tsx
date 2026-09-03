'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { savePhoto, clearPhoto } from '@/app/actions/photo'

/**
 * A face, cropped by whoever is allowed to.
 *
 * One square file per person, 1024 across, and every size in the product is a
 * scale of it -- 30 in a table row, 38 in a list, 72 on a card, 132 here. That
 * is the reason for the crop step rather than a plain file field: the same
 * photograph has to survive a circle at 30px and a wide card banner, and a
 * face is not reliably in the middle of the picture somebody uploads. Deciding
 * that here, once, beats centre-cropping strangers' heads forever.
 *
 * 1024 rather than the 132 it is drawn at, because the largest use is not the
 * largest use for long, and because a photograph is the one thing in Hopper
 * nobody can regenerate. It is resampled once, on the way in.
 *
 * The crop is a viewport over the image, not a rectangle over a canvas: the
 * image is positioned and scaled behind a square hole and you move it, which
 * is the gesture everybody already knows. It cannot be moved so far that the
 * hole shows through -- the clamp is on the offset, so there is no state in
 * which the saved square has a transparent corner.
 */
const STAGE = 264
const OUT = 1024

export default function PhotoUpload(
  { personId, name, src, may, mine, size = 132 }:
  { personId: string; name: string; src: string | null
    /** Whether this viewer may change it -- the person themselves, or anybody
     *  who may edit the roster. The storage policy asks the same question and
     *  is the one that decides; this only stops Hopper offering a control that
     *  would be refused. */
    may: boolean
    /** Whether it is their own face, which changes only what the panel says. */
    mine: boolean
    size?: number },
) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState<string | null>(null)

  const img = useRef<HTMLImageElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [open])

  // An object URL is a handle on a file the tab is holding open. Let go of it.
  useEffect(() => () => { if (file) URL.revokeObjectURL(file) }, [file])

  function close() {
    setOpen(false); setWhy(null)
    if (file) { URL.revokeObjectURL(file); setFile(null) }
    setNat(null); setZoom(1); setOff({ x: 0, y: 0 })
  }

  function chose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''                       // so choosing the same file twice still fires
    if (!f) return
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) {
      setWhy('That is not a picture Hopper can read — JPEG, PNG or WebP.'); return
    }
    setWhy(null)
    if (file) URL.revokeObjectURL(file)
    setFile(URL.createObjectURL(f))
    setNat(null); setZoom(1); setOff({ x: 0, y: 0 })
  }

  /** The scale at which the shorter side exactly fills the hole. */
  const base = nat ? STAGE / Math.min(nat.w, nat.h) : 1
  const dw = nat ? nat.w * base * zoom : 0
  const dh = nat ? nat.h * base * zoom : 0

  function clamp(x: number, y: number) {
    return { x: Math.min(0, Math.max(STAGE - dw, x)), y: Math.min(0, Math.max(STAGE - dh, y)) }
  }
  useEffect(() => { setOff((o) => clamp(o.x, o.y)) }, [zoom, nat])   // eslint-disable-line

  function loaded() {
    const el = img.current
    if (!el) return
    const w = el.naturalWidth, h = el.naturalHeight
    setNat({ w, h })
    const b = STAGE / Math.min(w, h)
    setOff({ x: (STAGE - w * b) / 2, y: (STAGE - h * b) / 2 })       // centered to start
  }

  function down(e: React.PointerEvent) {
    if (!nat) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
  }
  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    setOff(clamp(d.ox + (e.clientX - d.x), d.oy + (e.clientY - d.y)))
  }
  function up() { drag.current = null }

  async function save() {
    const el = img.current
    if (!el || !nat) return
    setBusy(true); setWhy(null)
    try {
      const k = OUT / STAGE
      const c = document.createElement('canvas')
      c.width = OUT; c.height = OUT
      const g = c.getContext('2d')
      if (!g) throw new Error('This browser would not give Hopper a canvas.')
      g.imageSmoothingQuality = 'high'
      g.fillStyle = '#fff'; g.fillRect(0, 0, OUT, OUT)   // PNG transparency becomes white, not black
      g.drawImage(el, off.x * k, off.y * k, dw * k, dh * k)

      const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86))
      if (!blob) throw new Error('The picture would not encode.')

      const fd = new FormData()
      fd.set('person_id', personId)
      fd.set('photo', blob, 'face.jpg')
      const res = await savePhoto(null, fd)
      if (!res.ok) { setWhy(res.message); return }
      close()
      router.refresh()
    } catch (e: any) {
      setWhy(e?.message ?? 'It did not save.')
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setWhy(null)
    const fd = new FormData()
    fd.set('person_id', personId)
    const res = await clearPhoto(null, fd)
    setBusy(false)
    if (!res.ok) { setWhy(res.message); return }
    close()
    router.refresh()
  }

  if (!may) return <Avatar name={name} src={src} size={size} />

  return (
    <div className="phw">
      <button className="phbtn" type="button" ref={btn}
              aria-haspopup="dialog" aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); open ? close() : setOpen(true) }}>
        <Avatar name={name} src={src} size={size} />
        <span className="phbtn__veil">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" /><circle cx="12" cy="13.2" r="3.4" />
          </svg>
          {src ? 'Change' : 'Add a photo'}
        </span>
      </button>

      {open && (
        <div className="addpop phpop" ref={pop} role="dialog"
             aria-label={mine ? 'Your photo' : `${name}'s photo`}>
          <div className="addpop__h">
            <b>{mine ? 'Your photo' : `${name.split(' ')[0]}’s photo`}</b>
            <button className="addpop__x" type="button" aria-label="Close" onClick={close}>&times;</button>
          </div>

          <div className="addpop__body">
            {!file ? (
              <>
                <p className="phhint">
                  A square picture, cropped here. It is used as a circle in lists and
                  full-width on cards, so put the face where {mine ? 'you want' : 'it belongs'}.
                </p>
                <label className="btn btn--amber phpick">
                  {src ? 'Choose a new picture' : 'Choose a picture'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chose} />
                </label>
                {src && (
                  <button className="btn phrm" type="button" onClick={remove} disabled={busy}>
                    {busy ? 'Removing…' : 'Remove the photo'}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="phstage" style={{ width: STAGE, height: STAGE }}
                     onPointerDown={down} onPointerMove={move}
                     onPointerUp={up} onPointerCancel={up}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img ref={img} src={file} alt="" onLoad={loaded} draggable={false}
                       style={{ left: off.x, top: off.y, width: dw || undefined, height: dh || undefined }} />
                  <span className="phstage__ring" aria-hidden="true" />
                </div>

                <label className="phzoom">
                  <span>Zoom</span>
                  <input type="range" min={1} max={4} step={0.01} value={zoom}
                         onChange={(e) => setZoom(Number(e.target.value))} />
                </label>

                <div className="rowacts">
                  <button className="btn btn--amber" type="button" onClick={save} disabled={busy || !nat}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn" type="button" onClick={close} disabled={busy}>Cancel</button>
                </div>
              </>
            )}

            {why && <p className="phwhy">{why}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
