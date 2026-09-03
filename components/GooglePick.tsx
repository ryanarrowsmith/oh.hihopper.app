'use client'
import { useEffect, useState } from 'react'

/**
 * Choosing a private sheet.
 *
 * This is Google's own picker, not Hopper's, and that is the whole point: with
 * the drive.file scope an app may only open files the person handed it THROUGH
 * this window. So the picker is not a convenience over typing a URL -- it is
 * the act that grants the access, and there is no way to reach a private sheet
 * without it.
 *
 * Which is also why a private report stores a file id rather than an address. A
 * URL somebody pastes means nothing here: the token opens what was picked, not
 * what was named.
 */
declare const google: any
declare const gapi: any

export type Picked = { id: string; name: string }

function load(src: string, ready: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    if (ready()) return resolve()
    const s = document.createElement('script')
    s.src = src; s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(s)
  })
}

export default function GooglePick({ onPick, disabled }: {
  onPick: (p: Picked) => void; disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const key = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  useEffect(() => { setErr(null) }, [disabled])

  if (!key || !id) {
    return (
      <p className="hint">
        Google is not set up on this Hopper yet, so private sheets cannot be picked.
      </p>
    )
  }

  async function open() {
    // Narrowed once, here, rather than relied on from the guard above: the
    // early return proves it to a reader and not to the compiler.
    if (!key || !id) return
    setBusy(true); setErr(null)
    try {
      await load('https://accounts.google.com/gsi/client', () => typeof google !== 'undefined' && !!google?.accounts)
      await load('https://apis.google.com/js/api.js', () => typeof gapi !== 'undefined')
      await new Promise<void>((r) => gapi.load('picker', () => r()))

      // A token for THIS picker window only. Never stored: the lasting
      // permission is the one Hopper already holds, and a second copy of it
      // sitting in a browser is a second thing that can leak.
      const token: string = await new Promise((resolve, reject) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: id,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (r: any) => r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? 'no token')),
        })
        client.requestAccessToken({ prompt: '' })
      })

      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      view.setIncludeFolders(true)
      new google.picker.PickerBuilder()
        .setAppId(id.split('-')[0])
        .setOAuthToken(token)
        .setDeveloperKey(key)
        .addView(view)
        .setCallback((d: any) => {
          if (d[google.picker.Response.ACTION] !== google.picker.Action.PICKED) return
          const doc = d[google.picker.Response.DOCUMENTS]?.[0]
          if (doc) onPick({ id: doc[google.picker.Document.ID], name: doc[google.picker.Document.NAME] })
        })
        .build().setVisible(true)
    } catch (e) {
      setErr((e as Error)?.message === 'popup_closed'
        ? 'The Google window was closed before anything was picked.'
        : 'Hopper could not open the Google picker.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <button className="btn" type="button" disabled={busy || disabled} onClick={open}>
        {busy ? 'Opening Google…' : 'Pick a sheet from Google'}
      </button>
      {err && <p className="note note--err" style={{ marginTop: 10 }}>{err}</p>}
    </>
  )
}
