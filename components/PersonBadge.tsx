import Link from 'next/link'
import PhotoUpload from '@/components/PhotoUpload'
import { OrgMark } from '@/components/Icons'

/**
 * A person's badge.
 *
 * The name problem is the same one the folder solved and it is solved the same
 * way: the name belongs to an object, and there is exactly one of that object
 * on the page. A badge is a better object than a folder for this record,
 * because a folder is something the business keeps ABOUT you and a badge is
 * something you carry -- and this page is mostly the second kind of
 * information.
 *
 * The organization is the badge's header, not a field on it. That is what an
 * employer's name does on a real pass: it is the thing issuing the card, so it
 * runs across the top in the company's own colour and everything below it is
 * subordinate to it. It stays a link, because "which business is this person
 * in" is a question people follow rather than merely read -- so the whole bar
 * is the target rather than the words inside it.
 *
 * Everything on the card is something a card carries: photograph, name, role,
 * and an issue line at the foot. Department, office and the two things you
 * came here to do sit beside the card rather than on it, because a badge that
 * carried working controls would be pretending to be furniture and a button at
 * the same time -- see PersonEdit, which owns that column and the form it
 * becomes.
 *
 * The photograph is the one exception, and it always was: it is ON the card,
 * so it is changed on the card. Who may change it is the same question the
 * storage policy answers -- the person themselves, or anybody who may edit the
 * roster.
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

export default function PersonBadge(
  { d, mayEdit }: { d: Person; mayEdit: boolean },
) {
  return (
      <div className="idc">
        {/* The slot, and the clip through it. A badge without one is a
            business card standing on its end. */}
        <span className="idc__clip" aria-hidden="true" />
        <span className="idc__slot" aria-hidden="true" />

        {d.entity_name && (
          d.entity_id
            ? <Link className="idc__org" href={`/admin/organizations/${d.entity_id}`}>
                <OrgMark /><span>{d.entity_name}</span>
              </Link>
            : <span className="idc__org"><OrgMark /><span>{d.entity_name}</span></span>
        )}

        <div className="idc__face">
          <PhotoUpload personId={d.id} name={d.full_name} src={d.photo_url}
                       may={mayEdit} mine={!!d.is_me} size={148} />
        </div>

        <h1 className="idc__n">{d.full_name}</h1>
        <p className="idc__r">{d.role_name ?? 'No role yet'}</p>

        {/* An issue line. Every pass has one, and this one is true: it is the
            first block of the person's own id, which is what Hopper actually
            calls them. */}
        <div className="idc__foot">
          <span className="idc__bars" aria-hidden="true" />
          <span className="idc__no">NO. {d.id.slice(0, 8).toUpperCase()}</span>
        </div>
      </div>
  )
}
