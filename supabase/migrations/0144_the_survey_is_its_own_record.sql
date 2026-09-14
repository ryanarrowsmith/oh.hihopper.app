/* 0144 — THE SURVEY IS ITS OWN RECORD.

   Signing an estimate sets the job's stage to `survey` and always has. There
   was nowhere for a survey to land, so a walked length had no home and every
   job priced as if the ground were flat.

   WHY THE SURVEY DOES NOT WRITE TO fence_run. That table's write policy is
   `hopper_fence_edits(account, job, 'estimate')`, and the signature seals the
   estimate — so the project manager cannot edit a run, and SHOULD NOT. The
   estimate is a number somebody signed; a survey that quietly overwrites it
   leaves nobody able to say what changed or why the price moved. The walked
   figure sits BESIDE the drawn one, in its own table, owned by the survey
   section, and the two are shown together with the difference between them.
   That is also what the screen is for.

   FIVE TABLES, and each is one question:
     fence_condition          what can be found on a site, and what it prices through
     fence_job_condition      what the QUOTE assumed was there
     fence_survey_condition   what the site actually had
     fence_survey_run         what the line actually measured on the ground
     fence_survey             the locate, the access, and the one decision

   THE CONDITIONS COME IN PAIRS for the same reason the runs do. Ryan, 14 Sep:
   yes, the salesperson can tick "existing fence to remove" at the estimate --
   an old fence is usually visible on the aerial and the customer says so on the
   phone, so the FACT is knowable even when the footage is not. That tick is
   part of the quote, and the signature seals it. What the project manager finds
   standing there is a separate row in a separate table, owned by the survey, so
   the two sit side by side with the difference between them showing.

   THE ONE DECISION. Ryan, 14 Sep: when the survey moves the price, nothing
   reaches the customer automatically. The difference is sometimes worth eating
   and sometimes worth a conversation, and only the person who just walked the
   site knows which — so `outcome` is 'absorb' or 'review', and it is null until
   they say. */

-- ------------------------------------------------------ what a site can have
create table if not exists hopper.fence_condition (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  code        text not null,
  name_en     text not null,
  name_es     text,
  blurb_en    text,
  blurb_es    text,
  /* TWO CODES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS -- the same pair
     fence_gate_type already carries.

     rate_code is the RATE BOOK line this prices through. A condition does not
     get a price of its own: "410 ft of 4-foot chain link to remove" is a
     quantity times a book rate, exactly like fabric or concrete, and a price
     kept anywhere else would be a second rate book hidden from the screen that
     manages the first. That argument was already settled for fence_recipe.

     charge_code is what it BILLS under when the handoff goes to accounting.

     Both nullable, and a null is not nothing: a condition whose rate_code names
     no book line MEASURES BUT DOES NOT PRICE, and the screen says so by name
     rather than quietly adding zero. lib/price.ts has refused to treat a missing
     figure as nought since it was written; this is the same rule. */
  rate_code   text,
  charge_code text,
  /* Whether it asks for a number. "410 ft of fence to remove" is a different
     fact from "there is rock", and the bill needs the 410.
     The UNIT is not stored here -- it is the rate book line's own uom, so feet
     and each and ton are defined in one place and cannot disagree. */
  wants_qty   boolean not null default false,
  /* WHETHER SALES MAY TICK IT. Ryan, 14 Sep: yes for an existing fence -- it is
     usually on the aerial and the customer says so on the phone. Not for rock:
     nobody guesses at rock from a photograph, and a condition sales cannot
     honestly know is a condition that belongs to the survey alone. Which are
     which is a column rather than a rule in code, so it is an admin decision. */
  at_estimate boolean not null default false,
  sort        integer not null default 0,
  active      boolean not null default true
);
create unique index if not exists fence_condition_code
  on hopper.fence_condition (account_id, lower(code));
create index if not exists fence_condition_acct
  on hopper.fence_condition (account_id, sort);

