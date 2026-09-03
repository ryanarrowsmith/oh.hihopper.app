'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'

export type Landed = {
  ok: boolean
  message?: string
  added?: number
  updated?: number
  /** One line per row Hopper would not take, saying which row and why. */
  refused?: { line: number; who: string; why: string }[]
  /** What a name resolved to, when it had to guess. */
  notes?: string[]
}

/**
 * The columns a roster may carry, and what each is called in the wild.
 *
 * People export from Excel, from an HR system, from a Google Sheet somebody
 * typed by hand -- so the header is matched loosely rather than demanded
 * exactly. "Email Address", "e-mail" and "EMAIL" are the same column, and a
 * file refused for saying "Full Name" instead of "Name" is a file nobody
 * bothers to fix.
 */
const FIELDS: { key: string; names: string[] }[] = [
  { key: 'full_name',  names: ['name', 'full name', 'fullname', 'person', 'employee'] },
  { key: 'email',      names: ['email', 'email address', 'e-mail', 'mail'] },
  { key: 'role_title', names: ['role', 'title', 'job title', 'position', 'job'] },
  { key: 'department', names: ['department', 'dept', 'team'] },
  { key: 'entity',     names: ['org', 'organization', 'organisation', 'company', 'business', 'entity'] },
  { key: 'phone',      names: ['phone', 'telephone', 'mobile', 'cell', 'phone number'] },
  { key: 'manager',    names: ['manager', 'reports to', 'supervisor', 'line manager'] },
  { key: 'location',   names: ['location', 'office', 'site', 'yard', 'place'] },
]

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * The aliases, normalised the same way the header is.
 *
 * They were compared raw, so "E-Mail" -- which normalises to "e mail" -- never
 * matched the alias "e-mail", and that column was silently ignored: an import
 * that looked like it worked and put nobody's address in. Both sides go through
 * the same function now, which is the only way two lists can be compared.
 */
const ALIASES = FIELDS.map((f) => ({ key: f.key, names: f.names.map(norm) }))

/** RFC 4180, because the first roster anybody pastes has a comma in a job
 *  title and a quoted field with a newline in it. */
function rows(text: string): string[][] {
  const first = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  const counts = [',', '\t', ';', '|'].map((d) => [d, first.split(d).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  const d = counts[0][1] > 0 ? counts[0][0] : ','

  const out: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === d) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); out.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); out.push(row) }
  return out.filter((r) => r.some((v) => v.trim() !== ''))
}

/**
 * Add or update people from a pasted or uploaded roster.
 *
 * Every field but the name is optional, deliberately: a roster with only names
 * and emails in it is the normal first import, and refusing it until somebody
 * fills in every department is how an import never happens. Anything missing is
 * simply left empty, and anything that names something Hopper cannot find is
 * reported by name rather than guessed at.
 */
