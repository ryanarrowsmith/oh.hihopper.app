-- 0118 — the charge code catalog
--
-- `fence_charge_line` is what one job bills. This is the BOOK those lines are
-- picked from, and it belongs to the billing target rather than to the module:
-- a customer keying into something other than Navusoft has different codes, and
-- the module must not have five of ours baked into it.
--
-- Nothing here is money. The amount lives on the job's line, where it is
-- revoked at the column level; a code and what it bills are readable by anyone
-- who can see the rate book.
--
-- The five seeded codes are a GUESS. Navusoft publishes no import schema, so
-- `provisional` is on until somebody hands over the real template, and the
-- screen says so rather than letting them pass for confirmed.

create table if not exists hopper.fence_charge_code (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  target_id   uuid references hopper.fence_billing_target(id) on delete set null,
  code        text not null,
  description text not null,
  recurring   boolean not null default false,
  cycle_days  integer,
  note        text,
  provisional boolean not null default false,
  sort        integer not null default 0,
  active      boolean not null default true,
  unique (account_id, code)
);

create index if not exists fence_charge_code_book
  on hopper.fence_charge_code (account_id, sort, code);

alter table hopper.fence_charge_code enable row level security;

create policy fence_charge_code_read on hopper.fence_charge_code
  for select using (internal.hopper_fence_book(account_id));

create policy fence_charge_code_write on hopper.fence_charge_code
  for all using (internal.hopper_may_manage(account_id))
       with check (internal.hopper_may_manage(account_id));

revoke all on hopper.fence_charge_code from anon;

-- The book as it stands for On Call Services and Rentals, pointed at the
-- Navusoft target seeded in 0111.
insert into hopper.fence_charge_code
  (account_id, target_id, code, description, recurring, cycle_days, sort, provisional, note)
select '1ade454c-54e8-45d9-beec-cc52a21f7ea2'::uuid, t.id, v.code, v.descr,
       v.recur, v.cycle, v.sort, true, v.note
from (values
  ('INST-CL', 'Chain link install',                     false, null::int, 10,
     'Feet come from the takeoff, not from the estimator''s memory'),
  ('GATE-VD', 'Vehicle gate, supply and hang',          false, null,      20, null),
  ('GATE-WK', 'Walk gate, supply and hang',             false, null,      30, null),
  ('RENT-TF', 'Temporary fence, per 28-day cycle',      true,  28,        40,
     'The only recurring code in the book'),
  ('DEL-TF',  'Delivery and set',                       false, null,      50, null),
  ('SEC-ESC', 'Escorted day on a secure site',          false, null,      60,
     'Billed by the day the escort is on site, whether or not fence went up'),
  ('TEAR',    'Tear-out and haul, old fence',           false, null,      70, null)
) as v(code, descr, recur, cycle, sort, note)
left join hopper.fence_billing_target t
  on t.account_id = '1ade454c-54e8-45d9-beec-cc52a21f7ea2'::uuid and t.active
on conflict (account_id, code) do nothing;