alter table hopper.fence_condition enable row level security;

/* Read it wherever the rate book is readable -- the list is account-wide, like
   the specs and the gate types, so it asks the same question they do. */
drop policy if exists fence_condition_read on hopper.fence_condition;
create policy fence_condition_read on hopper.fence_condition for select to authenticated
  using (internal.hopper_fence_book(account_id));

drop policy if exists fence_condition_write on hopper.fence_condition;
create policy fence_condition_write on hopper.fence_condition for all to authenticated
  using (internal.hopper_may_manage(account_id))
  with check (internal.hopper_may_manage(account_id));

-- --------------------------------------------------------- the survey itself
create table if not exists hopper.fence_survey (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references beebee.accounts(id) on delete cascade,
  job_id         uuid not null references hopper.fence_job(id) on delete cascade,
  /* Oklahoma 811. The only field here that can stop a job legally, so it holds
     DATES rather than a yes: dig_from gates scheduling, and locate_expires is
     what catches a job that slipped three weeks and would have been dug on a
     dead ticket. */
  locate_ticket  text,
  dig_from       date,
  locate_expires date,
  access         text,
  ask_for        text,
  utilities      text,
  note           text,
  outcome        text check (outcome in ('absorb', 'review')),
  closed_at      timestamptz,
  closed_by      uuid references hopper.person(id),
  created_at     timestamptz not null default now()
);
create unique index if not exists fence_survey_job
  on hopper.fence_survey (job_id);
create index if not exists fence_survey_acct
  on hopper.fence_survey (account_id, job_id);

-- ------------------------------------------- what the line measured on foot
create table if not exists hopper.fence_survey_run (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  run_id      uuid not null references hopper.fence_run(id) on delete cascade,
  /* Null means "nobody corrected this one", which is different from zero and
     is why the screen shows the drawn figure standing. */
  walked_ft   numeric(10,1) check (walked_ft is null or walked_ft >= 0),
  /* Here a grade IS nullable, unlike fence_run's: at the estimate a missing
     grade means level ground because nobody has looked, but on a survey it
     means this run has not been walked yet. */
  grade_pct   numeric(5,2) check (grade_pct is null or abs(grade_pct) <= 60),
  measured_by text check (measured_by in ('wheel', 'laser', 'plans', 'typed')),
  note        text
);
create unique index if not exists fence_survey_run_one
  on hopper.fence_survey_run (run_id);
create index if not exists fence_survey_run_job
  on hopper.fence_survey_run (account_id, job_id);

-- ------------------------------------------- what the quote assumed was there
create table if not exists hopper.fence_job_condition (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references beebee.accounts(id) on delete cascade,
  job_id       uuid not null references hopper.fence_job(id) on delete cascade,
  condition_id uuid not null references hopper.fence_condition(id) on delete restrict,
  detail       text,
  qty          numeric(12,2) check (qty is null or qty >= 0),
  found_at     timestamptz not null default now()
);
create unique index if not exists fence_job_condition_one
  on hopper.fence_job_condition (job_id, condition_id);
create index if not exists fence_job_condition_job
  on hopper.fence_job_condition (account_id, job_id);

-- ---------------------------------------------- what the site actually had
create table if not exists hopper.fence_survey_condition (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references beebee.accounts(id) on delete cascade,
  job_id       uuid not null references hopper.fence_job(id) on delete cascade,
  condition_id uuid not null references hopper.fence_condition(id) on delete restrict,
  detail       text,
  qty          numeric(12,2) check (qty is null or qty >= 0),
  found_at     timestamptz not null default now()
);
create unique index if not exists fence_survey_condition_one
  on hopper.fence_survey_condition (job_id, condition_id);
create index if not exists fence_survey_condition_job
  on hopper.fence_survey_condition (account_id, job_id);

