-- ============================================================================
-- 0109 — Fence Builder, as a module of Hopper
--
-- A quote-to-billing tool for permanent, temporary and secure fencing. It never
-- invoices; it hands a keying sheet to whatever the account bills in.
--
-- Three things here are not like the other modules:
--
--  1. ACCESS IS OWNERSHIP, NOT RANK. Elsewhere a level decides what you may do
--     to everything in the module. Here each SECTION of a job is owned by one
--     job on the crew: you edit your own, read everyone else's, and may note on
--     any of them. A project manager outranks nobody.
--  2. A SEALED SECTION IS CLOSED TO ITS OWNER TOO. Sales owns the quote and
--     cannot edit it after handoff. Nobody unseals: a revision supersedes it
--     and leaves the old quote in the record. Not even an administrator, which
--     is the point — the seal is an integrity rule, not a permission.
--  3. MONEY IS COLUMN-LEVEL. Row security cannot hide a column, and a crew that
--     can read the job must not read the margin. See 0110 — the schema's
--     DEFAULT ACL grants `authenticated` table-level select on every new table,
--     so the money columns have to be revoked, not merely left ungranted.
-- ============================================================================

-- ---------------------------------------------------------------- the module
create or replace function internal.hopper_optional_modules()
returns text[] language sql immutable set search_path to '' as $$
  select array['reporting','projects','staffing','meetings','fence']::text[];
$$;

-- ------------------------------------------------------------------ vocabulary
do $$ begin
  create type hopper.fence_class as enum ('permanent','temporary','secure');
exception when duplicate_object then null; end $$;

do $$ begin
  create type hopper.fence_job_role as enum ('sales','pm','field','billing');
exception when duplicate_object then null; end $$;

-- The sections of a job, in the order the work runs. A section is the unit of
-- ownership, of sealing and of the notes rail — which is why it is one list and
-- not three.
do $$ begin
  create type hopper.fence_section as enum
    ('intake','estimate','survey','schedule','sow','ticket','closeout','billing');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- WHO IS WHAT ON A FENCE CREW
-- One row per person per account. Not a Hopper role and not a grant: those say
-- what you may open, this says which part of a job is yours.
-- ============================================================================
create table if not exists hopper.fence_person (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references beebee.accounts(id) on delete cascade,
  person_id    uuid not null references hopper.person(id) on delete cascade,
  job_role     hopper.fence_job_role not null,
  lang         text not null default 'en' check (lang in ('en','es')),
  created_at   timestamptz not null default now(),
  unique (account_id, person_id)
);
create index if not exists fence_person_acct_idx on hopper.fence_person (account_id, person_id);
comment on table hopper.fence_person is
  'Which job somebody does on a fence crew. Decides which sections of a job they may edit; everything else they read.';
comment on column hopper.fence_person.lang is
  'The language their crew ticket and scope of work arrive in. A setting, not a toggle they have to find.';

-- ============================================================================
-- THE JOB
-- ============================================================================
create table if not exists hopper.fence_job (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references beebee.accounts(id) on delete cascade,
  entity_id     uuid not null references hopper.entity(id) on delete restrict,
  ref           text not null,
  name          text not null,
  customer      text,
  site_address  text,
  lat           numeric(9,6),
  lon           numeric(9,6),
  pin_note      text,
  cls           hopper.fence_class,
  spec_code     text,
  stage         hopper.fence_section not null default 'intake',
  entered_at    hopper.fence_section not null default 'intake',
  crew          text,
  starts_on     date,
  -- what the customer accepted. Frozen. A revision replaces it and records why.
  sold_price    numeric(12,2),
  sold_spec     text,
  sold_on       date,
  complete      boolean not null default false,
  created_by    uuid references hopper.person(id),
  created_at    timestamptz not null default now(),
  unique (account_id, ref)
);
create index if not exists fence_job_acct_idx on hopper.fence_job (account_id, entity_id, complete);
comment on table hopper.fence_job is
  'One customer, one site, one measured line. Options price that same line different ways.';
comment on column hopper.fence_job.entered_at is
  'The phase the job entered at. A new job starts at intake; a relocation on an open rental starts at survey, and the steps before it read as not used rather than sitting unfinished forever.';
comment on column hopper.fence_job.sold_price is
  'The price the customer accepted. Frozen — without a baseline the delta on a revision reads zero forever.';

