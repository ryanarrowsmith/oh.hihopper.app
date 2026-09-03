import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'

export type PStatus = 'on_track' | 'at_risk' | 'blocked' | 'complete'

export type Row = {
  id: string; name: string; summary: string | null
  entity: string | null; entityId: string
  owner: string | null; ownerInitials: string | null
  status: PStatus
  startedOn: string | null; targetOn: string | null
  done: number; total: number
  next: { name: string; on: string | null } | null
}

export type Task = {
  id: string; name: string; detail: string | null
  milestoneId: string | null
  assignee: string | null; assigneeId: string | null; initials: string | null
  dueOn: string | null; doneAt: string | null
  tags: string[]
  blockedBy: string | null; blockedByName: string | null
  order: number
}

export type Milestone = {
  id: string; name: string; detail: string | null
  dueOn: string | null; doneAt: string | null; order: number
  blockedBy: string | null; blockedByName: string | null
  /** How many times this date has moved, and by how many days in total. */
  moves: number; slipDays: number
  tasks: Task[]
}

export type LogEntry = {
  id: string; body: string; kind: string; at: string; author: string | null
}

const initialsOf = (n: string | null) =>
  n ? n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') : null

const days = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000)

/**
 * Every project you can open, with the two numbers a portfolio is read for.
 *
 * "How far along" and "what is next" are worked out here rather than stored,
 * because both are answers to questions about rows that change underneath them
 * -- a stored progress figure is a number that goes stale the first time
 * somebody ticks something.
 */
export async function loadProjects(): Promise<Row[]> {
  const db = supabaseServer()
  const [{ data: projects }, { data: miles }, { data: tasks }, { data: ents }, { data: people }] =
    await Promise.all([
      db.schema('hopper').from('project')
        .select('id, name, summary, entity_id, owner_id, status, started_on, target_on')
        .order('name'),
      db.schema('hopper').from('milestone').select('id, project_id, name, due_on, done_at'),
      db.schema('hopper').from('task').select('id, project_id, done_at'),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('directory').select('id, full_name'),
    ])

  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))
  const who = new Map((people ?? []).map((p: any) => [p.id, p.full_name]))

  return (projects ?? []).map((p: any) => {
    const mine = (tasks ?? []).filter((t: any) => t.project_id === p.id)
    // The soonest one still open. A project's "next" is the next thing that has
    // to be true, not the next row in the table.
    const next = (miles ?? [])
      .filter((m: any) => m.project_id === p.id && !m.done_at)
      .sort((a: any, b: any) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999'))[0]
    const owner = who.get(p.owner_id) ?? null
    return {
      id: p.id, name: p.name, summary: p.summary,
      entity: entName.get(p.entity_id) ?? null, entityId: p.entity_id,
      owner, ownerInitials: initialsOf(owner),
      status: (p.status ?? 'on_track') as PStatus,
      startedOn: p.started_on, targetOn: p.target_on,
      done: mine.filter((t: any) => t.done_at).length, total: mine.length,
      next: next ? { name: next.name, on: next.due_on } : null,
    }
  })
}

/** One project, everything under it, in the order it is read. */
export async function loadProject(id: string) {
  const db = supabaseServer()
  const [{ data: p }, { data: miles }, { data: tasks }, { data: moves },
         { data: notes }, { data: ents }, { data: people }] =
    await Promise.all([
      db.schema('hopper').from('project')
        .select('id, name, summary, entity_id, owner_id, status, started_on, target_on')
        .eq('id', id).maybeSingle(),
      db.schema('hopper').from('milestone')
        .select('id, name, detail, due_on, done_at, sort_order, blocked_by')
        .eq('project_id', id).order('sort_order').order('due_on'),
      db.schema('hopper').from('task')
        .select('id, name, detail, milestone_id, assignee_id, due_on, done_at, tags, sort_order, blocked_by')
        .eq('project_id', id).order('sort_order'),
      db.schema('hopper').from('milestone_move')
        .select('milestone_id, was_on, now_on, why, moved_at').order('moved_at'),
      db.schema('hopper').from('project_note')
        .select('id, body, kind, at, author_id')
        .eq('project_id', id).order('at', { ascending: false }).limit(50),
      db.schema('hopper').from('entity').select('id, name'),
      db.schema('hopper').from('directory').select('id, full_name'),
    ])
  if (!p) return null

  const who = new Map((people ?? []).map((x: any) => [x.id, x.full_name]))
  const mName = new Map((miles ?? []).map((m: any) => [m.id, m.name]))
  const tName = new Map((tasks ?? []).map((t: any) => [t.id, t.name]))

  const task = (t: any): Task => {
    const a = who.get(t.assignee_id) ?? null
    return {
      id: t.id, name: t.name, detail: t.detail, milestoneId: t.milestone_id,
      assignee: a, assigneeId: t.assignee_id, initials: initialsOf(a),
      dueOn: t.due_on, doneAt: t.done_at, tags: t.tags ?? [],
      blockedBy: t.blocked_by, blockedByName: t.blocked_by ? (tName.get(t.blocked_by) ?? null) : null,
      order: t.sort_order ?? 0,
    }
  }

  const milestones: Milestone[] = (miles ?? []).map((m: any) => {
    const mv = (moves ?? []).filter((x: any) => x.milestone_id === m.id)
    return {
      id: m.id, name: m.name, detail: m.detail,
      dueOn: m.due_on, doneAt: m.done_at, order: m.sort_order ?? 0,
      blockedBy: m.blocked_by,
      blockedByName: m.blocked_by ? (mName.get(m.blocked_by) ?? null) : null,
      moves: mv.length,
      // Total drift, not the last hop: a date that went out ten days and came
      // back three has moved seven, and seven is the number anybody arguing
      // about the schedule actually wants.
      slipDays: mv.reduce((n: number, x: any) =>
        n + (x.was_on && x.now_on ? days(x.was_on, x.now_on) : 0), 0),
      tasks: (tasks ?? []).filter((t: any) => t.milestone_id === m.id).map(task),
    }
  })

  const loose = (tasks ?? []).filter((t: any) => !t.milestone_id).map(task)
  const all = (tasks ?? []).map(task)
  const owner = who.get(p.owner_id) ?? null
  const entName = new Map((ents ?? []).map((e: any) => [e.id, e.name]))

  return {
    project: {
      id: p.id, name: p.name, summary: p.summary,
      entity: entName.get(p.entity_id) ?? null, entityId: p.entity_id,
      owner, ownerInitials: initialsOf(owner), ownerId: p.owner_id,
      status: (p.status ?? 'on_track') as PStatus,
      startedOn: p.started_on, targetOn: p.target_on,
      done: all.filter((t) => t.doneAt).length, total: all.length,
      blocked: all.filter((t) => t.blockedBy && !t.doneAt).length,
      next: milestones.find((m) => !m.doneAt) ?? null,
    },
    milestones, loose,
    log: (notes ?? []).map((n: any): LogEntry => ({
      id: n.id, body: n.body, kind: n.kind, at: n.at,
      author: who.get(n.author_id) ?? null,
    })),
  }
}
