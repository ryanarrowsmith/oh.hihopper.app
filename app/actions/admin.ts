'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { currentSession } from '@/lib/tenant'
import { logAudit } from '@/lib/audit'
import { addressOf, geocode, whyNoPin } from '@/lib/mapbox'

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
              logo_url: nul(form, 'logo_url'),
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
    .insert({ account_id: account, entity_id, name,
              leader_person_id: nul(form, 'leader_person_id') })
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
  let why: string | null = null
  if (latitude == null || longitude == null) {
    const r = await geocode(place)
    if (r.ok) { latitude = r.pin.latitude; longitude = r.pin.longitude
                geocoded_at = new Date().toISOString() }
    else why = whyNoPin(r)
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
    note: why })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/organizations/locations')
  return { ok: true, message: latitude == null
    ? `${name} added, without a map pin. ${why ?? ''}`.trim()
    : `${name} added and pinned.` }
}

/**
 * Edit a location. Changing the address clears a geocoded pin so it is worked
 * out again -- but a pin somebody placed by hand survives, because they placed
 * it for a reason and a move down the street should not throw that away.
 */
export async function updateLocation(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id'), name = str(form, 'name')
  if (!id || !name) return { ok: false, message: 'A location needs a name.' }

  const { data: was } = await db.schema('hopper').from('location')
    .select('*').eq('id', id).maybeSingle()
  if (!was) return { ok: false, message: 'That location is not there.' }

  const place = {
    address_line1: nul(form, 'address_line1'), address_line2: nul(form, 'address_line2'),
    city: nul(form, 'city'), region: nul(form, 'region'),
    postal_code: nul(form, 'postal_code'),
    country: str(form, 'country') || 'United States',
  }

  let latitude = num(form, 'latitude'), longitude = num(form, 'longitude')
  let geocoded_at: string | null = was.geocoded_at
  let why: string | null = null
  const typedByHand = latitude != null && longitude != null
    && (latitude !== was.latitude || longitude !== was.longitude)
  const addressMoved = addressOf(place) !== addressOf(was)

  if (typedByHand) {
    geocoded_at = null                       // theirs now; leave it alone
  } else if (addressMoved || latitude == null) {
    const wasHandPlaced = was.latitude != null && was.geocoded_at == null
    if (wasHandPlaced && !addressMoved) {
      latitude = was.latitude; longitude = was.longitude
    } else {
      const r = await geocode(place)
      if (r.ok) { latitude = r.pin.latitude; longitude = r.pin.longitude
                  geocoded_at = new Date().toISOString() }
      else { latitude = null; longitude = null; geocoded_at = null; why = whyNoPin(r) }
    }
  }

  const { error } = await db.schema('hopper').from('location').update({
    name, ...place,
    time_zone: str(form, 'time_zone') || 'America/Chicago',
    is_head_office: form.get('is_head_office') === 'on',
    latitude, longitude, geocoded_at,
  }).eq('id', id)
  if (error) return { ok: false, message: refused(error.message, 'location') }

  await logAudit(db, { account_id: account, kind: 'location', object: name,
    object_id: was.entity_id, summary: `Edited the location ${name}`,
    note: addressMoved ? 'The address changed.' : null })
  revalidatePath(`/admin/organizations/${was.entity_id}`)
  revalidatePath(`/admin/organizations/${was.entity_id}/locations/${id}`)

  /**
   * Back to the record, not to a word about it.
   *
   * "Saved." under a form you are still looking at asks you to read a message
   * and then work out for yourself that you are done. A redirect answers both:
   * the form is gone, the record is in front of you with the change in it, and
   * whether it took is a thing you can see rather than a thing you are told.
   */
  // The one thing worth saying out loud is a pin that could NOT be worked out,
  // because that is a result rather than a confirmation -- so it goes back as a
  // message and the redirect waits.
  if (latitude == null) {
    return { ok: true, message: `Saved, without a map pin. ${why ?? ''}`.trim() }
  }
  redirect(`/admin/organizations/${was.entity_id}/locations/${id}`)
}

