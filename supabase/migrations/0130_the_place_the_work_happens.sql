-- 0130 — a location is a record, not a line of text
--
-- `fence_job.site_address` was text. Two jobs at the same yard had two addresses
-- that could disagree by a comma, and there was nowhere to put the thing that
-- belongs to the PLACE rather than to the job: the Navusoft account it bills
-- under, the gate code, the fact that the north drive is the one that takes a
-- truck. Ryan, 13 Sep: a location record, tied to the address.
--
-- WHY NOT `hopper.location`. That table already exists and already holds full
-- addresses — and it holds OUR offices. An office belongs to an organization in
-- the portfolio and shows up on the organization screens; a customer's yard is
-- not one, and putting customer sites in there would have every yard appear in
-- Admin → Organizations → Offices. Same name, different thing.
--
-- WHY NOT a Hopper-wide `site` table. Because nothing else needs one yet.
-- Fence Builder owns this until a second module asks for it, at which point the
-- table moves out of the module and this comment is the argument for doing so.
--
-- THE ADDRESS IS THE KEY. A location is identified by where it is, so a second
-- job at the same yard finds the same record rather than making a rival. The
-- normalised form is generated and unique per account, which is the only thing
-- that can actually stop the duplicate: asking the screen to look first is a
-- check that holds until two people type at once.

create table if not exists hopper.fence_location (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references beebee.accounts(id) on delete cascade,
  entity_id  uuid references hopper.entity(id) on delete set null,
  name       text,
  customer   text,
  line1      text not null,
  line2      text,
  city       text,
  region     text,
  postcode   text,
  country    text not null default 'US',
  lat        numeric(9,6),
  lon        numeric(9,6),
  -- What Navusoft bills this place under. The number the project manager creates
  -- and the accounting sheet is keyed from.
  navusoft_account text,
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  addr_key   text generated always as (
    lower(regexp_replace(coalesce(line1, '') || '|' || coalesce(postcode, ''),
                         '[^a-zA-Z0-9|]', '', 'g'))
  ) stored
);

create unique index if not exists fence_location_one_per_address
  on hopper.fence_location (account_id, addr_key);

create index if not exists fence_location_acct
  on hopper.fence_location (account_id, active, city);

alter table hopper.fence_location enable row level security;

-- Anybody who holds the module anywhere may read the places it works; changing
-- one is the estimate's owner or an administrator, because a location is created
-- during intake and corrected at the survey.
create policy fence_location_read on hopper.fence_location
  for select using (internal.hopper_fence_book(account_id));

create policy fence_location_write on hopper.fence_location
  for all using (internal.hopper_may_manage(account_id)
              or internal.hopper_member(account_id))
       with check (internal.hopper_may_manage(account_id)
                or internal.hopper_member(account_id));

revoke all on hopper.fence_location from anon;

alter table hopper.fence_job
  add column if not exists location_id uuid references hopper.fence_location(id),
  -- The account number AS SENT to accounting, frozen at handoff. The location
  -- holds the live one; this is what the record says went out, for the same
  -- reason an option freezes its takeoff.
  add column if not exists navusoft_sent text,
  add column if not exists navusoft_sent_at timestamptz;

create index if not exists fence_job_location
  on hopper.fence_job (account_id, location_id);

comment on column hopper.fence_job.location_id is
  'Where the work happens. site_address/lat/lon remain as the fallback for a job with no location record yet.';