-- ============================================================================
-- THE SEAL
-- ============================================================================
create table if not exists hopper.fence_seal (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  section     hopper.fence_section not null,
  sealed_by   uuid references hopper.person(id),
  sealed_at   timestamptz not null default now(),
  unique (job_id, section)
);
create index if not exists fence_seal_acct_idx on hopper.fence_seal (account_id, job_id);
comment on table hopper.fence_seal is
  'A section closed at handoff. Closed to its owner as well, and to administrators: nothing unseals, a revision supersedes.';

-- ============================================================================
-- THE MEASURE, THE OPTIONS, THE REVISIONS
-- ============================================================================
create table if not exists hopper.fence_run (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  option_id   uuid,
  label       text not null,
  plan_ft     numeric(10,2) not null,
  grade_pct   numeric(5,2) not null default 0,
  closed_loop boolean not null default false,
  sort        int not null default 0
);
create index if not exists fence_run_acct_idx on hopper.fence_run (account_id, job_id);
comment on column hopper.fence_run.grade_pct is
  'Read from the terrain model, not typed. It is what makes the corrected length honest.';

create table if not exists hopper.fence_gate (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  option_id   uuid,
  rate_code   text not null,
  qty         int not null default 1
);
create index if not exists fence_gate_acct_idx on hopper.fence_gate (account_id, job_id);

create table if not exists hopper.fence_option (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  label       text not null,
  spec_code   text,
  price       numeric(12,2),
  note        text,
  accepted    boolean not null default false,
  declined_why text,
  sort        int not null default 0
);
create index if not exists fence_option_acct_idx on hopper.fence_option (account_id, job_id);
comment on table hopper.fence_option is
  'Options price one measured line different ways. An option inherits the job''s runs unless it overrides them, which is what makes a scope option work.';

create table if not exists hopper.fence_revision (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references beebee.accounts(id) on delete cascade,
  job_id       uuid not null references hopper.fence_job(id) on delete cascade,
  reason       text not null,
  sold_before  numeric(12,2),
  sold_after   numeric(12,2),
  held_price   boolean not null default false,
  opened_by    uuid references hopper.person(id),
  opened_at    timestamptz not null default now()
);
create index if not exists fence_revision_acct_idx on hopper.fence_revision (account_id, job_id);
comment on table hopper.fence_revision is
  'A revision does not edit the old quote, it replaces it and leaves the old one in the record. Editing loses the price; revising corrects it.';

alter table hopper.fence_run drop constraint if exists fence_run_option_fk;
alter table hopper.fence_run add constraint fence_run_option_fk
  foreign key (option_id) references hopper.fence_option(id) on delete cascade;
alter table hopper.fence_gate drop constraint if exists fence_gate_option_fk;
alter table hopper.fence_gate add constraint fence_gate_option_fk
  foreign key (option_id) references hopper.fence_option(id) on delete cascade;

-- ============================================================================
-- THE PLAN, THE NOTES, THE PICTURES
-- ============================================================================
create table if not exists hopper.fence_task (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  section     hopper.fence_section not null,
  en          text not null,
  es          text,
  due_on      date,
  done        boolean not null default false,
  done_by     uuid references hopper.person(id),
  done_at     timestamptz,
  from_plan   boolean not null default true,
  sort        int not null default 0
);
create index if not exists fence_task_acct_idx on hopper.fence_task (account_id, job_id, section);

create table if not exists hopper.fence_note (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  section     hopper.fence_section,
  body        text not null,
  kind        text not null default 'note',
  author_id   uuid references hopper.person(id),
  by_crew     text,
  created_at  timestamptz not null default now()
);
create index if not exists fence_note_acct_idx on hopper.fence_note (account_id, job_id, created_at desc);
comment on table hopper.fence_note is
  'One stream per job — notes and stamped events on the same rail. Anybody who can read a section may note on it; that is what read-and-note means.';

create table if not exists hopper.fence_photo (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  section     hopper.fence_section,
  path        text not null,
  caption     text,
  taken_by    text,
  created_at  timestamptz not null default now()
);
create index if not exists fence_photo_acct_idx on hopper.fence_photo (account_id, job_id);

-- ============================================================================
-- THE SCOPE OF WORK
-- ============================================================================
create table if not exists hopper.fence_sow (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  body_en     text,
  body_es     text,
  words_en    int,
  words_es    int,
  sentences_en int,
  sentences_es int,
  readability numeric(5,2),
  signed_by   uuid references hopper.person(id),
  signed_at   timestamptz,
  sent_at     timestamptz,
  unique (job_id)
);
create index if not exists fence_sow_acct_idx on hopper.fence_sow (account_id, job_id);
comment on column hopper.fence_sow.signed_at is
  'A machine score is not an approval. A bilingual person signs before a crew is asked to build from it.';

