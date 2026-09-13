-- 0120 — money is a person question, so RLS has to be the one answering it
--
-- 0110 hid every money column with a column grant: revoke SELECT on the table,
-- grant it back on the columns that are not money. That is airtight and it is
-- wrong, because a column grant is per ROLE and every signed-in person in this
-- app is the same role, `authenticated`. So "the crew cannot see the price"
-- came out as "NOBODY can see the price" — the account owner included. A
-- salesperson could not read the figure they had just sold, the rate book could
-- never show what an item costs us, and `seesCost` in lib/fence.ts was a branch
-- that could not be taken.
--
-- The two questions 0110 ran together:
--
--  1. Does the CREW ticket carry dollars? It does not, and that is not a grant
--     — the ticket is its own route with no session, it resolves one job, and
--     `lib/crew.ts` names every column it selects. No anon role holds anything
--     here at all.
--
--  2. May THIS PERSON see what we charge, and what it costs us? That is a
--     per-person question, which is what row security is for. A column grant
--     cannot express it and never could.
--
-- So: sell prices go back to being readable by signed-in staff, and COST moves
-- into its own tables with a real policy on it. Rows, not columns. Margin
-- follows cost, because margin is computed from it — which is exactly what the
-- scope asks for: sales sees margin and final pricing, the field crew sees
-- neither, and nobody outside the account sees anything.
--
-- The alternative was a view over the base table that nulls the money for
-- people who may not read it. A security_invoker view cannot — it checks the
-- base table's column grants as the invoker, so it would hide the column from
-- everybody again — and a view WITHOUT security_invoker runs as its owner,
-- which means every policy on the base table has to be rewritten into the
-- view's WHERE clause. Two copies of the rules is how the seal bug happened.

-- ---------------------------------------------------------------- the rule
create or replace function internal.hopper_fence_costs(
  acct uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path to ''
as $$
  select internal.hopper_member(acct, uid) and (
    -- Whoever administers the account keeps the book.
    internal.hopper_may_manage(acct, uid)
    -- The jobs that price work. Field is absent from this list on purpose and
    -- is the one job that must never appear in it.
    or exists (select 1 from hopper.fence_person fp
                where fp.account_id = acct
                  and fp.person_id = internal.hopper_person(acct, uid)
                  and fp.job_role in ('sales', 'billing'))
    -- And the explicit grant, for anybody else who has to see cost — a project
    -- manager who prices change orders, say. `fence_costs` was already named in
    -- lib/access.ts as the object for this; now it does something.
    or exists (select 1 from hopper.access_grant g
                where g.account_id = acct
                  and g.person_id = internal.hopper_person(acct, uid)
                  and g.object = 'fence_costs' and g.may_view)
  );
$$;

revoke all on function internal.hopper_fence_costs(uuid, uuid) from public, anon;
grant execute on function internal.hopper_fence_costs(uuid, uuid) to authenticated;

-- -------------------------------------------------- what the book costs us
create table if not exists hopper.fence_rate_cost (
  account_id uuid not null references beebee.accounts(id) on delete cascade,
  rate_id    uuid not null references hopper.fence_rate(id) on delete cascade,
  cost       numeric(12,4) not null default 0,
  markup     numeric(6,3)  not null default 1,
  primary key (account_id, rate_id)
);

create index if not exists fence_rate_cost_rate
  on hopper.fence_rate_cost (account_id, rate_id);

alter table hopper.fence_rate_cost enable row level security;

create policy fence_rate_cost_read on hopper.fence_rate_cost
  for select using (internal.hopper_fence_costs(account_id));

-- Reading a cost and setting one are different rights: a salesperson prices
-- from the book, an administrator writes it.
create policy fence_rate_cost_write on hopper.fence_rate_cost
  for all using (internal.hopper_may_manage(account_id))
       with check (internal.hopper_may_manage(account_id));

revoke all on hopper.fence_rate_cost from anon;

insert into hopper.fence_rate_cost (account_id, rate_id, cost, markup)
select account_id, id, coalesce(cost, 0), coalesce(markup, 1) from hopper.fence_rate
on conflict do nothing;

-- `sell` was generated from two columns that are about to leave the table. It
-- stays a real column, readable by everybody, written by the trigger below —
-- so cost and sell still cannot disagree, which is what the generated column
-- was for.
alter table hopper.fence_rate alter column sell drop expression if exists;
alter table hopper.fence_rate drop column if exists cost;
alter table hopper.fence_rate drop column if exists markup;

create or replace function hopper.fence_rate_sell()
returns trigger language plpgsql security invoker set search_path to ''
as $$
begin
  update hopper.fence_rate r
     set sell = round(new.cost * new.markup, 4)
   where r.id = new.rate_id and r.account_id = new.account_id;
  return new;
end;
$$;

drop trigger if exists fence_rate_sell_follows_cost on hopper.fence_rate_cost;
create trigger fence_rate_sell_follows_cost
  after insert or update of cost, markup on hopper.fence_rate_cost
  for each row execute function hopper.fence_rate_sell();

-- ------------------------------------------------ what an hour costs us
create table if not exists hopper.fence_cost_settings (
  account_id   uuid primary key references beebee.accounts(id) on delete cascade,
  crew_rate    numeric(10,2) not null default 96,
  labor_markup numeric(6,3)  not null default 1.85,
  updated_at   timestamptz not null default now()
);

alter table hopper.fence_cost_settings enable row level security;

create policy fence_cost_settings_read on hopper.fence_cost_settings
  for select using (internal.hopper_fence_costs(account_id));

create policy fence_cost_settings_write on hopper.fence_cost_settings
  for all using (internal.hopper_may_manage(account_id))
       with check (internal.hopper_may_manage(account_id));

revoke all on hopper.fence_cost_settings from anon;

insert into hopper.fence_cost_settings (account_id, crew_rate, labor_markup)
select account_id, crew_rate, labor_markup from hopper.fence_settings
on conflict (account_id) do nothing;

alter table hopper.fence_settings drop column if exists crew_rate;
alter table hopper.fence_settings drop column if exists labor_markup;

-- -------------------------------------- a sell price is not a secret from staff
-- Row security still decides WHICH rows; these are the tables whose money was
-- being hidden from the people whose job it is to quote, sell and bill it.
grant select on hopper.fence_rate       to authenticated;
grant select on hopper.fence_job        to authenticated;
grant select on hopper.fence_option     to authenticated;
grant select on hopper.fence_charge_line to authenticated;
grant select on hopper.fence_revision   to authenticated;
grant select on hopper.fence_settings   to authenticated;

-- ------------------------------------------------------- and the screens ask
-- fence_rights() gains the third answer, so a screen can tell "no cost figures
-- for you" from "there is no figure yet" without guessing from an empty read.
-- A set-returning function cannot gain a column in place, so it is dropped and
-- rebuilt rather than replaced.
drop function if exists hopper.fence_rights(uuid);

create function hopper.fence_rights(acct uuid)
returns table (may_manage boolean, may_read_book boolean, may_read_costs boolean)
language sql stable security invoker set search_path to ''
as $$
  select internal.hopper_may_manage(acct),
         internal.hopper_fence_book(acct),
         internal.hopper_fence_costs(acct);
$$;

revoke all on function hopper.fence_rights(uuid) from public, anon;
grant execute on function hopper.fence_rights(uuid) to authenticated;
