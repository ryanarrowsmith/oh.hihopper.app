'use client'
import { useEffect } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { setEntityActive, updateEntity } from '@/app/actions/admin'

/**
 * The quick change, in the row.
 *
 * The list is one line per organization and the name is the way deeper, so the
 * two things somebody changes often -- what it is called, and whether it is
 * still trading -- happen here, and everything else happens on the
 * organization's own page. A screen where renaming something costs two
 * navigations is a screen where nothing gets renamed.
 *
 * The opening is a hidden checkbox, like the branch and the locations drawer
 * beside it: the tree's CSS reaches its row with sibling selectors, so a React
 * wrapper around that row would take five rules down with it. Which leaves this
 * component one imperative job -- unticking the box when the save worked,
 * because saving an edit returns you to the read version.
 */
function Go({ label, busy, bad }: { label: string; busy: string; bad?: boolean }) {
  const { pending } = useFormStatus()
  return <button className={`btn btn--sm ${bad ? 'btn--bad' : 'btn--amber'}`}
                 type="submit" disabled={pending}>{pending ? busy : label}</button>
}

function shut(boxId: string) {
  const box = document.getElementById(boxId)
  if (box instanceof HTMLInputElement) box.checked = false
}

export default function OrgEdit({ e, boxId }: { e: any; boxId: string }) {
  const [saved, save] = useFormState(updateEntity, null)
  const [flipped, flip] = useFormState(setEntityActive, null)
  const off = e.status === 'inactive'

  useEffect(() => { if (saved?.ok) shut(boxId) }, [saved, boxId])
  useEffect(() => { if (flipped?.ok) shut(boxId) }, [flipped, boxId])

  return (
    <div className="oedit"><div><div className="oedit__in">
      <div className="rrec__lab">Editing {e.name}</div>
      <form action={save}>
        {/* updateEntity writes every column it is given, so the ones this row
            does not show have to travel with it or they are cleared. */}
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="legal_name" value={e.legal_name ?? ''} />
        <input type="hidden" name="logo_url" value={e.logo_url ?? ''} />
        <input type="hidden" name="status" value={e.status ?? 'setup'} />
        <div className="formrow">
          <div><label htmlFor={`on-${e.id}`}>Name</label>
            <input className="field" id={`on-${e.id}`} name="name"
                   defaultValue={e.name} required /></div>
          <div><label htmlFor={`om-${e.id}`}>Mark</label>
            <input className="field" id={`om-${e.id}`} name="mark" maxLength={4}
                   defaultValue={e.mark ?? ''} placeholder="LU" /></div>
        </div>
        {saved && !saved.ok && <p className="note note--err">{saved.message}</p>}
        <div className="rowacts">
          <Go label="Save" busy="Saving…" />
          <button className="lnk" type="button" onClick={() => shut(boxId)}>Cancel</button>
          <a className="lnk lnk--go" href={`/admin/organizations/${e.id}`}
             style={{ color: 'var(--ink-3)' }}>Everything else about it →</a>
        </div>
      </form>

      {/* Its own form on purpose. Retiring a branch is not a field, and it is
          not a thing to reach by pressing Enter in a text box. */}
      <form action={flip} className="oedit__d">
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="active" value={off ? 'true' : 'false'} />
        <Go label={off ? 'Bring it back' : 'Retire it'}
            busy={off ? 'Bringing it back…' : 'Retiring…'} bad={!off} />
        <span className="fine">
          {off
            ? 'It starts being offered again, along with everything under it.'
            : 'Nothing is deleted. It stops being offered, and everything beneath it is '
              + 'retired with it — a live business under a closed one is how somebody files '
              + 'a person into a company that shut last year.'}
        </span>
      </form>
      {flipped && !flipped.ok && <p className="note note--err">{flipped.message}</p>}
    </div></div></div>
  )
}
