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
  /* Reading the handbook comes with the module everybody has. Writing it is
     this -- because looking something up and rewriting it for the whole
     company are different jobs, and only one of them should be automatic. */
  { key: 'wiki', label: 'Wiki',
    blurb: 'Write and edit documents. Everybody can already read them.',
    verbs: ['view', 'edit'] },
  { key: 'audit_log', label: 'All activity',
    blurb: 'Activity across the whole account, not only your own line of report.',
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
  { key: 'todo',              label: 'To Do' },
  { key: 'desk',              label: 'Desk' },
  { key: 'staffing',          label: 'Staffing' },
  { key: 'meetings',          label: 'Meetings' },
] as const

export const CORE_MODULES = [
  'home', 'organizations', 'people', 'calendar', 'wiki', 'news',
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

/* ==========================================================================
   LEVELS
   Read, Edit, Admin -- one scale, three steps, each containing the one below
   it. Nobody edits what they cannot read, so three independent ticks was
   always a lie about how permissions work.

   Admin does not delete. Nothing in Hopper is destroyed: a location, a
   department, a report or a list is made INACTIVE, keeps its history, and
   can be turned back on where you left it. Admin is the power to take
   something out of use, and to hand the same access to somebody else -- which
   is why it is a level of its own rather than a tick beside Edit.
   ========================================================================== */

export type Level = 'read' | 'edit' | 'admin'
export const LEVELS: Level[] = ['read', 'edit', 'admin']
export const LEVEL_WORD: Record<Level, string> = {
  read: 'Read', edit: 'Edit', admin: 'Admin',
}
export const LEVEL_MEANS: Record<Level, string> = {
  read: 'Open it and look. Nothing you do here saves.',
  edit: 'Change what is in it. You cannot take it out of use.',
  admin: 'Change it, take things in it out of use, and grant the same to others.',
}
export const rank = (l: Level | null) =>
  l === 'admin' ? 3 : l === 'edit' ? 2 : l === 'read' ? 1 : 0
export const wordOf = (n: number): Level | null =>
  n >= 3 ? 'admin' : n === 2 ? 'edit' : n === 1 ? 'read' : null

/** The booleans a level is stored as. Cumulative, because the policies that
 *  read them ask "may_view" and "may_edit" separately and always will. */
export const asFlags = (l: Level | null) => ({
  may_view: rank(l) >= 1, may_edit: rank(l) >= 2, may_admin: rank(l) >= 3,
})
export const asLevel = (g: { may_view?: boolean; may_edit?: boolean
                             may_admin?: boolean } | null | undefined): Level | null =>
  !g ? null : g.may_admin ? 'admin' : g.may_edit ? 'edit' : g.may_view ? 'read' : null

/** The parts of Hopper a module level can be held on. */
/** The highest step each flat permission actually has. A step that saves and
 *  changes nothing is worse than a step that is not offered. */
export const FLAT_MAX: Record<string, Level> = {
  executive: 'read',
  manage_organizations: 'edit',
  roster: 'edit',
  audit_log: 'read',
  wiki: 'edit',
  administrator: 'admin',
}

/**
 * The mark for each level, as path data.
 *
 * It lived in LevelPick, which is a client component -- and a value exported
 * across that boundary and read by a SERVER component does not arrive as the
 * object it was: Next turns every export of a 'use client' module into a client
 * reference, so the server got a proxy and threw reading a key off it. A
 * component survives that trip; a plain record does not. Your own access page
 * was a 500 because of it. It belongs here anyway, beside LEVEL_WORD, which is
 * the same fact in the other alphabet.
 */
export const LEVEL_MARK: Record<Level, string> = {
  read: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 1 0-4-4L4 16z"/><path d="M14.5 5.5 18.5 9.5"/>',
  admin: '<path d="M6 11V8a6 6 0 1 1 12 0v3"/><rect x="4" y="11" width="16" height="10" rx="1.5"/>',
}

export const LEVELLED_MODULES = [
  { key: 'reporting', label: 'Reporting', blurb: 'Sheets, charts and the dashboards built on them' },
  { key: 'todo',      label: 'To Do',     blurb: 'Lists, tasks and subtasks' },
  { key: 'wiki',      label: 'Wiki',      blurb: 'The handbook. Everybody reads it; Edit writes it' },
  { key: 'desk',      label: 'Desk',
    blurb: 'Ticket queues. Read watches, Edit works them, Admin configures them' },
  { key: 'staffing',  label: 'Staffing',  blurb: 'Rotas and who is on' },
  { key: 'meetings',  label: 'Meetings',  blurb: 'Agendas and what was decided' },
] as const
