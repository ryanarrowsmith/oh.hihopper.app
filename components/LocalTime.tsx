'use client'
import { useEffect, useState } from 'react'

/**
 * The time at an office, not the time where the reader is.
 *
 * Rendered empty on the server and filled on mount: the server's clock is
 * UTC on Vercel, so a time rendered there and hydrated here disagrees with
 * itself for one frame -- and the whole point of this line is that it is the
 * true local time.
 */
export default function LocalTime({ tz }: { tz: string }) {
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const tick = () => {
      try {
        setNow(new Date().toLocaleTimeString('en-US', {
          timeZone: tz, hour: 'numeric', minute: '2-digit',
        }))
      } catch {
        // A time zone the browser does not know is a fact we cannot honour;
        // showing the reader's own clock under an office's name would be a
        // worse answer than showing nothing.
        setNow(null)
      }
    }
    tick()
    const t = setInterval(tick, 20_000)
    return () => clearInterval(t)
  }, [tz])

  return <span className="tnum">{now ?? '—'}</span>
}
