'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { autoDraftSow } from '@/app/actions/fence'

/**
 * Asks for the first draft as the page settles, once.
 *
 * The ref guards a double mount; the row's drafted_at guards everything else,
 * so this can only ever spend one draft per job however many times it fires.
 * When it cannot -- nothing measured yet, no key, the model refusing -- it says
 * so and leaves the buttons above to a person.
 */
export default function SowAutoDraft({ jobId }: { jobId: string }) {
  const router = useRouter()
  const went = useRef(false)
  const [say, setSay] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (went.current) return
    went.current = true
    autoDraftSow(jobId)
      .then((r) => {
        setBusy(false)
        if (r.ok) router.refresh()
        else setSay(r.message)
      })
      .catch(() => {
        setBusy(false)
        setSay('The first draft could not be written. The buttons above still work.')
      })
  }, [jobId, router])

  if (busy) return <p className="note" style={{ marginTop: 16 }}>Writing the first draft…</p>
  if (!say) return null
  return <p className="note note--err" style={{ marginTop: 16 }}>{say}</p>
}
