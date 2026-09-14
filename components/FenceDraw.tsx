'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  viewAround, toPixel, toLngLat, feetPerPixel, lineFeet, corners,
  type LngLat, type View,
} from '@/lib/geo'
import { saveRuns } from '@/app/actions/fence'

/**
 * Drawing a fence line on an aerial, with a thumb.
 *
 * Everything here is decided by the phone case. A salesperson stands in a yard
 * and traces the line on the photograph; the desk version is the same screen
 * with more room, not a different one.
 *
 * The four decisions that matter:
 *
 * TWO MODES, SAID OUT LOUD. One finger cannot both draw and pan. Every
 * map-drawing tool that tries to guess which you meant gets it wrong at the edge
 * of the picture, which is exactly where a fence line goes. So there is a Draw
 * mode and a Move mode, a control that says which, and no gesture that means two
 * things.
 *
 * NO PINCH. Zoom is a pair of buttons and a figure in feet, because pinch on a
 * surface that also drags points is how you end up with a vertex dropped in the
 * neighbour's yard. Feet-across is also the honest unit: it is what the scale bar
 * states and what the lengths are measured in.
 *
 * THE HANDLES ARE BIGGER THAN THEY LOOK. A 9px dot with a 24px invisible target
 * round it. A fingertip is about 40px across and a vertex you cannot grab is a
 * vertex you delete and re-place.
 *
 * THE BOX IS MEASURED, NOT ASSUMED. The image's real rendered size comes from a
 * ResizeObserver and the view is rebuilt from it. A layout that reports one width
 * and paints another is how a takeoff comes out 20% short — and it is not
 * visible, because the picture and the line agree with each other either way.
 */

type Run = {
  id?: string; label: string; points: LngLat[]; closed: boolean
  grade: number | null
  /** A length somebody measured on the ground. Beats the drawing when both
   *  exist, and is the only way to record a run on a keyboard. */
  typed: number | null
}
type Saved = 'clean' | 'dirty' | 'saving' | 'failed'

/* MORE RUNGS, NOT A SLIDER. Ryan's call, 14 Sep: it was hard to get the frame
   you wanted because five steps doubled every time -- 250 to 500 is a different
   property. Eleven steps move about 40% each, which is a press you can aim. */
const SPANS = [40, 60, 80, 120, 175, 250, 350, 500, 700, 1000, 1500]
const TAP = 8          // px of travel that still counts as a tap, not a drag

/* THE PICTURE IS BIGGER THAN THE WINDOW.
   A tile cut to the exact size of the frame has nothing outside it, so dragging
   it pulls a blank margin into view and you are moving toward emptiness -- you
   cannot see where you are going until you let go and the next one arrives.
   Asking for 1.8x the frame and hanging the extra off every edge means the
   ground you are dragging toward is ALREADY THERE: 40% of a frame in every
   direction, which is further than one drag goes. */
const PAD = 1.8

const ft = (n: number) =>
  n >= 1000 ? `${Math.round(n).toLocaleString('en-US')} ft` : `${Math.round(n)} ft`