export async function importPeople(_p: Landed | null, form: FormData): Promise<Landed> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }
  const text = (form.get('rows') ?? '').toString()
  if (!text.trim()) return { ok: false, message: 'There was nothing to read.' }

  const db = supabaseServer()
  const table = rows(text)
  if (table.length < 2) return { ok: false, message: 'That needs a header row and at least one person.' }

  // Which column is what. A header Hopper does not recognise is ignored rather
  // than fatal -- extra columns are normal in an export.
  const head = table[0].map(norm)
  const at: Record<string, number> = {}
  for (const f of ALIASES) {
    const i = head.findIndex((h) => f.names.includes(h))
    if (i >= 0) at[f.key] = i
  }
  if (at.full_name === undefined) {
    return { ok: false, message: 'Hopper could not find a name column. It looks for “Name” or “Full name”.' }
  }

  const [{ data: ents }, { data: depts }, { data: locs }, { data: existing }] = await Promise.all([
    db.schema('hopper').from('entity').select('id, name'),
    db.schema('hopper').from('department').select('id, name, entity_id').eq('active', true),
    db.schema('hopper').from('location').select('id, name, entity_id'),
    db.schema('hopper').from('person').select('id, full_name, email'),
  ])

  const find = (list: any[], name: string, entity?: string | null) => {
    const n = norm(name)
    const hit = (list ?? []).filter((x: any) => norm(x.name) === n)
    if (hit.length === 0) return null
    if (hit.length === 1 || !entity) return hit[0]
    return hit.find((x: any) => x.entity_id === entity) ?? hit[0]
  }
  const byEmail = new Map((existing ?? []).filter((p: any) => p.email)
    .map((p: any) => [String(p.email).toLowerCase(), p]))
  const byName = new Map((existing ?? []).map((p: any) => [norm(p.full_name), p]))

  const refused: Landed['refused'] = []
  const notes = new Set<string>()
  const toAdd: any[] = []
  const toUpdate: { id: string; patch: any }[] = []
  // Names of managers, resolved in a second pass: a roster routinely lists
  // somebody before the person they report to, and refusing that would mean
  // asking people to sort their own file.
  const wantsManager: { key: string; manager: string }[] = []

  const cell = (r: string[], k: string) =>
    at[k] === undefined ? '' : (r[at[k]] ?? '').trim()

  for (let i = 1; i < table.length; i++) {
    const r = table[i]
    const name = cell(r, 'full_name')
    if (!name) { refused.push({ line: i + 1, who: '(no name)', why: 'No name in the row.' }); continue }

    const email = cell(r, 'email').toLowerCase() || null
    const entName = cell(r, 'entity')
    const ent = entName ? find(ents ?? [], entName) : null
    if (entName && !ent) {
      refused.push({ line: i + 1, who: name, why: `No organization called “${entName}”.` })
      continue
    }
    // A person has to hang somewhere, and the roster is not the place to invent
    // an organization -- that is a decision, not a data-entry step.
    const entityId = ent?.id ?? (ents ?? [])[0]?.id ?? null
    if (!entityId) { refused.push({ line: i + 1, who: name, why: 'No organizations exist yet.' }); continue }
    if (!ent && entName === '') notes.add(`Rows with no organization went to ${(ents ?? [])[0]?.name}.`)

    const deptName = cell(r, 'department')
    const dept = deptName ? find(depts ?? [], deptName, entityId) : null
    if (deptName && !dept) notes.add(`No department called “${deptName}” — those rows were left without one.`)

    const locName = cell(r, 'location')
    const loc = locName ? find(locs ?? [], locName, entityId) : null
    if (locName && !loc) notes.add(`No location called “${locName}” — those rows were left without one.`)

    const patch: any = {
      full_name: name,
      email,
      role_title: cell(r, 'role_title') || null,
      phone: cell(r, 'phone') || null,
      entity_id: entityId,
      department_id: dept?.id ?? null,
      location_id: loc?.id ?? null,
    }
    // Nothing is overwritten with nothing: a roster that omits phone should not
    // erase the phone numbers already on file.
    for (const k of Object.keys(patch)) if (patch[k] === null) delete patch[k]

    const mgr = cell(r, 'manager')
    if (mgr) wantsManager.push({ key: email ?? norm(name), manager: mgr })

    const already = (email && byEmail.get(email)) || byName.get(norm(name))
    if (already) toUpdate.push({ id: already.id, patch })
    else toAdd.push({ ...patch, account_id: session.accountId, full_name: name, active: true })
  }

  let added = 0, updated = 0
  if (toAdd.length) {
    const { data, error } = await db.schema('hopper').from('person').insert(toAdd).select('id, full_name, email')
    if (error) {
      return { ok: false, refused, message: /row-level security|permission/i.test(error.message)
        ? 'You may not add people to this organization.' : error.message }
    }
    added = data?.length ?? 0
    for (const p of data ?? []) {
      if (p.email) byEmail.set(String(p.email).toLowerCase(), p)
      byName.set(norm(p.full_name), p)
    }
  }
  for (const u of toUpdate) {
    const { error } = await db.schema('hopper').from('person').update(u.patch).eq('id', u.id)
    if (!error) updated++
  }

  // Managers last, now that everybody in the file exists.
  for (const w of wantsManager) {
    const me = byEmail.get(w.key) ?? byName.get(w.key)
    const boss = byEmail.get(w.manager.toLowerCase()) ?? byName.get(norm(w.manager))
    if (!me) continue
    if (!boss) { notes.add(`No one called “${w.manager}” — those rows were left without a manager.`); continue }
    if (boss.id === me.id) { notes.add(`${w.manager} cannot report to themselves.`); continue }
    await db.schema('hopper').from('person').update({ manager_id: boss.id }).eq('id', me.id)
  }

  await logAudit(db, { account_id: session.accountId, kind: 'person',
    summary: `Imported a roster: ${added} added, ${updated} updated`,
    note: refused.length ? `${refused.length} row(s) refused` : null })

  revalidatePath('/people'); revalidatePath('/admin/people')
  return {
    ok: true, added, updated, refused, notes: [...notes],
    message: `${added} added, ${updated} updated${refused.length ? `, ${refused.length} not taken` : ''}.`,
  }
}

