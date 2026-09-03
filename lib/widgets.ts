/**
 * What can go on a home page, and what is on this one.
 *
 * The catalogue is every widget that exists; the ORDER is what this person put
 * on their page. Two lists rather than one, because a widget being available
 * and a widget being wanted are different facts, and folding them together is
 * how a new widget either appears on everybody's page uninvited or on nobody's
 * ever.
 *
 * `built` is the honest half. Six of these have real tables behind them; the
 * rest belong to modules that do not exist in this rebuild yet. An unbuilt
 * widget is listed and cannot be switched on, and says why -- which is a
 * different thing from a widget that turns on and renders an empty box.
 */
export type WidgetKey =
  | 'favs' | 'reps' | 'locs' | 'orgs' | 'cont' | 'team'
  | 'tix' | 'week' | 'proj' | 'docs' | 'recent' | 'since' | 'bill'

export type Widget = {
  key: WidgetKey
  name: string
  note: string
  /** False means no table stands behind it yet. It is listed, greyed, and says so. */
  built: boolean
}

export const CATALOG: Widget[] = [
  { key: 'favs', name: 'Favorites', built: true,
    note: 'Whatever you have hearted — organizations, people, places, reports.' },
  { key: 'reps', name: 'Reports', built: true,
    note: 'The numbers you watch, each with where it stands. Hearted ones first.' },
  { key: 'locs', name: 'Locations', built: true,
    note: 'Business addresses you keep coming back to, with the local time.' },
  { key: 'orgs', name: 'Your organizations', built: true,
    note: 'Everywhere you can go, on one line.' },
  { key: 'cont', name: 'Contacts', built: true,
    note: 'People you reach for often, with their number and their email on the card.' },
  { key: 'team', name: 'My team', built: true,
    note: 'Everyone who reports to you.' },

  { key: 'tix', name: 'My tickets', built: false,
    note: 'Tickets you opened or were assigned, and what each is waiting on.' },
  { key: 'week', name: 'My week', built: false,
    note: 'The next seven days of meetings, one line each.' },
  { key: 'proj', name: 'Projects I own', built: false,
    note: 'Status, progress and the next milestone for the projects with your name on them.' },
  { key: 'docs', name: 'Recent documents', built: false,
    note: 'What has been filed lately against the people you can see.' },
  { key: 'recent', name: 'Pick up where you left off', built: false,
    note: 'The last records you opened. The second visit is likelier than the first.' },
  { key: 'since', name: 'Since you last looked', built: false,
    note: 'What moved in your world while you were doing something else.' },
  { key: 'bill', name: 'Billing at a glance', built: false,
    note: 'Open balance, what is past due, and whose card is about to expire.' },
]