export default function FenceDraw({
  jobId, centre, runs: initial, mayEdit,
}: {
  jobId: string
  centre: LngLat
  runs: Run[]
  mayEdit: boolean
}) {
  const [runs, setRuns] = useState<Run[]>(
    initial.length ? initial
      : [{ label: 'Run 1', points: [], closed: false, grade: null, typed: null }])
  const [active, setActive] = useState(0)
  /* FRAME IT, THEN DRAW ON IT. Ryan's design, 14 Sep, after three goes at
     making one surface do both.
     A drag meant two things and the surface had to guess which, and every fix
     for the panning made the drawing worse. So they are two steps now. FRAMING
     is a live map: drag it, zoom it, get the property in the window. Pressing
     "Use this view" FREEZES it -- from then on the picture does not move at
     all, a tap is always a point, and there is no snapping back because there
     is nothing left to snap.
     A job with a line already drawn opens framed: that view was settled the
     first time and reopening is for editing the line, not the frame. */
  const [framed, setFramed] = useState(initial.some((r) => r.points.length > 0))
  const mode: 'draw' | 'move' = framed ? 'draw' : 'move'
  const [span, setSpan] = useState(250)
  const [at, setAt] = useState<LngLat>(centre)
  const [picked, setPicked] = useState<number | null>(null)
  /* NO SNAP BACK AT THE END OF A PAN. Ryan's call, 14 Sep -- it jerked, and you
     could not tell where you were going to land.
     The old shape committed the new centre on release and dropped the offset in
     the same breath, so the aerial sprang back to where it started and stayed
     there until the new tile arrived, then jumped again. Two pieces fix it: the
     picture that is actually ON SCREEN is tracked separately from the one being
     asked for, and the offset it needs is HELD until the new one has loaded.
     The ink does not hold anything -- it is drawn against the live view, so it
     is already correct the instant the centre moves. */
  const [shown, setShown] = useState<string | null>(null)
  const [hold, setHold] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

  const [state, setState] = useState<Saved>('clean')
  const [why, setWhy] = useState<string | null>(null)

  // The box, as actually painted.
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view: View | null = useMemo(
    () => (size && size.w > 0 ? viewAround(at, span, size.w, size.h) : null),
    [at, span, size])

  /* The aerial, a frame and a bit wide. Whole pixels and six decimals, so
     panning back to where you were asks for a picture the browser already has.
     The box is PAD times the frame around the same centre at the same ground
     resolution, so what hangs off the edges is real ground rather than nothing. */
  const pad = framed ? 1 : PAD
  const src = useMemo(() => {
    if (!view || !size) return null
    const ox = (size.w * (pad - 1)) / 2
    const oy = (size.h * (pad - 1)) / 2
    const sw = toLngLat(view, -ox, size.h + oy), ne = toLngLat(view, size.w + ox, -oy)
    const q = new URLSearchParams({
      w: sw[0].toFixed(6), s: sw[1].toFixed(6),
      e: ne[0].toFixed(6), n: ne[1].toFixed(6),
      px: String(Math.round(size.w * pad)), py: String(Math.round(size.h * pad)),
    })
    return `/api/aerial?${q}`
  }, [view, size, pad])

  /* What the picture on screen is worth relative to the one being asked for.
     A zoom swaps the tile; scaling the old one by the ratio in the meantime
     means the press does something instantly instead of waiting on a fetch. */
  const [shownSpan, setShownSpan] = useState(span)
  const zoomScale = shownSpan / span

  // Load the next aerial off-screen and only swap when it is ready, so there is
  // never a frame with nothing in it.
  useEffect(() => {
    if (!src) return
    if (src === shown) return
    let gone = false
    const im = new Image()
    const done = () => {
      if (gone) return
      setShown(src); setHold({ dx: 0, dy: 0 }); setShownSpan(span)
    }
    im.onload = done
    im.onerror = done
    im.src = src
    return () => { gone = true }
  }, [src, shown, span])

  const set = (fn: (r: Run[]) => Run[]) => {
    setRuns((old) => fn(old))
    setState('dirty')
  }

  // ---------------------------------------------------------------- pointers
  const drag = useRef<{ kind: 'vertex' | 'pan' | 'tap'; i?: number
                        x: number; y: number; moved: boolean
                        from: LngLat } | null>(null)
  const [nudge, setNudge] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

  const local = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  const onDown = (e: React.PointerEvent) => {
    if (!mayEdit || !view) return
    // One finger only. A second one means the person meant to pinch, and this
    // surface does not pinch — better to do nothing than to drop a point.
    if (!e.isPrimary) return
    const [x, y] = local(e)
    box.current?.setPointerCapture(e.pointerId)
    drag.current = {
      kind: framed ? 'tap' : 'pan',
      x, y, moved: false, from: at,
    }
  }

  const onDownVertex = (i: number) => (e: React.PointerEvent) => {
    if (!mayEdit || !view || !e.isPrimary || !framed) return
    e.stopPropagation()
    const [x, y] = local(e)
    box.current?.setPointerCapture(e.pointerId)
    drag.current = { kind: 'vertex', i, x, y, moved: false, from: at }
    setPicked(i)
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !view || !e.isPrimary) return
    const [x, y] = local(e)
    if (!d.moved && Math.hypot(x - d.x, y - d.y) < TAP) return
    d.moved = true

    if (d.kind === 'vertex' && d.i !== undefined) {
      const p = toLngLat(view, x, y)
      set((old) => old.map((r, ri) => ri !== active ? r
        : { ...r, points: r.points.map((q, qi) => (qi === d.i ? p : q)) }))
    } else if (d.kind === 'pan') {
      // The picture slides under the finger and the new centre is committed on
      // release, so panning does not fetch an image per frame.
      setNudge({ dx: x - d.x, dy: y - d.y })
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || !view) return

    if (d.kind === 'pan' && d.moved) {
      const mid = toLngLat(view, view.w / 2 - nudge.dx, view.h / 2 - nudge.dy)
      // The centre moves now; the picture keeps the offset it is already drawn
      // at until the tile for the new centre has loaded.
      setHold({ dx: hold.dx + nudge.dx, dy: hold.dy + nudge.dy })
      setNudge({ dx: 0, dy: 0 })
      setAt(mid)
      return
    }
    setNudge({ dx: 0, dy: 0 })

    if (d.kind === 'tap' && !d.moved && framed) {
      const [x, y] = local(e)
      const p = toLngLat(view, x, y)
      set((old) => old.map((r, ri) => ri !== active ? r : { ...r, points: [...r.points, p] }))
      setPicked(null)
    }
  }

  // ----------------------------------------------------------------- editing
  const cur = runs[active] ?? runs[0]
  const undo = () => set((old) => old.map((r, ri) =>
    ri !== active ? r : { ...r, points: r.points.slice(0, -1) }))
  const clear = () => { set((old) => old.map((r, ri) =>
    ri !== active ? r : { ...r, points: [] })); setPicked(null) }
  const drop = () => {
    if (picked === null) return
    set((old) => old.map((r, ri) => ri !== active ? r
      : { ...r, points: r.points.filter((_, qi) => qi !== picked) }))
    setPicked(null)
  }
  const separate = () => {
    set((old) => [...old,
      { label: `Run ${old.length + 1}`, points: [], closed: false, grade: null, typed: null }])
    setActive(runs.length)
    setPicked(null)
  }
  const loop = () => set((old) => old.map((r, ri) =>
    ri !== active ? r : { ...r, closed: !r.closed }))
  const typed = (v: string) => {
    const n = v.trim() === '' ? null : Number(v)
    set((old) => old.map((r, ri) => ri !== active ? r
      : { ...r, typed: Number.isFinite(n as number) && (n as number) > 0 ? (n as number) : null }))
  }
  const grade = (v: string) => {
    const n = v.trim() === '' ? null : Number(v)
    set((old) => old.map((r, ri) => ri !== active ? r
      : { ...r, grade: Number.isFinite(n as number) ? (n as number) : null }))
  }

  /** What a run measures: what somebody walked, or failing that what was drawn. */
  const runFt = (r: Run) => (r.typed && r.typed > 0 ? r.typed : lineFeet(r.points, r.closed))
  const total = runs.reduce((s, r) => s + runFt(r), 0)
  const drawn = runs.filter((r) => r.points.length >= 2).length

  const save = useCallback(async () => {
    setState('saving'); setWhy(null)
    // A run gets its id here, on its first save, rather than when it is created:
    // this component renders on the server first, and an id made during that
    // render is a different id from the one the browser would make.
    const withIds = runs.map((r) => ({ ...r, id: r.id ?? crypto.randomUUID() }))
    setRuns(withIds)

    const form = new FormData()
    form.set('job_id', jobId)
    form.set('runs', JSON.stringify(withIds.map((r, i) => ({
      id: r.id, label: r.label || `Run ${i + 1}`,
      points: r.points, closed: r.closed, grade: r.grade,
      plan_ft: Math.round(runFt(r) * 10) / 10,
      // A typed figure is a measurement, and the estimator says which it was
      // rather than letting a number off a photograph pass for one off a wheel.
      measured_by: r.typed && r.typed > 0 ? 'typed' : r.points.length >= 2 ? 'aerial' : null,
      sort: i,
    }))))
    const res = await saveRuns(null, form)
    if (res.ok) setState('clean')
    else { setState('failed'); setWhy(res.message) }
  }, [jobId, runs])

  // A drawn line is worth keeping even if somebody closes the tab, but a save on
  // every tap is a write per point. Two seconds after the last change.
  useEffect(() => {
    if (state !== 'dirty' || !mayEdit) return
    const t = setTimeout(() => { void save() }, 2000)
    return () => clearTimeout(t)
  }, [state, save, mayEdit])

  const fpp = view ? feetPerPixel(view) : 1
  // A bar of a round number of feet, as close to a third of the width as one
  // gets. A scale bar of "87 ft" is a scale bar nobody can use.
  const barFt = useMemo(() => {
    if (!view) return 0
    const want = (view.w / 3) * fpp
    const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
    return steps.reduce((best, s) => (Math.abs(s - want) < Math.abs(best - want) ? s : best), 5)
  }, [view, fpp])

  return (
    <div className="fxdraw">
      <div className="fxsurface">
        <div
          ref={box}
          className={`fxbox fxbox--${mode}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* The picture sits in a box of its own so the oversize is one thing
              and the photograph filling it is another. Putting the percentages
              on the <img> itself put them in the same declaration as object-fit
              and left too much to work out. */}
          {(shown ?? src) && (
            <div className="fxaerial"
                 style={{
                   left: `${(1 - pad) * 50}%`, top: `${(1 - pad) * 50}%`,
                   width: `${pad * 100}%`, height: `${pad * 100}%`,
                   transform: `translate(${nudge.dx + hold.dx}px, ${nudge.dy + hold.dy}px)`
                     + (zoomScale !== 1 ? ` scale(${zoomScale})` : ''),
                 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={(shown ?? src) as string} alt="Aerial of the site" />
            </div>
          )}

          {view && size && (
            <svg className="fxink" viewBox={`0 0 ${size.w} ${size.h}`}
                 style={{ transform: `translate(${nudge.dx}px, ${nudge.dy}px)` }}
                 aria-hidden="true">
              {runs.map((r, ri) => {
                if (r.points.length === 0) return null
                const pts = r.points.map((p) => toPixel(view, p))
                const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
                  .join(' ') + (r.closed && pts.length > 2 ? ' Z' : '')
                return (
                  <g key={ri} className={ri === active ? 'fxrun is-on' : 'fxrun'}>
                    <path className="fxline__under" d={d} />
                    <path className="fxline" d={d} />
                    {/* The length sits on the line's longest leg rather than at
                        its end, where two runs meeting would stack two labels. */}
                    {r.points.length >= 2 && (() => {
                      let best = 0, bi = 0
                      for (let i = 1; i < pts.length; i++) {
                        const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
                        if (l > best) { best = l; bi = i }
                      }
                      const mx = (pts[bi][0] + pts[bi - 1][0]) / 2
                      const my = (pts[bi][1] + pts[bi - 1][1]) / 2
                      const label = `${r.label} · ${ft(runFt(r))}`
                      return <>
                        <rect className="fxtag__bg" x={mx - label.length * 3.6} y={my - 20}
                              width={label.length * 7.2} height={17} rx={0} />
                        <text className="fxtag" x={mx} y={my - 7.5}>{label}</text>
                      </>
                    })()}
                  </g>
                )
              })}

              {/* Handles last, so they sit over every line and are grabbable
                  where two runs cross. Only the active run's are draggable —
                  dragging a vertex of the run you are not on is always a
                  mistake. */}
              {cur && cur.points.map((p, i) => {
                const [x, y] = toPixel(view, p)
                return (
                  <g key={i} className={`fxvert${picked === i ? ' is-picked' : ''}`}
                     onPointerDown={onDownVertex(i)}>
                    <circle className="fxvert__grab" cx={x} cy={y} r={24} />
                    <circle className="fxvert__dot" cx={x} cy={y} r={picked === i ? 8 : 6} />
                  </g>
                )
              })}
            </svg>
          )}

          <div className="fxscale" aria-hidden="true">
            <span className="fxscale__bar" style={{ width: `${barFt / fpp}px` }} />
            <b>{ft(barFt)}</b>
          </div>

          {!src && <p className="fxnomap">No aerial for this job yet.</p>}
        </div>
      </div>

      {/* One strip, under the plan, holding every drawing control. Nothing that
          changes the line lives anywhere else on the screen. */}
      <div className="fxstrip">
        {!framed ? (
          <>
            <button type="button" className="btn btn--amber" onClick={() => setFramed(true)}>
              <Pen />Use this view
            </button>
            <div className="fxzoom" role="group" aria-label="How much ground is in view">
              <button type="button" aria-label="Closer"
                      disabled={SPANS.indexOf(span) <= 0}
                      onClick={() => setSpan(SPANS[Math.max(0, SPANS.indexOf(span) - 1)])}>
                <Minus /></button>
              <b>{ft(span)} across</b>
              <button type="button" aria-label="Wider"
                      disabled={SPANS.indexOf(span) >= SPANS.length - 1}
                      onClick={() => setSpan(SPANS[Math.min(SPANS.length - 1, SPANS.indexOf(span) + 1)])}>
                <Plus /></button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn--quiet" onClick={() => setFramed(false)}>
            <Hand />Change the view
          </button>
        )}

        {mayEdit && framed && (
          <div className="fxacts">
            <button type="button" onClick={undo} disabled={!cur?.points.length}>
              <Undo />Undo</button>
            <button type="button" onClick={drop} disabled={picked === null}>
              <Cross />Remove point</button>
            <button type="button" onClick={loop} aria-pressed={!!cur?.closed}
                    className={cur?.closed ? 'is-on' : ''} disabled={(cur?.points.length ?? 0) < 3}>
              <Loop />Closed loop</button>
            <button type="button" onClick={separate}>
              <Split />Separate run</button>
            <button type="button" onClick={clear} disabled={!cur?.points.length}>
              <Bin />Clear this run</button>
          </div>
        )}
      </div>

      {/* Which run is being drawn, what each one measures, and the one number
          the estimate is built on. */}
      <div className="fxruns">
        {runs.map((r, i) => (
          <button key={i} type="button" className={`fxrunchip${i === active ? ' is-on' : ''}`}
                  onClick={() => { setActive(i); setPicked(null) }}>
            <b>{r.label}</b>
            <span>{runFt(r) > 0 ? ft(runFt(r)) : 'nothing drawn'}</span>
          </button>
        ))}
      </div>

      <div className="fxsum">
        <div className="fxsum__big">
          <b>{ft(total)}</b>
          <span>{drawn === 0 ? 'nothing measured yet'
            : `${drawn} run${drawn === 1 ? '' : 's'} · ${runs.reduce((s, r) => s + corners(r.points, r.closed), 0)} corners`}</span>
        </div>
        {mayEdit && (
          <label className="fxgrade">
            {/* Also the keyboard path onto this screen. Drawing needs a pointer;
                a length does not, and a run measured with a wheel at the survey
                arrives this way too. */}
            <span>Measured length of {cur?.label ?? 'this run'}, ft</span>
            <input className="field" inputMode="decimal" value={cur?.typed ?? ''}
                   onChange={(e) => typed(e.target.value)} placeholder="off the drawing" />
            <small>Fill this in and it beats the drawing — a wheel beats a photograph.</small>
          </label>
        )}
        {mayEdit && (
          <label className="fxgrade">
            <span>Grade on {cur?.label ?? 'this run'}, %</span>
            <input className="field" inputMode="decimal" value={cur?.grade ?? ''}
                   onChange={(e) => grade(e.target.value)} placeholder="0" />
            <small>Confirmed at the survey. An aerial cannot read a slope.</small>
          </label>
        )}
        <p className={`fxsaved fxsaved--${state}`}>
          {state === 'clean' ? 'Saved'
            : state === 'saving' ? 'Saving…'
            : state === 'failed' ? (why ?? 'Not saved')
            : 'Not saved yet'}
          {state === 'dirty' && mayEdit && (
            <button type="button" className="lnk" onClick={() => void save()}>Save now</button>
          )}
        </p>
      </div>
    </div>
  )
}

/* Marks, not words on buttons that already have words. Each one is the thing it
   does rather than a letter standing for it. */
const I = (d: string) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
       dangerouslySetInnerHTML={{ __html: d }} />
)
const Pen = () => I('<path d="M11.2 2.4l2.4 2.4L5.6 12.8 2.4 13.6l.8-3.2z"/>')
const Hand = () => I('<path d="M8 14V6M8 6V3.2a1.2 1.2 0 0 1 2.4 0V8M10.4 7.2a1.2 1.2 0 0 1 2.4 0v3.6a3.6 3.6 0 0 1-3.6 3.6H7.2L3.6 11"/>')
const Minus = () => I('<path d="M3.5 8h9"/>')
const Plus = () => I('<path d="M8 3.5v9M3.5 8h9"/>')
const Undo = () => I('<path d="M3 8h7.5a2.5 2.5 0 0 1 0 5H7"/><path d="M5.5 5.5L3 8l2.5 2.5"/>')
const Cross = () => I('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>')
const Loop = () => I('<rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1"/>')
const Split = () => I('<path d="M3 13L7 7M9 9l4-6"/><circle cx="7" cy="7" r="1.3"/><circle cx="9" cy="9" r="1.3"/>')
const Bin = () => I('<path d="M3.5 5h9M6 5V3.5h4V5M5 5l.6 8h4.8L11 5"/>')