-- ============================================================================
-- THE CREW LINK
-- No anon grants anywhere. The token is resolved by the app''s own route with
-- the service role, because a definer taking arguments in an exposed schema is
-- an HTTP endpoint and this schema does not get those.
-- ============================================================================
create table if not exists hopper.fence_ticket_link (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  token       uuid not null default gen_random_uuid(),
  issued_by   uuid references hopper.person(id),
  issued_at   timestamptz not null default now(),
  expires_on  date,
  revoked     boolean not null default false,
  cycled_why  text,
  unique (token)
);
create index if not exists fence_ticket_link_acct_idx on hopper.fence_ticket_link (account_id, job_id) where not revoked;
comment on table hopper.fence_ticket_link is
  'A per-job link, cycled when somebody leaves and expired when the job is marked installed. A revoked token is a closed door, not a stale page.';

-- ============================================================================
-- THE RATE BOOK
-- sell is generated so a sell price cannot drift from the cost it came from,
-- and reading it needs no access to either.
-- ============================================================================
create table if not exists hopper.fence_rate (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  code        text not null,
  kind        text not null,
  grp         text,
  cls         hopper.fence_class,
  name_en     text not null,
  name_es     text,
  uom         text not null,
  cost        numeric(12,4) not null default 0,
  markup      numeric(6,3) not null default 1,
  sell        numeric(12,4) generated always as (round(cost * markup, 4)) stored,
  verified_on date,
  source      text,
  active      boolean not null default true,
  unique (account_id, code)
);
create index if not exists fence_rate_acct_idx on hopper.fence_rate (account_id, kind, active);
comment on table hopper.fence_rate is
  'Our cost and a markup on it. Every seeded figure is a placeholder until real cost and sell replace it.';

-- ============================================================================
-- BILLING — configured per account, Navusoft first
-- ============================================================================
create table if not exists hopper.fence_billing_target (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references beebee.accounts(id) on delete cascade,
  name         text not null,
  to_email     text,
  instructions text,
  active       boolean not null default true,
  unique (account_id, name)
);
create index if not exists fence_billing_target_acct_idx on hopper.fence_billing_target (account_id, active);
comment on table hopper.fence_billing_target is
  'Where the keying sheet goes and how it is laid out. Navusoft is the first profile, not the only shape — Fence Builder never invoices in either case.';

create table if not exists hopper.fence_charge_line (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  code        text not null,
  description text not null,
  qty         numeric(12,2),
  uom         text,
  amount      numeric(12,2),
  recurring   boolean not null default false,
  sort        int not null default 0
);
create index if not exists fence_charge_line_acct_idx on hopper.fence_charge_line (account_id, job_id);
comment on column hopper.fence_charge_line.code is
  'A guess until somebody hands over the real import template. Navusoft publishes no import schema.';

-- ============================================================================
-- THE PREDICATES
-- Every policy below asks one of these. None of them is inline, because a
-- policy that reads the table it guards re-enters its own policy.
-- ============================================================================

-- Which job owns which section. One list, so a screen and a policy cannot
-- disagree about whose section it is.
create or replace function internal.hopper_fence_owner(section hopper.fence_section)
returns hopper.fence_job_role language sql immutable set search_path to '' as $$
  select case section
    when 'intake'   then 'sales'
    when 'estimate' then 'sales'
    when 'survey'   then 'pm'
    when 'schedule' then 'pm'
    when 'sow'      then 'pm'
    when 'ticket'   then 'field'
    when 'closeout' then 'pm'
    when 'billing'  then 'billing'
  end::hopper.fence_job_role;
$$;

-- May this person open Fence Builder for the organization this job hangs in?
create or replace function internal.hopper_fence_reach(acct uuid, job uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from hopper.fence_job j
     where j.id = job and j.account_id = acct
       and internal.hopper_module_level(acct, 'fence', j.entity_id, uid) is not null
  );
$$;

