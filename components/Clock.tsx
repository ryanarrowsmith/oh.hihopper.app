'use client'
import { useEffect, useState } from 'react'

/* Real time from the device, wherever the laptop happens to be. A location's
   time zone is a fact about that office, not about the person reading this. */
export default function Clock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  if (!now) return <div className="clock tnum">&nbsp;</div>
  const h = now.getHours() % 12 || 12
  const m = String(now.getMinutes()).padStart(2, '0')
  return (
    <>
      <div className="clock tnum">{h}:{m}<small>{now.getHours() >= 12 ? 'PM' : 'AM'}</small></div>
      <p className="datel">
        {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
    </>
  )
}