/**
 * Remove a location.
 *
 * The database will refuse this on its own -- hopper.person carries a
 * location_id with no ON DELETE on it, so the foreign key stops the delete --
 * but a foreign key violation is a sentence about a constraint, and the person
 * pressing the button asked a question about an office. So the people are
 * counted first and the answer names them: how many, and that they have to be
 * moved before the office can go.
 *
 * RLS decides whether they were allowed to ask at all. The button is only
 * rendered for an administrator of the organization, and that is a courtesy --
 * this is where it is actually enforced.
 */
export async function deleteLocation(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  if (!id) return { ok: false, message: 'Nothing to remove.' }

  const { data: loc } = await db.schema('hopper').from('location')
    .select('name, entity_id, is_head_office').eq('id', id).maybeSingle()
  if (!loc) return { ok: false, message: 'That location is not there.' }

  const { count } = await db.schema('hopper').from('person')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', id).eq('active', true)
  if (count && count > 0) {
    return { ok: false, message:
      `${count} ${count === 1 ? 'person is' : 'people are'} still based at ${loc.name}. `
      + 'Move them to another office first — removing this one would leave them nowhere.' }
  }

  /**
   * .select() on the delete, and the count is checked.
   *
   * RLS on hopper.location is a policy on ALL, so somebody who may READ this
   * office but not edit it deletes ZERO rows and gets no error back -- a
   * refusal that looks exactly like a success. The rows actually removed are
   * the only honest answer to "did that work".
   */
  const { data: gone, error } = await db.schema('hopper').from('location')
    .delete().eq('id', id).select('id')
  if (error) return { ok: false, message: refused(error.message, 'location') }
  if (!gone || gone.length === 0) {
    return { ok: false, message:
      'Removing an office is limited to the people who administer this organization.' }
  }

  await logAudit(db, { account_id: account, kind: 'location', object: loc.name,
    object_id: loc.entity_id,
    summary: `Removed the location ${loc.name}`
      + (loc.is_head_office ? ' — it was the head office' : '') })

  revalidatePath(`/admin/organizations/${loc.entity_id}`)
  revalidatePath('/admin/organizations/locations')
  revalidatePath('/')
  redirect(`/admin/organizations/${loc.entity_id}`)
}

