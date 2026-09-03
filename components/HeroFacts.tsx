'use client'
import { useEffect, useState } from 'react'

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
)

/**
 * The time, the day and the temperature.
 *
 * The clock is live. A time rendered once on the server is wrong within the
 * minute and stays wrong for as long as the tab is open, which is worse than
 * no clock -- so it ticks, and it ticks ON the minute rather than every second:
 * the first wait is however long is left of the current minute, and every wait
 * after it is exactly one. A one-second interval would re-render sixty times to
 * change the display once.
 *
 * Rendered blank on the server and filled on mount, because the server's clock
 * is UTC and a first paint that disagrees with the second is a visible flash of
 * the wrong time.
 */
export default function HeroFacts({ tz, lat, lon }: {
  tz: string | null; lat: number | null; lon: number | null
}) {
  const [now, setNow] = useState<Date | null>(null)
  const [temp, setTemp] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (!live) return
      const d = new Date()
      setNow(d)
      timer = setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()))
    }
    tick()
    return () => { live = false; clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((j) => { if (live && typeof j.f === 'number') setTemp(j.f) })
      .catch(() => { /* the clock and the date stand on their own */ })
    return () => { live = false }
  }, [lat, lon])

  const opts = (o: Intl.DateTimeFormatOptions) => (tz ? { ...o, timeZone: tz } : o)

  return (
    <div className="hxfacts">
      <span className="hxfact">
        {I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}
        <b className="tnum">
          {now ? now.toLocaleTimeString('en-US', opts({ hour: 'numeric', minute: '2-digit' })) : ' '}
        </b>
      </span>
      <span className="hxfact">
        {I('<rect x="3" y="5" width="18" height="16" rx="1.6"/><path d="M3 10h18M8 3v4M16 3v4"/>')}
        <b>
          {now ? now.toLocaleDateString('en-US', opts({ weekday: 'long', month: 'long', day: 'numeric' })) : ' '}
        </b>
      </span>
      {/* No figure, no row. A thermometer with a dash beside it is the page
          telling you it tried, which is not something you asked. */}
      {temp !== null && (
        <span className="hxfact">
          {I('<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v6.5"/>')}
          <b className="tnum">{temp}&deg;</b>
        </span>
      )}
    </div>
  )
}
