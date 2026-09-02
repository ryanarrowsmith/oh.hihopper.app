'use server'

import { revalidatePath } from 'next/cache'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { addressOf, geocode } from '@/lib/mapbox'

export type Result = { ok: boolean; message: string }

/**
 * Every write below goes through the signed-in person's own session, so RLS is
 * what permits or refuses it. Nothing here re-checks permissions in JavaScript:
 * a second copy of "who may do this" is a second place to be wrong, and only
 * one of them is the one the database believes.
 */
async function ctx() {
  const session = await currentSession()
  if (!session) throw new Error('Not signed in.')
  return { db: supabaseServer(), account: session.accountId }
}

const str = (f: FormData, k: string) => (f.get(k) ?? '').toString().trim()
const nul = (f: FormData, k: string) => str(f, k) || null
const num = (f: FormData, k: string) => {
  const v = str(f, k); if (!v) return null
  const n = Number(v); return Number.isFinite(n) ? n : null
}

// ------------------------------------------------------------ organizations
export async function createEntity(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const name = str(form, 'name')
  if (!name) return { ok: false, message: 'An organization needs a name.' }

  const { data, error } = await db.schema('hopper').from('entity').insert({
    account_id: account, name,
    legal_name: nul(form, 'legal_name'),
    mark: nul(form, 'mark')?.toUpperCase().slice(0, 4) ?? null,
    parent_id: nul(form, 'parent_id'),
    status: str(form, 'status') || 'setup',
  }).select('id').single()

  if (error) return { ok: false, message: refused(error.message, 'organization') }
  await logAudit(db, { account_id: account, kind: 'entity', object: name,
    object_id: data.id, summary: `Added the organization ${name}` })
  revalidatePath('/admin/organizations'); revalidatePath('/')
  return { ok: true, message: `${name} added.` }
}

export async function updateEntity(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  const name = str(form, 'name')
  if (!id || !name) return { ok: false, message: 'Nothing to save.' }

  const { error } = await db.schema('hopper').from('entity')
    .update({ name, legal_name: nul(form, 'legal_name'),
              mark: nul(form, 'mark')?.toUpperCase().slice(0, 4) ?? null,
              status: str(form, 'status') || 'setup' })
    .eq('id', id)

  if (error) return { ok: false, message: refused(error.message, 'organization') }
  await logAudit(db, { account_id: account, kind: 'entity', object: name,
    object_id: id, summary: `Edited the organization ${name}` })
  revalidatePath(`/admin/organizations/${id}`); revalidatePath('/admin/organizations')
  return { ok: true, message: 'Saved.' }
}

export async function createDepartment(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const entity_id = str(form, 'entity_id'), name = str(form, 'name')
  if (!entity_id || !name) return { ok: false, message: 'A department needs a name.' }

  const { error } = await db.schema('hopper').from('department')
    .insert({ account_id: account, entity_id, name })
  if (error) return { ok: false, message: refused(error.message, 'department') }

  await logAudit(db, { account_id: account, kind: 'department', object: name,
    object_id: entity_id, summary: `Added the department ${name}` })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/organizations/departments')
  return { ok: true, message: `${name} added.` }
}

export async function createLocation(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const entity_id = str(form, 'entity_id'), name = str(form, 'name')
  if (!entity_id || !name) return { ok: false, message: 'A location needs a name.' }

  const place = {
    address_line1: nul(form, 'address_line1'), address_line2: nul(form, 'address_line2'),
    city: nul(form, 'city'), region: nul(form, 'region'),
    postal_code: nul(form, 'postal_code'),
    country: str(form, 'country') || 'United States',
  }

  // A pin typed by hand wins. Somebody who moved it did so because the
  // geocoder was wrong about their yard, and re-resolving would undo that.
  let latitude = num(form, 'latitude'), longitude = num(form, 'longitude')
  let geocoded_at: string | null = null
  if (latitude == null || longitude == null) {
    const pin = await geocode(addressOf(place))
    if (pin) { latitude = pin.latitude; longitude = pin.longitude; geocoded_at = new Date().toISOString() }
  }

  const { error } = await db.schema('hopper').from('location').insert({
    account_id: account, entity_id, name, ...place,
    time_zone: str(form, 'time_zone') || 'America/Chicago',
    is_head_office: form.get('is_head_office') === 'on',
    latitude, longitude, geocoded_at,
  })
  if (error) return { ok: false, message: refused(error.message, 'location') }

  await logAudit(db, { account_id: account, kind: 'location', object: name,
    object_id: entity_id, summary: `Added the location ${name}`,
    note: latitude == null ? 'No pin — the address did not resolve.' : null })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/organizations/locations')
  return { ok: true, message: latitude == null
    ? `${name} added. The address did not resolve to a map pin — check it, or type coordinates.`
    : `${name} added and pinned.` }
}