/** Re-resolve a pin from the address on demand. */
export async function repinLocation(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id')
  const { data: loc, error: readErr } = await db.schema('hopper').from('location')
    .select('*').eq('id', id).maybeSingle()
  if (readErr || !loc) return { ok: false, message: 'That location is not there.' }

  const r = await geocode(loc)
  if (!r.ok) return { ok: false, message: whyNoPin(r) }
  const pin = r.pin

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

/**
 * Add somebody to the roster and make them an administrator of this
 * organization in the same act -- because "add an administrator" is what the
 * person doing it thinks they are doing, and making them visit two screens to
 * finish one thought is how a step gets forgotten.
 */
export async function addAdministrator(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const entity_id = str(form, 'entity_id')
  const person_id = str(form, 'person_id')
  if (!entity_id) return { ok: false, message: 'No organization to administer.' }
  if (!person_id) return { ok: false, message: 'Choose somebody from the roster.' }

  /**
   * Somebody already on the roster, and only that.
   *
   * This used to take a name and an email and CREATE a person, which is how
   * the account ended up with two rows for the same human -- twice, an hour
   * apart, both with the same address as the row that signs in. Two ways to
   * make a person is one too many.
   *
   * And only somebody who can sign in. beebee.app_access decides who may open
   * Hopper and it hangs off an identity; a roster entry without one cannot get
   * in, so naming them an administrator writes a grant that does nothing and
   * puts their name on a screen claiming otherwise.
   *
   * The name comes from the directory rather than from the form, so the line
   * in the ledger says what the record says. A name typed into a form is a
   * second answer to "who is this", which is exactly what today's identity
   * work was about.
   */
  const { data: who } = await db.schema('hopper').from('person')
    .select('full_name, profile_id').eq('id', person_id).maybeSingle()
  if (!who) return { ok: false, message: 'That person is not on a roster you can see.' }
  // Checked here as well as hidden from the picker: a form is a suggestion and
  // this is the rule. Administering something you cannot open is not a
  // permission, it is a label.
  if (!who.profile_id) {
    return { ok: false, message: 'They have no login yet, so there is nothing for them to administer. Invite them first.' }
  }

  // The name of record, from the profile where there is one -- which here
  // there always is.
  const { data: named } = await db.schema('hopper').from('directory')
    .select('full_name').eq('id', person_id).maybeSingle()
  const full_name = named?.full_name ?? who.full_name

  const { error: gErr } = await db.schema('hopper').from('access_grant').upsert({
    account_id: account, person_id, object: 'entity', scope_id: entity_id,
    may_view: true, may_edit: true,
  }, { onConflict: 'account_id,person_id,object,scope_id' })
  if (gErr) {
    // The unique index keys on coalesce(scope_id, ...), which upsert cannot
    // name, so fall back to reading and writing.
    const { data: had } = await db.schema('hopper').from('access_grant')
      .select('id').eq('person_id', person_id).eq('object', 'entity')
      .eq('scope_id', entity_id).maybeSingle()
    const res = had
      ? await db.schema('hopper').from('access_grant')
          .update({ may_view: true, may_edit: true }).eq('id', had.id)
      : await db.schema('hopper').from('access_grant').insert({
          account_id: account, person_id, object: 'entity', scope_id: entity_id,
          may_view: true, may_edit: true })
    if (res.error) return { ok: false, message: refused(res.error.message, 'administrator') }
  }

  await logAudit(db, { account_id: account, kind: 'access', object: full_name,
    object_id: entity_id,
    summary: `Made ${full_name} an administrator` })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/users'); revalidatePath('/admin/permissions')
  return { ok: true, message: `${full_name} administers this organization now.` }
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
  revalidatePath('/admin/users'); revalidatePath('/admin/permissions')
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
  revalidatePath('/admin/users')
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


// ----------------------------------------------------------------- favorites
/**
 * Heart or un-heart a thing. The person is taken from the session -- a
 * favourite is somebody's own, and an endpoint that accepts a person_id is an
 * endpoint for rearranging other people's.
 */
export async function toggleFavorite(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const session = await currentSession()
  if (!session?.personId) {
    return { ok: false, message: 'You are not on the roster yet, so there is nowhere to keep it.' }
  }
  const object = str(form, 'object'), object_id = str(form, 'object_id')
  if (!object || !object_id) return { ok: false, message: 'Nothing to heart.' }

  const { data: had } = await db.schema('hopper').from('favorite')
    .select('id').eq('object', object).eq('object_id', object_id).maybeSingle()

  const res = had
    ? await db.schema('hopper').from('favorite').delete().eq('id', had.id)
    : await db.schema('hopper').from('favorite').insert({
        account_id: account, person_id: session.personId, object, object_id })
  if (res.error) return { ok: false, message: refused(res.error.message, 'favourite') }

  revalidatePath(str(form, 'back') || '/')
  revalidatePath('/')
  return { ok: true, message: had ? 'Taken out of your favourites.' : 'Added to your favourites.' }
}

/* ==========================================================================
   EDITING A RECORD WHERE IT SITS
   The organization page now opens each row in place instead of sending
   everybody to a form of its own. Each of these is the smallest write that
   answers one row -- and every one of them goes through the signed-in
   session, so RLS is still the thing that permits or refuses it.
   ========================================================================== */

/** An administrator's own details, edited from the row that shows them. */
export async function updateAdministrator(
  _prev: Result | null, form: FormData,
): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'person_id'), entity_id = str(form, 'entity_id')
  const full_name = str(form, 'full_name')
  if (!id || !full_name) return { ok: false, message: 'A person needs a name.' }

  const { error } = await db.schema('hopper').from('person')
    .update({ full_name, role_title: nul(form, 'role_title') }).eq('id', id)
  if (error) return { ok: false, message: refused(error.message, 'person') }

  await logAudit(db, { account_id: account, kind: 'person', object: full_name,
    object_id: id, summary: `Edited ${full_name}` })
  if (entity_id) revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/users')
  return { ok: true, message: 'Saved.' }
}

