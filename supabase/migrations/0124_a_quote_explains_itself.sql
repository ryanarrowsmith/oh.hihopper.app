-- 0124 — a quote explains itself a year later
--
-- An option carries a price. A price with nothing behind it is a number in an
-- argument nobody can win: the rate book moves, the recipe changes, somebody
-- redraws the line, and the quote the customer is holding can no longer be
-- reproduced from anything in the database. That is the state every revision
-- rule in this module exists to avoid.
--
-- So an option keeps the takeoff it was priced from, frozen at the moment
-- somebody put it on the quote. Quantities and sell prices on the option itself,
-- where anybody who can see the job can read them — a project manager arguing
-- about 104 line posts needs the line that says 104.
--
-- The cost side is a different question with a different answer, so it is a
-- different table: `fence_option_cost`, behind the same policy as the rate costs.
-- Keeping it in the same jsonb would have handed every reader of the option the
-- margin, which is the thing 0120 was about.

alter table hopper.fence_option
  add column if not exists takeoff   jsonb,
  add column if not exists priced_at timestamptz;

comment on column hopper.fence_option.takeoff is
  'The measure and the sell lines as priced, frozen. Quantities, never cost.';

create table if not exists hopper.fence_option_cost (
  account_id uuid not null references beebee.accounts(id) on delete cascade,
  option_id  uuid not null references hopper.fence_option(id) on delete cascade,
  detail     jsonb not null,
  primary key (account_id, option_id)
);

create index if not exists fence_option_cost_option
  on hopper.fence_option_cost (account_id, option_id);

alter table hopper.fence_option_cost enable row level security;

create policy fence_option_cost_read on hopper.fence_option_cost
  for select using (internal.hopper_fence_costs(account_id));

-- Written by whoever may write the estimate itself — the same section, the same
-- seal. Reading it is the narrower right of the two.
create policy fence_option_cost_write on hopper.fence_option_cost
  for all using (exists (select 1 from hopper.fence_option o
                          where o.id = option_id and o.account_id = account_id
                            and internal.hopper_fence_edits(o.account_id, o.job_id, 'estimate')))
       with check (exists (select 1 from hopper.fence_option o
                            where o.id = option_id and o.account_id = account_id
                              and internal.hopper_fence_edits(o.account_id, o.job_id, 'estimate')));

revoke all on hopper.fence_option_cost from anon;