/** Re-resolve a pin from the address on demand. */
export async function repinLocation(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  const { data: loc, error: readErr } = await db.schema('hopper').from('location')
    .select('*').eq('id', id).maybeSingle()
  if (readErr || !loc) return { ok: false, message: 'That location is not there.' }

  const pin = await geocode(addressOf(loc))
  if (!pin) return { ok: false, message:
    'Mapbox could not place that address confidently. Check it, or type coordinates by hand.' }

  const { error } = await db.schema('hopper').from('location')
    .update({ latitude: pin.latitude, longitude: pin.longitude,
              geocoded_at: new Date().toISOString() }).eq('id', id)
  if (error) return { ok: false, message: refused(error.message, 'location') }

  await logAudit(db, { account_id: account, kind: 'location', object: loc.name,
    object_id: loc.entity_id, summary: `Re-pinned ${loc.name} from its address` })
  revalidatePath(`/admin/organizations/${loc.entity_id}`)
  return { ok: true, message: 'Pinned.' }
}

/**
 * Who administers this organization. An administrator is an entity grant that
 * carries may_edit; a viewer is the same row without it. Both live in
 * access_grant, so a person's whole access is still readable in one place and
 * the Permissions screen and this one cannot disagree.
 *
 * Administering INHERITS DOWN: naming somebody here also makes them an
 * administrator of everything beneath this organization.
 */
export async function setEntityAdmins(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const entity_id = str(form, 'entity_id')
  if (!entity_id) return { ok: false, message: 'No organization.' }
  const admins = new Set(form.getAll('admin').map(String))

  const cur = await db.schema('hopper').from('access_grant')
    .select('id, person_id, may_view').eq('object', 'entity').eq('scope_id', entity_id)
  if (cur.error) return { ok: false, message: refused(cur.error.message, 'administrator') }
  const had = new Map((cur.data ?? []).map((r: any) => [r.person_id, r]))

  for (const person_id of admins) {
    const row = had.get(person_id)
    const res = row
      ? await db.schema('hopper').from('access_grant')
          .update({ may_edit: true, may_view: true }).eq('id', row.id)
      : await db.schema('hopper').from('access_grant').insert({
          account_id: account, person_id, object: 'entity',
          scope_id: entity_id, may_view: true, may_edit: true })
    if (res.error) return { ok: false, message: refused(res.error.message, 'administrator') }
  }

  // Standing down as administrator leaves the person able to SEE the
  // organization. Removing their sight of it is a different decision, and it
  // belongs on Permissions where it reads as one.
  for (const [person_id, row] of had) {
    if (admins.has(person_id)) continue
    const res = await db.schema('hopper').from('access_grant')
      .update({ may_edit: false, may_view: true }).eq('id', row.id)
    if (res.error) return { ok: false, message: refused(res.error.message, 'administrator') }
  }

  await logAudit(db, { account_id: account, kind: 'access', object_id: entity_id,
    summary: `Set administrators — ${admins.size} named`,
    payload: { administrators: [...admins] } })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/permissions')
  return { ok: true, message: admins.size
    ? `Saved — ${admins.size} ${admins.size === 1 ? 'administrator' : 'administrators'}.`
    : 'Saved — nobody named, so only account owners can edit this one.' }
}

// -------------------------------------------------------------------- people
export async function createPerson(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const full_name = str(form, 'full_name')
  if (!full_name) return { ok: false, message: 'A person needs a name.' }

  // No profile_id: on the roster but not yet invited is a real state, and the
  // platform owns identity -- Hopper does not get to mint a login.
  const { error } = await db.schema('hopper').from('person').insert({
    account_id: account, full_name,
    email: nul(form, 'email'), role_title: nul(form, 'role_title'),
    entity_id: nul(form, 'entity_id'),
  })
  if (error) return { ok: false, message: refused(error.message, 'person') }

  await logAudit(db, { account_id: account, kind: 'person', object: full_name,
    summary: `Added ${full_name} to the roster` })
  revalidatePath('/admin/people'); revalidatePath('/admin/permissions')
  return { ok: true, message: `${full_name} added.` }
}

