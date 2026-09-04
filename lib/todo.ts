import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

/**
 * To Do.
 *
 * A List is what a project was. A Task is a task. A Task can hold Subtasks,
 * one level deep and no further -- the database refuses a third, so nothing
 * here has to decide how far to indent.
 *
 * Milestones used to sit between a list and its tasks, carrying the dates and
 * a history of every time one moved. They are gone. What they tracked lives on
 * the task now, and the history lives in the log, written by the database at
 * the moment the date changes.
 */

export type LStatus = 'on_track' | 'at_risk' | 'blocked' | 'complete'

export type Task = {
  id: string; name: string; detail: string | null
  parentId: string | null
  assignee: string | null; assigneeId: string | null; initials: string | null
  dueOn: string | null; doneAt: string | null
  tags: string[]
  blockedBy: string | null; blockedByName: string | null
  order: number
  /** '' when it does not repeat; otherwise '1d', '2w', '3m' and so on. */
  repeat: string
  /** Only ever populated on a task with no parent of its own. */
  subs: Task[]
}

export type ListHead = {
  id: string; name: string; summary: string | null
  entity: string | null; entityId: string
  owner: string | null; ownerInitials: string | null; ownerId: string | null
  status: LStatus
  startedOn: string | null; dueOn: string | null
  tags: string[]
  blockedBy: string | null; blockedByName: string | null
  done: number; total: number; blocked: number; late: number
  /** Whether this person runs it, answered by the policy rather than re-derived. */
  mayEdit: boolean
}

export type LogEntry = {
  id: string; body: string; kind: string; at: string; author: string | null
}

const initialsOf = (n: string | null) =>
  n ? n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') : null

const today = () => new Date().toISOString().slice(0, 10)

/** An id no row has, so `neq` means "every row you are allowed to touch". */
const NOBODY = '00000000-0000-0000-0000-000000000000'

const SELECT_LIST =
  'id, name, summary, entity_id, owner_id, status, started_on, due_on, tags, blocked_by'
const SELECT_TASK =
  'id, list_id, parent_id, name, detail, assignee_id, due_on, done_at, tags, sort_order,'
  + ' blocked_by, repeat_every, repeat_unit'

/**
 * A task and its subtasks in one shape.
 *
 * Subtasks are nested rather than left flat with a parent id, because every
 * screen that renders them wants them in reading order under the task they
 * belong to, and doing that twice is doing it differently twice.
 */
function shape(rows: any[], who: Map<string, string>): Task[] {
  const name = new Map(rows.map((t: any) => [t.id, t.name]))
  const one = (t: any): Task => {
    const a = who.get(t.assignee_id) ?? null
    return {
      id: t.id, name: t.name, detail: t.detail, parentId: t.parent_id,
      assignee: a, assigneeId: t.assignee_id, initials: initialsOf(a),
      dueOn: t.due_on, doneAt: t.done_at, tags: t.tags ?? [],
      blockedBy: t.blocked_by,
      blockedByName: t.blocked_by ? (name.get(t.blocked_by) ?? null) : null,
      order: t.sort_order ?? 0,
      repeat: t.repeat_every ? `${t.repeat_every}${String(t.repeat_unit)[0]}` : '',
      subs: [],
    }
  }
  const by = (a: Task, b: Task) => a.order - b.order || a.name.localeCompare(b.name)
  const tops = rows.filter((t: any) => !t.parent_id).map(one).sort(by)
  const mine = new Map(tops.map((t) => [t.id, t]))
  for (const s of rows.filter((t: any) => t.parent_id).map(one).sort(by)) {
    mine.get(s.parentId!)?.subs.push(s)
  }
  return tops
}

const countOf = (rows: any[]) => ({
  done: rows.filter((t: any) => t.done_at).length,
  total: rows.length,
  blocked: rows.filter((t: any) => t.blocked_by && !t.done_at).length,
  late: rows.filter((t: any) => !t.done_at && t.due_on && t.due_on < today()).length,
})

const head = (l: any, ents: Map<string, string>, who: Map<string, string>,
              lists: Map<string, string>, rows: any[]): ListHead => {
  const owner = who.get(l.owner_id) ?? null
  return {
    id: l.id, name: l.name, summary: l.summary,
    entity: ents.get(l.entity_id) ?? null, entityId: l.entity_id,
    owner, ownerInitials: initialsOf(owner), ownerId: l.owner_id,
    status: (l.status ?? 'on_track') as LStatus,
    startedOn: l.started_on, dueOn: l.due_on, tags: l.tags ?? [],
    blockedBy: l.blocked_by,
    blockedByName: l.blocked_by ? (lists.get(l.blocked_by) ?? null) : null,
    ...countOf(rows),
    mayEdit: false,
  }
}

/**
 * The root screen: every list you can open, with its tasks under it.
 *
 * One query for the tasks rather than one per list, because a person with
 * fifteen lists should not cost fifteen round trips to read one page.
 */
export async function loadTodo(): Promise<{ list: ListHead; tasks: Task[] }[]> {
  const db = supabaseServer()
  const [{ data: lists }, { data: tasks }, { data: ents }, { data: people }, { data: runs }] =
    await Promise.all([
      db.schema('hopper').from('list').select(SELECT_LIST).order('name'),
      db.schema('hopper').from('task').select(SELECT_TASK).order('sort_order'),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('directory').select('id, full_name'),
      // Which of them this person runs, answered by the policy itself: a no-op
      // update returns only the rows it was allowed to touch. Asking the
      // database beats keeping a second copy of the rule in here that can drift
      // away from the first.
      db.schema('hopper').from('list')
        .update({ updated_at: new Date().toISOString() }).neq('id', NOBODY).select('id'),
    ])

  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const who = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))
  const lName = new Map((lists ?? []).map((l: any) => [l.id, l.name]))
  const runsIt = new Set((runs ?? []).map((r: any) => r.id))

  return (lists ?? []).map((l: any) => {
    const rows = (tasks ?? []).filter((t: any) => t.list_id === l.id)
    return {
      list: { ...head(l, entName, who, lName, rows), mayEdit: runsIt.has(l.id) },
      tasks: shape(rows, who),
    }
  })
}

/** One list, everything under it, and the log. */
export async function loadList(id: string) {
  const db = supabaseServer()
  const [{ data: l }, { data: tasks }, { data: notes }, { data: ents },
         { data: people }, { data: lists }] =
    await Promise.all([
      db.schema('hopper').from('list').select(SELECT_LIST).eq('id', id).maybeSingle(),
      db.schema('hopper').from('task').select(SELECT_TASK).eq('list_id', id).order('sort_order'),
      db.schema('hopper').from('list_note')
        .select('id, body, kind, at, author_id')
        .eq('list_id', id).order('at', { ascending: false }).limit(80),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('directory').select('id, full_name'),
      db.schema('hopper').from('list').select('id, name'),
    ])
  if (!l) return null

  const who = new Map((people ?? []).map((x: any) => [x.id, x.full_name]))
  const rows = tasks ?? []

  return {
    list: head(l, new Map((ents ?? []).map((e: any) => [e.id, e.name])), who,
               new Map((lists ?? []).map((x: any) => [x.id, x.name])), rows),
    tasks: shape(rows, who),
    /** Flat, for the pickers: what a task may wait on is any other task here. */
    every: rows.map((t: any) => ({ id: t.id, name: t.name })),
    log: (notes ?? []).map((n: any): LogEntry => ({
      id: n.id, body: n.body, kind: n.kind, at: n.at,
      author: who.get(n.author_id) ?? null,
    })),
  }
}