/**
 * Stand somebody down as administrator. They keep sight of the organization:
 * taking that away is a different decision and it lives on Permissions, where
 * it reads as one. Same rule setEntityAdmins already follows, so the two
 * screens cannot disagree about what standing down means.
 */
export async function standDownAdministrator(
  _prev: Result | null, form: FormData,
): Promise<Result> {
  const { db, account } = await ctx()
  const person_id = str(form, 'person_id'), entity_id = str(form, 'entity_id')
  if (!person_id || !entity_id) return { ok: false, message: 'Nothing to change.' }

  const { data: had } = await db.schema('hopper').from('access_grant')
    .select('id').eq('person_id', person_id).eq('object', 'entity')
    .eq('scope_id', entity_id).maybeSingle()
  if (!had) return { ok: false, message: 'They do not administer this one.' }

  const { error } = await db.schema('hopper').from('access_grant')
    .update({ may_edit: false, may_view: true }).eq('id', had.id)
  if (error) return { ok: false, message: refused(error.message, 'administrator') }

  await logAudit(db, { account_id: account, kind: 'access', object_id: entity_id,
    summary: 'Stood an administrator down', payload: { person_id } })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/permissions')
  return { ok: true, message: 'Stood down. They can still see this organization.' }
}

/** A department's name and who runs it. */
export async function updateDepartment(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id'), entity_id = str(form, 'entity_id')
  const name = str(form, 'name')
  if (!id || !name) return { ok: false, message: 'A department needs a name.' }

  const { error } = await db.schema('hopper').from('department')
    .update({ name, leader_person_id: nul(form, 'leader_person_id') }).eq('id', id)
  if (error) return { ok: false, message: refused(error.message, 'department') }

  await logAudit(db, { account_id: account, kind: 'department', object: name,
    object_id: entity_id, summary: `Edited the department ${name}` })
  revalidatePath(`/admin/organizations/${entity_id}`)
  return { ok: true, message: 'Saved.' }
}

export async function deleteDepartment(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const id = str(form, 'id'), entity_id = str(form, 'entity_id')
  if (!id) return { ok: false, message: 'Nothing to remove.' }

  const { data: was } = await db.schema('hopper').from('department')
    .select('name').eq('id', id).maybeSingle()
  const { error } = await db.schema('hopper').from('department').delete().eq('id', id)
  if (error) return { ok: false, message: refused(error.message, 'department') }

  await logAudit(db, { account_id: account, kind: 'department',
    object: was?.name ?? null, object_id: entity_id,
    summary: `Removed the department ${was?.name ?? ''}`.trim() })
  revalidatePath(`/admin/organizations/${entity_id}`)
  return { ok: true, message: 'Removed.' }
}

/**
 * One module, for one organization, switched now. The page confirms before
 * calling this because the change is live the moment it lands -- and switching
 * off never deletes: the row stays with enabled=false, so turning it back on
 * finds it where it was left.
 */
export async function setModule(_prev: Result | null, form: FormData): Promise<Result> {
  const { db, account } = await ctx()
  const entity_id = str(form, 'entity_id'), module_key = str(form, 'module_key')
  const enabled = str(form, 'enabled') === 'true'
  if (!entity_id || !module_key) return { ok: false, message: 'Nothing to switch.' }

  const { error } = await db.schema('hopper').from('entity_module').upsert({
    account_id: account, entity_id, module_key, enabled,
    changed_at: new Date().toISOString(),
  }, { onConflict: 'account_id,entity_id,module_key' })
  if (error) return { ok: false, message: refused(error.message, 'module') }

  await logAudit(db, { account_id: account, kind: 'module', object: module_key,
    object_id: entity_id,
    summary: `Turned ${module_key} ${enabled ? 'on' : 'off'} for this organization` })
  revalidatePath(`/admin/organizations/${entity_id}`)
  revalidatePath('/admin/modules'); revalidatePath('/')
  return { ok: true, message: enabled ? 'On.' : 'Off. Nothing was deleted.' }
}