export async function setPersonActive(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id'), active = form.get('active') === 'true'
  const { data, error } = await db.schema('hopper').from('person')
    .update({ active }).eq('id', id).select('full_name').single()
  if (error) return { ok: false, message: refused(error.message, 'person') }

  await logAudit(db, { account_id: account, kind: 'person', object: data.full_name,
    object_id: id, summary: `${active ? 'Reactivated' : 'Deactivated'} ${data.full_name}` })
  revalidatePath('/admin/people')
  return { ok: true, message: 'Saved.' }
}

// --------------------------------------------------------------- permissions
/**
 * The whole matrix for one person, saved in one go. Grants absent from the form
 * are removed rather than left behind -- a screen that can only add is a screen
 * that quietly accumulates access nobody chose.
 */
export async function savePermissions(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const person_id = str(form, 'person_id')
  if (!person_id) return { ok: false, message: 'No person selected.' }

  const rows = new Map<string, any>()
  for (const key of form.keys()) {
    // name="g:<object>:<scope|->:<verb>"
    if (!key.startsWith('g:')) continue
    const [, object, scopeRaw, verb] = key.split(':')
    const scope_id = scopeRaw === '-' ? null : scopeRaw
    const k = `${object}|${scopeRaw}`
    const row = rows.get(k) ?? {
      account_id: account, person_id, object, scope_id,
      may_view: false, may_edit: false, may_export: false,
    }
    if (verb === 'view') row.may_view = true
    if (verb === 'edit') row.may_edit = true
    if (verb === 'export') row.may_export = true
    rows.set(k, row)
  }

  const del = await db.schema('hopper').from('access_grant').delete().eq('person_id', person_id)
  if (del.error) return { ok: false, message: refused(del.error.message, 'permission') }

  const list = [...rows.values()]
  if (list.length) {
    const ins = await db.schema('hopper').from('access_grant').insert(list)
    if (ins.error) return { ok: false, message: refused(ins.error.message, 'permission') }
  }

  await logAudit(db, { account_id: account, kind: 'access', object_id: person_id,
    summary: `Set permissions — ${list.length} ${list.length === 1 ? 'grant' : 'grants'}`,
    payload: { grants: list.map((r) => ({ object: r.object, scope: r.scope_id,
      v: r.may_view, e: r.may_edit, x: r.may_export })) } })
  revalidatePath('/admin/permissions')
  return { ok: true, message: `Saved — ${list.length} ${list.length === 1 ? 'grant' : 'grants'}.` }
}

// ------------------------------------------------------------------- modules
/**
 * Switching a module off never deletes the selection: the row stays with
 * enabled=false so turning it back on finds it where it was left.
 */
export async function saveModules(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const entities = form.getAll('entity').map(String)
  const modules = form.getAll('module').map(String)
  const on = new Set(form.getAll('on').map(String))   // "<entityId>:<moduleKey>"

  const rows = entities.flatMap((entity_id) => modules.map((module_key) => ({
    account_id: account, entity_id, module_key,
    enabled: on.has(`${entity_id}:${module_key}`), changed_at: new Date().toISOString(),
  })))
  if (!rows.length) return { ok: false, message: 'Nothing to save.' }

  const { error } = await db.schema('hopper').from('entity_module')
    .upsert(rows, { onConflict: 'account_id,entity_id,module_key' })
  if (error) return { ok: false, message: refused(error.message, 'module') }

  await logAudit(db, { account_id: account, kind: 'module',
    summary: `Set modules — ${on.size} on across ${entities.length} organizations` })
  revalidatePath('/admin/modules'); revalidatePath('/')
  return { ok: true, message: `Saved — ${on.size} on.` }
}

/**
 * RLS refuses by making the row invisible, so PostgREST reports a policy
 * violation rather than "you may not". Say the true thing instead of passing
 * the raw message through.
 */
function refused(msg: string, thing: string) {
  if (/row-level security|violates row-level/i.test(msg)) {
    return `You don't have permission to change ${thing}s on this account.`
  }
  if (/duplicate key/i.test(msg)) return `There is already a ${thing} with that name here.`
  return msg
}