/* THE ESTIMATE SIDE ANSWERS TO THE ESTIMATE. Anybody who can reach the job can
   read what the quote assumed; only whoever owns that section can change it,
   and the signature seals it like everything else sales touches. */
alter table hopper.fence_job_condition enable row level security;
drop policy if exists fence_job_condition_read on hopper.fence_job_condition;
create policy fence_job_condition_read on hopper.fence_job_condition
  for select to authenticated
  using (internal.hopper_fence_reach(account_id, job_id));
drop policy if exists fence_job_condition_write on hopper.fence_job_condition;
create policy fence_job_condition_write on hopper.fence_job_condition
  for all to authenticated
  using (internal.hopper_fence_edits(account_id, job_id, 'estimate'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

/* THE SAME THREE POLICIES ON THE SURVEY'S OWN TABLES, because they are the same
   kind of thing: readable by anybody who can reach the job, writable only by
   whoever owns the SURVEY section -- which is the project manager, and stops
   being anybody once the survey is sealed, seal beating administrator as
   always. */
do $$
declare t text;
begin
  foreach t in array array['fence_survey', 'fence_survey_run', 'fence_survey_condition'] loop
    execute format('alter table hopper.%I enable row level security', t);
    execute format('drop policy if exists %I on hopper.%I', t || '_read', t);
    execute format(
      'create policy %I on hopper.%I for select to authenticated
         using (internal.hopper_fence_reach(account_id, job_id))', t || '_read', t);
    execute format('drop policy if exists %I on hopper.%I', t || '_write', t);
    execute format(
      'create policy %I on hopper.%I for all to authenticated
         using (internal.hopper_fence_edits(account_id, job_id, ''survey''))
         with check (internal.hopper_fence_edits(account_id, job_id, ''survey''))',
      t || '_write', t);
  end loop;
end $$;

-- ------------------------------------------------------- the terrain reading
/* WHAT THE AERIAL CANNOT SEE FROM ABOVE. Ryan, 14 Sep: read the fall off the
   elevation model at ESTIMATE time and flag it -- but only when it is caught,
   so a flat lot says nothing at all.

   NOT A LENGTH CORRECTION. A 7.5% grade over 186 feet adds six inches; even a
   brutal 20% adds 2%. What a slope actually costs is the BUILD METHOD -- steps
   instead of rakes, longer posts, more terminal posts, and the labor to set
   them -- which is a condition with a charge code, not a multiplier on feet.
   So this stores the fall and the steepest leg, and the screen turns them into
   a sentence and a pre-ticked condition rather than into a number on the quote.

   terrain_key is a cheap fingerprint of the run's points. A save whose key
   matches skips the fetch, so drawing a line does not mean a tile request every
   two seconds. */
alter table hopper.fence_run
  add column if not exists fall_ft     numeric(8,1),
  add column if not exists steepest    numeric(5,2),
  add column if not exists terrain_key text,
  add column if not exists terrain_at  timestamptz;

comment on column hopper.fence_run.fall_ft is
  'Total rise and fall along the run, in feet, sampled from the elevation model. Never priced — it flags a run that will need stepping.';
comment on column hopper.fence_run.steepest is
  'The steepest leg, in percent, from the same sampling. What decides whether the screen says anything at all.';
comment on column hopper.fence_run.terrain_key is
  'Fingerprint of the points the reading was taken from. Unchanged key, no fetch.';

/* NOTHING ATTACHES THE AUDIT HERE, and that is not an omission.
   internal.audit_new_table is an event trigger: a table created in `hopper`
   registers itself in beebee.audited_tables as it is created. The first draft
   of this migration called internal.attach_audit by hand and failed -- it takes
   eight arguments, none of them defaulted -- which is the useful discovery,
   because the lesson from 0109 was the opposite one: RENAMING a table ends its
   coverage silently, since the registry is keyed by name. Creating one does not.
   Verified after applying: all five tables present in beebee.audited_tables. */
