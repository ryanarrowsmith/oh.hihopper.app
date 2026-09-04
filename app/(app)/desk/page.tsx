import { deskScreen } from '@/lib/deskpage'

export const dynamic = 'force-dynamic'

/**
 * Everything you're on.
 *
 * Not "your queue" and not one organization: every queue this person actually
 * works, in one list, closest to breaching first. RLS has already narrowed it
 * to what they may see, so a second narrowing chosen for them can only hide
 * the ticket they needed.
 */
export default async function Page() {
  return deskScreen({
    title: "Everything you're on",
    blurb: 'Sorted by what is closest to breaching, not by what is newest.',
  })
}
