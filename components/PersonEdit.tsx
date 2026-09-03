'use client'
import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import Choice from '@/components/Choice'
import GetToKnowFields, { type Answers } from '@/components/GetToKnowFields'
import Favorites, { type Profile } from '@/components/Favorites'
import { PlaceMark, PersonMark, Pencil } from '@/components/Icons'
import { savePersonCard } from '@/app/actions/person'

export type Named = { id: string; name: string; entityId?: string | null }

/**
 * A person's page, read and written.
 *
 * One pencil. It used to be two -- the photograph had its own hover control on
 * the badge and "Get to know me" had its own pencil a hand's width below, and
 * between them there was no way at all to correct a telephone number. Ryan:
 * "1 plus their fun about me stuff. Edit the same screen."
 *
 * So the whole page is one form. The details take the place of the facts list
 * beside the badge, row for row, in the same two columns -- editing in place,
 * so nothing moves and you keep your eye on the thing you are changing. The
 * answers keep their own panel below, where they already lived, and Save is at
 * the foot because it is the foot of one form.
 *
 * What a person may change about themselves is not decided here. hopper.person
 * has two write policies and a trigger that pins the columns a self-editor may
 * not touch, so this renders the fields somebody may fill in and the database
 * is what says no. The screen and the policy agreeing is a convenience; the
 * policy is the rule.
 */
export default function PersonEdit({
  badge, personId, mine, mayEdit, hasLogin, heading,
  name, role, phone, email, entityId, departmentId, locationId, managerId,
  departmentName, locationName, managerName, entityName,
  orgs, departments, locations, people, answers, profile, mapSrc,
}: {
  /* The badge is passed in rather than built here: it is a server component's
     job (the photo control needs no state) and it has to sit inside .idw
     beside these fields, which is a box this component owns. */
  badge: React.ReactNode
  personId: string; mine: boolean; mayEdit: boolean; hasLogin: boolean; heading: string
  name: string; role: string | null; phone: string | null; email: string | null
  entityId: string | null; departmentId: string | null
  locationId: string | null; managerId: string | null
  departmentName: string | null; locationName: string | null
  managerName: string | null; entityName: string | null
  orgs: Named[]; departments: Named[]; locations: Named[]; people: Named[]
  answers: Answers; profile: Profile; mapSrc: string | null
}) {
  const [open, setOpen] = useState(false)
  const [state, run] = useFormState(savePersonCard, null)
  // Closes because the save worked, never because a button was pressed.
  useEffect(() => { if (state?.ok) setOpen(false) }, [state])

  // Where they sit decides what may be offered under them: a department in
  // another business is not a department this person can be in.
  const [org, setOrg] = useState(entityId ?? '')
  const under = (list: Named[]) =>
    list.filter((x) => !org || !x.entityId || x.entityId === org)

  // An administrator may change where somebody sits. A person may not file
  // themselves into another department, and the trigger says so too.
  const full = mayEdit && !mine

  if (!open) {
    return (
      <>
        <div className="idw">
        {badge}
        <div className="idcol">
          {(mayEdit || mine) && (
            <div className="idacts">
              <button className="rpen" type="button" data-tip="Edit this page"
                      aria-label="Edit this page" onClick={() => setOpen(true)}>
                <Pencil />
              </button>
            </div>
          )}
          <Facts {...{ departmentName, locationName, managerName, managerId,
                       entityId, locationId, email, phone }} />
        </div>
        </div>
        <Rest heading={heading} profile={profile} mapSrc={mapSrc} />
      </>
    )
  }

  return (
    <form action={run} className="idform">
      <div className="idw">
      {badge}
      <div className="idcol">
        <div className="idacts">
          <button className="rpen is-on" type="button" data-tip="Stop editing"
                  aria-label="Stop editing" onClick={() => setOpen(false)}><Pencil /></button>
        </div>
        <input type="hidden" name="person_id" value={personId} />

        <dl className="idfacts idfacts--edit">
          <div>
            <dt><label htmlFor="pf-name">Name</label></dt>
            <dd><input className="field" id="pf-name" name="full_name"
                       defaultValue={name} required /></dd>
          </div>
          {full && (
            <div>
              <dt><label htmlFor="pf-role">Role</label></dt>
              <dd><input className="field" id="pf-role" name="role_title"
                         defaultValue={role ?? ''} placeholder="Dispatcher" /></dd>
            </div>
          )}
          {full && (
            <div>
              <dt><label htmlFor="pf-org">Organization</label></dt>
              <dd><Choice id="pf-org" name="entity_id" defaultValue={entityId ?? ''}
                          placeholder="None" onPick={setOrg}
                          options={[{ value: '', label: 'None' },
                                    ...orgs.map((o) => ({ value: o.id, label: o.name }))]} /></dd>
            </div>
          )}
          {full && (
            <div>
              <dt><label htmlFor="pf-dept">Department</label></dt>
              <dd><Choice id="pf-dept" name="department_id" defaultValue={departmentId ?? ''}
                          placeholder="None"
                          options={[{ value: '', label: 'None' },
                                    ...under(departments).map((d) => ({ value: d.id, label: d.name }))]} /></dd>
            </div>
          )}
          {full && (
            <div>
              <dt><label htmlFor="pf-loc">Office</label></dt>
              <dd><Choice id="pf-loc" name="location_id" defaultValue={locationId ?? ''}
                          placeholder="None"
                          options={[{ value: '', label: 'None' },
                                    ...under(locations).map((l) => ({ value: l.id, label: l.name }))]} /></dd>
            </div>
          )}
          {full && (
            <div>
              <dt><label htmlFor="pf-mgr">Manager</label></dt>
              <dd><Choice id="pf-mgr" name="manager_id" defaultValue={managerId ?? ''}
                          placeholder="Nobody"
                          options={[{ value: '', label: 'Nobody' },
                                    ...people.filter((p) => p.id !== personId)
                                      .map((p) => ({ value: p.id, label: p.name }))]} /></dd>
            </div>
          )}
          <div>
            <dt><label htmlFor="pf-phone">Phone</label></dt>
            <dd><input className="field" id="pf-phone" name="phone" type="tel"
                       defaultValue={phone ?? ''} placeholder="None on file" /></dd>
          </div>
          {!full && (
            <>
              <div><dt>Department</dt>
                <dd>{departmentName ?? <span className="muted">None</span>}</dd></div>
              <div><dt>Office</dt>
                <dd>{locationName ?? <span className="muted">None</span>}</dd></div>
            </>
          )}
        </dl>

        <div className="idfoot"><div>
          <p className="idsay">
            {/* The photograph is on the badge and always has been -- saying so
                beats adding a second control for the same file. */}
            The photograph is changed on the badge itself.{' '}
            {mine
              ? 'Your role, department and office are set by whoever administers your '
                + 'organization — ask them and it is a click.'
              : hasLogin
                ? `${name.split(' ')[0]} signs in, so the name shown across Hopper is the one on `
                  + 'their own Oh hi account. This is the roster’s copy of it.'
                : 'They have no login, so this is the only name they have.'}
          </p>
        </div></div>
      </div>
      </div>

      <div className="gtkm">
        <div className="gtkm__h"><h3>{heading}</h3><span className="rule" /></div>
        <div className="gedit is-open"><div className="gedit__clip"><div className="gedit__p">
          <GetToKnowFields answers={answers} />
          {state && !state.ok && <p className="formerr">{state.message}</p>}
          <div className="rowacts">
            <Save />
            <button className="lnk" type="button" onClick={() => setOpen(false)}>Cancel</button>
            {!mine && (
              <span className="fine">
                You are editing somebody else because you administer their organization.
              </span>
            )}
          </div>
        </div></div></div>
      </div>
    </form>
  )
}

