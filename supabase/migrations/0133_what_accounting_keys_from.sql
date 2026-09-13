-- 0133 — the sale, and the sheet accounting keys from it
--
-- Fence Builder does not invoice. It writes accounting ONE MESSAGE laid out to be
-- keyed from, with the whole job attached. Everything here exists to make that
-- message derivable rather than retyped.
--
-- Four things were missing.
--
-- WHICH QUOTE WAS SOLD. `fence_option.accepted` has existed since 0110 and
-- nothing ever set it, so a job with three options had no answer to "bill what?".
-- A partial unique index makes the answer singular: one sold option per job,
-- enforced rather than hoped for, because two accepted options is a question the
-- billing screen cannot answer and must not guess at.
--
-- WHICH CHARGE CODE A LINE BILLS UNDER. The recipe (0123) turns a measure into
-- rate lines. This turns rate lines into CHARGE lines, and it is a table for the
-- same reason the recipe is: it is a trade rule, it differs by class, and it will
-- be wrong first and corrected on a screen.
--
-- An absent gate rule is not an omission, it is a statement. A temporary fence
-- rental includes its panel gates; a permanent fence itemizes them. So a class
-- with no `gate` rule rolls its gates into the fence line, and a gate type that
-- names its own code always bills on its own line. Secure is left with no rule at
-- all on purpose: nobody has said what a secure install bills under, and the
-- screen names the gap rather than quietly billing it as chain link.
--
-- WHAT WENT OUT. `fence_handoff` is append-only — select and insert policies and
-- nothing else — because it is a record of a message somebody sent, and a record
-- you can edit afterwards is a record of nothing. A re-send is a second row, which
-- is also how accounting losing the first one stays visible.
--
-- WHY `fence_job.navusoft_sent` STAYS. It duplicates the newest handoff row. It is
-- written by the same action, in the same breath, and it exists so the jobs list
-- can show what has gone out without joining a table per row. One writer, named
-- here, so nobody has to wonder which is authoritative: the handoff row is, and
-- the column is a cache of it.

-- ---------------------------------------------------------------- the sale
create unique index if not exists fence_option_one_sold
  on hopper.fence_option (account_id, job_id) where accepted;

comment on column hopper.fence_option.accepted is
  'The one quote the customer bought. At most one per job — see fence_option_one_sold.';

-- ------------------------------------------------ rate lines to charge lines
create table if not exists hopper.fence_charge_rule (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  cls         text not null check (cls in ('permanent', 'temporary', 'secure')),
  -- What this rule collects. 'fence' is everything the recipe priced that is not
  -- a gate, rolled into one line billed by the foot. 'gate' is the default code
  -- for a gate that does not name one itself; with no such rule, a gate bills
  -- inside the fence line.
  takes       text not null check (takes in ('fence', 'gate')),
  charge_code text not null,
  note        text,
  active      boolean not null default true,
  unique (account_id, cls, takes)
);

create index if not exists fence_charge_rule_acct
  on hopper.fence_charge_rule (account_id, cls, takes);

alter table hopper.fence_charge_rule enable row level security;

create policy fence_charge_rule_read on hopper.fence_charge_rule
  for select using (internal.hopper_fence_book(account_id));

create policy fence_charge_rule_write on hopper.fence_charge_rule
  for all using (internal.hopper_may_manage(account_id))
       with check (internal.hopper_may_manage(account_id));

revoke all on hopper.fence_charge_rule from anon;

insert into hopper.fence_charge_rule (account_id, cls, takes, charge_code, note)
values
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2', 'permanent', 'fence', 'INST-CL',
   'Everything the recipe priced except the gates, by the foot'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2', 'permanent', 'gate',  'GATE-VD',
   'Only for a gate type that names no code of its own'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2', 'temporary', 'fence', 'RENT-TF',
   'The rental includes its panel gates, which is why temporary has no gate rule')
on conflict (account_id, cls, takes) do nothing;

-- A gate type that bills on its own line says so here. Null means it rides in
-- the fence line unless the class has a gate rule.
alter table hopper.fence_gate_type
  add column if not exists charge_code text;

update hopper.fence_gate_type
   set charge_code = case when coalesce(width_ft, 0) >= 10 then 'GATE-VD' else 'GATE-WK' end
 where cls = 'permanent' and charge_code is null;

comment on column hopper.fence_gate_type.charge_code is
  'The charge code this gate bills on its own line under. Null: it rides inside the fence line.';

-- ---------------------------------------------------------- the charge lines
alter table hopper.fence_charge_line
  -- Which sold quote these were built from. A revision supersedes the quote, and
  -- a sheet that cannot say which quote it came from cannot be checked against it.
  add column if not exists option_id uuid references hopper.fence_option(id) on delete set null,
  -- A line somebody changed by hand survives a rebuild. Without this the biller's
  -- correction is silently undone the next time the sheet is generated, which is
  -- the worst kind of bug: it looks like the correction never saved.
  add column if not exists edited boolean not null default false,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists fence_charge_line_job
  on hopper.fence_charge_line (account_id, job_id, sort);

-- --------------------------------------------------------- what went out
create table if not exists hopper.fence_handoff (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  target_id   uuid references hopper.fence_billing_target(id) on delete set null,
  -- Frozen, like an option's takeoff. The location's number can be corrected
  -- later; what accounting was told cannot.
  navusoft_account text,
  to_email    text,
  how         text not null check (how in ('copied', 'mailed')),
  sheet       jsonb not null,
  note        text,
  sent_by     uuid references hopper.person(id),
  sent_at     timestamptz not null default now()
);

create index if not exists fence_handoff_job
  on hopper.fence_handoff (account_id, job_id, sent_at desc);

alter table hopper.fence_handoff enable row level security;

create policy fence_handoff_read on hopper.fence_handoff
  for select using (internal.hopper_fence_reach(account_id, job_id));

-- Insert only. No update policy and no delete policy, deliberately: see the head
-- of this file.
create policy fence_handoff_send on hopper.fence_handoff
  for insert with check (
    internal.hopper_fence_edits(account_id, job_id, 'billing'::hopper.fence_section));

revoke all on hopper.fence_handoff from anon;

comment on table hopper.fence_handoff is
  'Each time a job was handed to accounting, and exactly what it was handed. Append-only.';