/** Take people off the roster. */
/**
 * Take people out of use, in bulk.
 *
 * This used to DELETE, and deleting was wrong: Hopper's rule is that nothing is
 * destroyed. A person made inactive keeps their history, their notes, the
 * projects they closed and everything they wrote -- they simply stop appearing
 * in the roster and stop being pickable. Deleting them would have quietly
 * orphaned every one of those rows.
 *
 * Somebody who can sign in keeps their sign-in: that account is the platform's,
 * and a roster screen silently removing a person's login is the kind of
 * surprise that gets found out at 7am on a Monday. Their access is taken away
 * under Permissions, deliberately.
 */
export async function setPeopleActive(_p: Landed | null, form: FormData): Promise<Landed> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }
  const ids = form.getAll('id').map((v) => v.toString()).filter(Boolean)
  const active = form.get('active') === 'true'
  if (ids.length === 0) return { ok: false, message: 'Nobody was chosen.' }

  const db = supabaseServer()
  // A FOR ALL policy refuses by changing nothing and raising nothing, so the
  // rows that came back are the only honest count.
  const { data: hit, error } = await db.schema('hopper').from('person')
    .update({ active }).in('id', ids).select('id, full_name')
  if (error) return { ok: false, message: error.message }

  const n = (hit ?? []).length
  if (n) {
    await logAudit(db, { account_id: session.accountId, kind: 'person',
      summary: `${active ? 'Brought back' : 'Made inactive'}: ${n} ${n === 1 ? 'person' : 'people'}`,
      payload: { people: (hit ?? []).map((p: any) => p.full_name) } })
  }

  revalidatePath('/people'); revalidatePath('/admin/people')
  const missed = ids.length - n
  return {
    ok: true,
    message: n === 0
      ? 'Nothing changed — none of those were yours to change.'
      : `${n} ${active ? 'brought back' : 'made inactive'}.`,
    refused: missed > 0
      ? [{ line: 0, who: `${missed} ${missed === 1 ? 'person' : 'people'}`,
           why: 'Not yours to change.' }]
      : [],
  }
}

/** Move people to another organization, or another department inside it. */
export async function movePeople(_p: Landed | null, form: FormData): Promise<Landed> {
  const session = await currentSession()
  if (!session) return { ok: false, message: 'Not signed in.' }
  const ids = form.getAll('id').map((v) => v.toString()).filter(Boolean)
  if (ids.length === 0) return { ok: false, message: 'Nobody was chosen.' }

  const entity_id = (form.get('entity_id') ?? '').toString() || null
  const department_id = (form.get('department_id') ?? '').toString() || null
  if (!entity_id && !department_id) return { ok: false, message: 'Nowhere to move them to.' }

  const patch: any = {}
  if (entity_id) patch.entity_id = entity_id
  // Moving to another organization without saying which department leaves them
  // in none, rather than in a department belonging to a business they have just
  // left.
  patch.department_id = department_id
  if (entity_id && !department_id) patch.department_id = null

  const db = supabaseServer()
  const { data: hit, error } = await db.schema('hopper').from('person')
    .update(patch).in('id', ids).select('id')
  if (error) return { ok: false, message: error.message }

  const n = (hit ?? []).length
  if (n) {
    await logAudit(db, { account_id: session.accountId, kind: 'person',
      summary: `Moved ${n} ${n === 1 ? 'person' : 'people'}` })
  }
  revalidatePath('/people'); revalidatePath('/admin/people')
  return { ok: true, message: n === 0 ? 'Nothing moved.' : `${n} moved.` }
}