function Save() {
  const { pending } = useFormStatus()
  return (
    <button className="btn btn--amber" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save'}
    </button>
  )
}

/** The facts as they read. Beside the card, on the canvas -- a badge carrying
 *  working controls would be furniture and a button at the same time. */
function Facts({ departmentName, locationName, managerName, managerId, entityId,
                 locationId, email, phone }: {
  departmentName: string | null; locationName: string | null
  managerName: string | null; managerId: string | null
  entityId: string | null; locationId: string | null
  email: string | null; phone: string | null
}) {
  const tel = phone ? phone.replace(/[^\d+]/g, '') : null
  return (
    <dl className="idfacts">
      <div>
        <dt>Department</dt>
        <dd>{departmentName ?? <span className="muted">None</span>}</dd>
      </div>
      <div>
        <dt>Office</dt>
        <dd>
          {locationName
            ? (locationId && entityId
                ? <Link href={`/admin/organizations/${entityId}/locations/${locationId}`}>
                    <PlaceMark />{locationName}
                  </Link>
                : <><PlaceMark />{locationName}</>)
            : <span className="muted">None</span>}
        </dd>
      </div>
      {/* The manager is fetched through the directory rather than joined into
          it, so RLS answers: somebody whose manager this viewer may not see
          gets no row at all, not a name they were not meant to have. */}
      <div>
        <dt>Manager</dt>
        <dd>
          {managerName && managerId
            ? <Link href={`/people/${managerId}`}><PersonMark />{managerName}</Link>
            : <span className="muted">None</span>}
        </dd>
      </div>
      {/* An address is not worth reading -- it is worth clicking, and a long one
          wrecks a narrow column. A telephone number is different: it is short,
          and it is the one contact detail people still copy down or say out
          loud, so it shows itself. */}
      {email && (
        <div>
          <dt>Email</dt>
          <dd><a href={`mailto:${email}`} title={email}>Click here</a></dd>
        </div>
      )}
      {tel && (
        <div>
          <dt>Phone</dt>
          <dd><a href={`tel:${tel}`}>{phone}</a></dd>
        </div>
      )}
    </dl>
  )
}

/** The read half of everything below the badge. */
function Rest({ heading, profile, mapSrc }: {
  heading: string; profile: Profile; mapSrc: string | null
}) {
  return (
    <div className="gtkm">
      <div className="gtkm__h"><h3>{heading}</h3><span className="rule" /></div>
      <Favorites p={profile} mapSrc={mapSrc} />
    </div>
  )
}
