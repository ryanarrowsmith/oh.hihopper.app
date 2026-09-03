import { addressOf, geocode, whyNoPin, type Place } from '@/lib/mapbox'

export type AddrKind = 'physical' | 'mailing'

export type Addr = Place & {
  id: string | null
  kind: AddrKind
  latitude?: number | null
  longitude?: number | null
  geocoded_at?: string | null
  sort_order?: number
}

export const KIND_WORD: Record<AddrKind, string> = {
  physical: 'Physical', mailing: 'Mailing',
}

/**
 * A location's addresses, out of one form.
 *
 * The fields repeat rather than being numbered -- addr_kind, addr_line1 and so
 * on appear once per block -- so the browser hands them back index-aligned and
 * a block removed in the middle does not leave a hole for the parser to guess
 * about. addr_id is empty on a block that has just been added.
 */
export function addressesFrom(form: FormData): Addr[] {
  const col = (k: string) => form.getAll(k).map((v) => (v ?? '').toString().trim())
  const ids = col('addr_id'), kinds = col('addr_kind')
  const l1 = col('addr_line1'), l2 = col('addr_line2')
  const city = col('addr_city'), region = col('addr_region')
  const post = col('addr_postal_code'), country = col('addr_country')

  return kinds.map((k, i) => ({
    id: ids[i] || null,
    kind: (k === 'mailing' ? 'mailing' : 'physical') as AddrKind,
    address_line1: l1[i] || null, address_line2: l2[i] || null,
    city: city[i] || null, region: region[i] || null,
    postal_code: post[i] || null, country: country[i] || 'United States',
    sort_order: i,
  }))
    // An empty block is somebody who pressed Add and changed their mind, not a
    // request to store a blank address.
    .filter((a) => addressOf(a) !== '')
    // The database allows one physical per location and will say so; catching
    // it here means the second one is demoted rather than the whole save being
    // refused over a radio button.
    .map((a, i, all) => (a.kind === 'physical'
      && all.findIndex((x) => x.kind === 'physical') !== i)
      ? { ...a, kind: 'mailing' as AddrKind } : a)
}

/** Only a physical address is worth a pin. Geocoding a PO box puts a marker on
 *  a post office, which is a true fact about the wrong building. */
export async function pinFor(a: Addr, was?: Addr | null):
  Promise<{ latitude: number | null; longitude: number | null
            geocoded_at: string | null; why: string | null }> {
  if (a.kind !== 'physical') {
    return { latitude: null, longitude: null, geocoded_at: null, why: null }
  }
  const handPlaced = was?.latitude != null && was?.geocoded_at == null
  const moved = !was || addressOf(a) !== addressOf(was)

  // A pin somebody typed survives a move down the street: they placed it
  // because the geocoder was wrong about their yard, and re-resolving undoes
  // exactly the correction they made.
  if (handPlaced && !moved) {
    return { latitude: was!.latitude!, longitude: was!.longitude!,
             geocoded_at: null, why: null }
  }
  if (!moved && was?.latitude != null) {
    return { latitude: was.latitude, longitude: was.longitude!,
             geocoded_at: was.geocoded_at ?? null, why: null }
  }
  const r = await geocode(a)
  return r.ok
    ? { latitude: r.pin.latitude, longitude: r.pin.longitude,
        geocoded_at: new Date().toISOString(), why: null }
    : { latitude: null, longitude: null, geocoded_at: null, why: whyNoPin(r) }
}

/**
 * Write a location's addresses, and say what could not be pinned.
 *
 * Rows are matched by id and updated in place rather than cleared and
 * re-inserted: a row that keeps its id keeps its hand-placed pin, and a
 * delete-then-insert would lose that every time somebody fixed a typo in the
 * city. Anything no longer posted is gone on purpose and is removed.
 *
 * Nothing here writes location.address_line1 or location.latitude. A database
 * trigger keeps those in step with the default address, so there is exactly
 * one writer and the copy cannot drift from the thing it copies.
 */
export async function saveAddresses(
  db: any, accountId: string, locationId: string, posted: Addr[],
  handPin?: { latitude: number | null; longitude: number | null },
): Promise<{ why: string | null }> {
  const { data: existing } = await db.schema('hopper').from('location_address')
    .select('*').eq('location_id', locationId)
  const was = new Map<string, Addr>((existing ?? []).map((r: any) => [r.id, r]))

  let why: string | null = null
  const keep: string[] = []

  for (const a of posted) {
    const before = a.id ? was.get(a.id) ?? null : null
    // A pin typed into the override fields belongs to the physical address and
    // to nothing else, so it is applied there and only there.
    const typed = a.kind === 'physical' && handPin
      && handPin.latitude != null && handPin.longitude != null
      && (handPin.latitude !== before?.latitude || handPin.longitude !== before?.longitude)

    const pin = typed
      ? { latitude: handPin!.latitude, longitude: handPin!.longitude,
          geocoded_at: null, why: null }
      : await pinFor(a, before)
    if (pin.why && !why) why = pin.why

    const row = {
      account_id: accountId, location_id: locationId, kind: a.kind,
      address_line1: a.address_line1, address_line2: a.address_line2,
      city: a.city, region: a.region, postal_code: a.postal_code,
      country: a.country, sort_order: a.sort_order ?? 0,
      latitude: pin.latitude, longitude: pin.longitude,
      geocoded_at: pin.geocoded_at, updated_at: new Date().toISOString(),
    }

    if (before) {
      // A refused UPDATE under a FOR ALL policy changes no rows and raises no
      // error, so the count is the only honest answer.
      const { data: hit } = await db.schema('hopper').from('location_address')
        .update(row).eq('id', a.id).select('id')
      if ((hit ?? []).length > 0) keep.push(a.id!)
    } else {
      const { data: made } = await db.schema('hopper').from('location_address')
        .insert(row).select('id')
      if (made?.[0]?.id) keep.push(made[0].id)
    }
  }

  const gone = (existing ?? []).map((r: any) => r.id).filter((id: string) => !keep.includes(id))
  if (gone.length) {
    await db.schema('hopper').from('location_address').delete().in('id', gone)
  }
  return { why }
}