-- May this person EDIT this section of this job? Ownership, then the seal.
-- An administrator gets ownership of everything and the seal all the same:
-- sealing is an integrity rule, not a permission.
create or replace function internal.hopper_fence_edits(
  acct uuid, job uuid, section hopper.fence_section, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to '' as $$
  select internal.hopper_fence_reach(acct, job, uid)
     and not exists (select 1 from hopper.fence_seal s
                      where s.job_id = job and s.section = section)
     and exists (
       select 1 from hopper.fence_job j
        where j.id = job and j.account_id = acct
          and internal.hopper_module_level(acct, 'fence', j.entity_id, uid) in ('edit','admin'))
     and (
       internal.hopper_may_manage(acct, uid)
       or exists (
         select 1 from hopper.fence_person fp
          where fp.account_id = acct
            and fp.person_id = internal.hopper_person(acct, uid)
            and fp.job_role = internal.hopper_fence_owner(section))
     );
$$;

comment on function internal.hopper_fence_edits(uuid, uuid, hopper.fence_section, uuid) is
  'Ownership, not rank. You edit the sections your job owns; you read the rest and may note on them. A sealed section is closed to everybody.';

-- ============================================================================
-- ROW SECURITY
-- ============================================================================
alter table hopper.fence_person        enable row level security;
alter table hopper.fence_job           enable row level security;
alter table hopper.fence_seal          enable row level security;
alter table hopper.fence_run           enable row level security;
alter table hopper.fence_gate          enable row level security;
alter table hopper.fence_option        enable row level security;
alter table hopper.fence_revision      enable row level security;
alter table hopper.fence_task          enable row level security;
alter table hopper.fence_note          enable row level security;
alter table hopper.fence_photo         enable row level security;
alter table hopper.fence_sow           enable row level security;
alter table hopper.fence_ticket_link   enable row level security;
alter table hopper.fence_rate          enable row level security;
alter table hopper.fence_billing_target enable row level security;
alter table hopper.fence_charge_line   enable row level security;

drop policy if exists fence_person_read on hopper.fence_person;
create policy fence_person_read on hopper.fence_person for select
  using (internal.hopper_member(account_id));
drop policy if exists fence_person_write on hopper.fence_person;
create policy fence_person_write on hopper.fence_person for all
  using (internal.hopper_may_manage(account_id))
  with check (internal.hopper_may_manage(account_id));

drop policy if exists fence_job_read on hopper.fence_job;
create policy fence_job_read on hopper.fence_job for select
  using (internal.hopper_module_level(account_id, 'fence', entity_id) is not null);
drop policy if exists fence_job_write on hopper.fence_job;
create policy fence_job_write on hopper.fence_job for all
  using (internal.hopper_fence_edits(account_id, id, 'intake')
         or internal.hopper_fence_edits(account_id, id, 'survey'))
  with check (internal.hopper_module_level(account_id, 'fence', entity_id) in ('edit','admin'));

drop policy if exists fence_seal_read on hopper.fence_seal;
create policy fence_seal_read on hopper.fence_seal for select
  using (internal.hopper_fence_reach(account_id, job_id));
-- Sealing is its own grant, and nothing deletes a seal.
drop policy if exists fence_seal_add on hopper.fence_seal;
create policy fence_seal_add on hopper.fence_seal for insert
  with check (internal.hopper_fence_reach(account_id, job_id)
              and internal.hopper_granted(account_id, 'fence_seal', 'edit'));

do $$
declare t text;
begin
  foreach t in array array['fence_run','fence_gate','fence_option','fence_revision',
                           'fence_task','fence_photo','fence_sow','fence_charge_line']
  loop
    execute format('drop policy if exists %I on hopper.%I', t || '_read', t);
    execute format('create policy %I on hopper.%I for select using (internal.hopper_fence_reach(account_id, job_id))', t || '_read', t);
  end loop;
end $$;

-- Writes, each against the section that owns the thing.
drop policy if exists fence_run_write on hopper.fence_run;
create policy fence_run_write on hopper.fence_run for all
  using (internal.hopper_fence_edits(account_id, job_id, 'estimate'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

drop policy if exists fence_gate_write on hopper.fence_gate;
create policy fence_gate_write on hopper.fence_gate for all
  using (internal.hopper_fence_edits(account_id, job_id, 'estimate'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

drop policy if exists fence_option_write on hopper.fence_option;
create policy fence_option_write on hopper.fence_option for all
  using (internal.hopper_fence_edits(account_id, job_id, 'estimate'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

drop policy if exists fence_revision_add on hopper.fence_revision;
create policy fence_revision_add on hopper.fence_revision for insert
  with check (internal.hopper_fence_edits(account_id, job_id, 'survey'));

drop policy if exists fence_task_write on hopper.fence_task;
create policy fence_task_write on hopper.fence_task for all
  using (internal.hopper_fence_edits(account_id, job_id, section))
  with check (internal.hopper_fence_edits(account_id, job_id, section));

drop policy if exists fence_sow_write on hopper.fence_sow;
create policy fence_sow_write on hopper.fence_sow for all
  using (internal.hopper_fence_edits(account_id, job_id, 'sow'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'sow'));

drop policy if exists fence_photo_write on hopper.fence_photo;
create policy fence_photo_write on hopper.fence_photo for all
  using (internal.hopper_fence_edits(account_id, job_id, coalesce(section, 'closeout'::hopper.fence_section)))
  with check (internal.hopper_fence_edits(account_id, job_id, coalesce(section, 'closeout'::hopper.fence_section)));

drop policy if exists fence_charge_line_write on hopper.fence_charge_line;
create policy fence_charge_line_write on hopper.fence_charge_line for all
  using (internal.hopper_fence_edits(account_id, job_id, 'billing'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'billing'));

-- A note is the exception, and it is the whole point of read-and-note: anybody
-- who can read the job may write one. Nobody edits somebody else's.
drop policy if exists fence_note_read on hopper.fence_note;
create policy fence_note_read on hopper.fence_note for select
  using (internal.hopper_fence_reach(account_id, job_id));
drop policy if exists fence_note_add on hopper.fence_note;
create policy fence_note_add on hopper.fence_note for insert
  with check (internal.hopper_fence_reach(account_id, job_id)
              and author_id = internal.hopper_person(account_id));
drop policy if exists fence_note_own on hopper.fence_note;
create policy fence_note_own on hopper.fence_note for update
  using (author_id = internal.hopper_person(account_id))
  with check (author_id = internal.hopper_person(account_id));

-- The link is the PM's, and cycling one is its own grant.
drop policy if exists fence_ticket_link_read on hopper.fence_ticket_link;
create policy fence_ticket_link_read on hopper.fence_ticket_link for select
  using (internal.hopper_fence_reach(account_id, job_id));
drop policy if exists fence_ticket_link_write on hopper.fence_ticket_link;
create policy fence_ticket_link_write on hopper.fence_ticket_link for all
  using (internal.hopper_granted(account_id, 'fence_link', 'edit'))
  with check (internal.hopper_granted(account_id, 'fence_link', 'edit'));

drop policy if exists fence_rate_read on hopper.fence_rate;
create policy fence_rate_read on hopper.fence_rate for select
  using (internal.hopper_member(account_id)
         and internal.hopper_module_level(account_id, 'fence', null) is not null);
drop policy if exists fence_rate_write on hopper.fence_rate;
create policy fence_rate_write on hopper.fence_rate for all
  using (internal.hopper_granted(account_id, 'fence_costs', 'edit'))
  with check (internal.hopper_granted(account_id, 'fence_costs', 'edit'));

drop policy if exists fence_billing_target_read on hopper.fence_billing_target;
create policy fence_billing_target_read on hopper.fence_billing_target for select
  using (internal.hopper_member(account_id));
drop policy if exists fence_billing_target_write on hopper.fence_billing_target;
create policy fence_billing_target_write on hopper.fence_billing_target for all
  using (internal.hopper_may_manage(account_id))
  with check (internal.hopper_may_manage(account_id));

-- ============================================================================
-- MONEY IS COLUMN-LEVEL
-- A policy is row-level and a row is all or nothing, so a crew that may read
-- the job would read the margin with it. These columns are revoked outright;
-- the app reads them server-side once it knows who is asking.
-- ============================================================================
do $$
declare r record; cols text;
begin
  -- everything a signed-in person may read, money left out rather than revoked:
  -- a table-level grant cannot be taken back one column at a time.
  for r in select * from (values
      ('fence_job',         array['sold_price']),
      ('fence_option',      array['price']),
      ('fence_charge_line', array['amount']),
      ('fence_rate',        array['cost','markup']),
      ('fence_revision',    array['sold_before','sold_after'])
    ) as t(tbl, hide)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'hopper' and table_name = r.tbl
       and not (column_name = any(r.hide));
    execute format('grant select (%s) on hopper.%I to authenticated', cols, r.tbl);
    execute format('grant insert, update, delete on hopper.%I to authenticated', r.tbl);
  end loop;

  -- the rest carry no money and are granted whole
  foreach cols in array array['fence_person','fence_seal','fence_run','fence_gate',
                              'fence_task','fence_note','fence_photo','fence_sow',
                              'fence_ticket_link','fence_billing_target']
  loop
    execute format('grant select, insert, update, delete on hopper.%I to authenticated', cols);
  end loop;
end $$;

-- Nothing here is ever anon's. The crew ticket is a route, not an endpoint.
do $$
declare t text;
begin
  foreach t in array array['fence_person','fence_job','fence_seal','fence_run','fence_gate',
                           'fence_option','fence_revision','fence_task','fence_note',
                           'fence_photo','fence_sow','fence_ticket_link','fence_rate',
                           'fence_billing_target','fence_charge_line']
  loop
    execute format('revoke all on hopper.%I from anon', t);
  end loop;
end $$;
