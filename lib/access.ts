/**
 * What a permission IS -- in one place.
 *
 * Admin -> Permissions and a person's own access screen render these same
 * rows. Two hand-written copies of this list is how two screens start
 * disagreeing about what somebody can do, and only one of them is the one the
 * database believes.
 */
export type Verb = 'view' | 'edit' | 'export'

export type FlatObject = {
  key: string
  label: string
  blurb: string
  verbs: Verb[]
  /** only an account owner/admin may grant this one */
  ownerOnly?: boolean
}

/** The things that are not places. */
export const FLAT_OBJECTS: FlatObject[] = [
  { key: 'executive', label: 'Executive',
    blurb: 'Sees the whole portfolio without being granted it one business at a time.',
    verbs: ['view'] },
  { key: 'manage_organizations', label: 'Manage organizations',
    blurb: 'Edit the tree, departments and locations. One permission, not forty.',
    verbs: ['view', 'edit'] },
  { key: 'roster', label: 'See the roster',
    blurb: 'The people list, narrowed to the businesses they can already see.',
    verbs: ['view', 'edit', 'export'] },
  { key: 'audit_log', label: 'Audit log',
    blurb: 'The record of what happened. Reading it is itself a privilege.',
    verbs: ['view', 'export'] },
  { key: 'administrator', label: 'Administrator',
    blurb: 'Administrative writes across Hopper. Only an account owner may grant this.',
    verbs: ['edit'], ownerOnly: true },
]

/**
 * Places offer View and nothing else. Editing a place is
 * `manage_organizations`; exporting is a property of a report rather than of
 * the place it hangs in. A checkbox that saves and changes nothing is worse
 * than a checkbox that is not there.
 */
export const PLACE_VERBS: Verb[] = ['view']

export const MODULES = [
  { key: 'reporting',         label: 'Reporting' },
  { key: 'projects',          label: 'Projects' },
  { key: 'staff_development', label: 'Staff Development' },
  { key: 'meetings',          label: 'Meetings' },
] as const

export const CORE_MODULES = [
  'home', 'organizations', 'calendar', 'wiki', 'news',
  'activity_log', 'support', 'profile', 'favorites',
] as const

export type Grant = {
  id: string
  person_id: string
  object: string
  scope_id: string | null
  may_view: boolean
  may_edit: boolean
  may_export: boolean
}

export function held(grants: Grant[], object: string, verb: Verb, scope: string | null = null) {
  const g = grants.find((x) => x.object === object && (x.scope_id ?? null) === scope)
  if (!g) return false
  return verb === 'view' ? g.may_view : verb === 'edit' ? g.may_edit : g.may_export
}
