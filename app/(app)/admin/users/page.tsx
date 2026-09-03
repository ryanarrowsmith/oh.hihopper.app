import { redirect } from 'next/navigation'

/**
 * Users was the same table as People, with the other half of the actions on it.
 * One roster now, with sign-in as a column, so this address keeps working for
 * anything that still points at it.
 */
export default function Page() {
  redirect('/admin/people')
}
