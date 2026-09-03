import Link from 'next/link'
import PhotoUpload from '@/components/PhotoUpload'
import { OrgMark, PlaceMark } from '@/components/Icons'

/**
 * A person's file.
 *
 * The name was on the page twice -- once as the page heading and again on the
 * card beneath it, six inches apart and in two different sizes. The fix is not
 * to delete one of them but to decide which object the name belongs to, and on
 * a folder the answer has been settled since 1898: it goes on the tab. So the
 * tab IS the heading, the folder is the card, and there is one of each.
 *
 * Everything else follows from the metaphor rather than decorating it. The
 * photograph is stapled to the front, because that is where a photograph goes
 * on a file and because a print at an angle is unmistakably a physical object
 * on top of another one -- no border or shadow needed to say "this is above
 * that". Role, department and organization are ruled off from each other like
 * the lines on the card inside. The two things you actually came to do --
 * write to them, ring them -- are buttons at the foot rather than two more
 * lines of small text, because an address is not an action.
 *
 * It is manilla and not paper because everything else in Hopper is paper. A
 * person is the one record here that is about somebody rather than about the
 * business, and it should not look like the reports.
 */
type Person = {
  id: string
  full_name: string
  photo_url: string | null
  role_name: string | null
  department_name: string | null
  entity_id: string | null
  entity_name: string | null
  location_id: string | null
  location_name: string | null
  is_me: boolean | null
}

export default function PersonFolder(
  { d, email, phone }: { d: Person; email: string | null; phone: string | null },
) {
  const tel = phone ? phone.replace(/[^\d+]/g, '') : null

  return (
    <div className="folder">
      <div className="folder__tab"><h1>{d.full_name}</h1></div>

      <div className="folder__b">
        <span className="folder__paper" aria-hidden="true" />
        <div className="stapled">
          {/* The staple is drawn over the corner of the print, half on it and
              half on the folder, which is the whole of the trick. */}
          <PhotoUpload personId={d.id} name={d.full_name} src={d.photo_url}
                       mine={!!d.is_me} />
          {/* A corner staple, driven at 45 degrees the way a real one is, half
              on the print and half in the folder. Two paths: the dark one is
              the shadow it presses into the paper, the light one is the wire. */}
          <svg className="staple" viewBox="0 0 44 18" aria-hidden="true">
            <path className="staple__s" d="M4 15V6.5A2.5 2.5 0 0 1 6.5 4h31A2.5 2.5 0 0 1 40 6.5V15" />
            <path className="staple__w" d="M4 14V5.5A2.5 2.5 0 0 1 6.5 3h31A2.5 2.5 0 0 1 40 5.5V14" />
          </svg>
        </div>

        <dl className="ffacts">
          <div>
            <dt>Role</dt>
            <dd>{d.role_name ?? <span className="muted">Not set</span>}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{d.department_name ?? <span className="muted">None</span>}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>
              {d.entity_id && d.entity_name
                ? <Link href={`/admin/organizations/${d.entity_id}`}>
                    <OrgMark />{d.entity_name}
                  </Link>
                : d.entity_name ?? <span className="muted">None</span>}
            </dd>
          </div>
          {d.location_name && (
            <div>
              <dt>Office</dt>
              <dd>
                {d.location_id && d.entity_id
                  ? <Link href={`/admin/organizations/${d.entity_id}/locations/${d.location_id}`}>
                      <PlaceMark />{d.location_name}
                    </Link>
                  : <><PlaceMark />{d.location_name}</>}
              </dd>
            </div>
          )}

          {/* Nothing a person may not do is rendered: no contact details, no
              buttons, rather than two greyed-out circles that say nothing
              except that Hopper knows something you do not. */}
          {(email || tel) && (
            <div className="freach">
              {email && (
                <a className="rch" href={`mailto:${email}`} title={email}
                   aria-label={`Email ${d.full_name}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="1.6" /><path d="m3.5 7 8.5 6 8.5-6" />
                  </svg>
                  <span>Email</span>
                </a>
              )}
              {tel && (
                <a className="rch" href={`tel:${tel}`} title={phone ?? ''}
                   aria-label={`Call ${d.full_name}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />
                  </svg>
                  <span>Call</span>
                </a>
              )}
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
