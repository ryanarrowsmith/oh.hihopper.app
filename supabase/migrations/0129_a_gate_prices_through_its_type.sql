-- 0129 — a gate on a job does not have to name a rate
--
-- `fence_gate.rate_code` has been NOT NULL since 0109, when it was the only
-- identifier a gate had. 0122 gave gates a `type_code` — the catalog entry, which
-- carries the opening width and points at whatever the book prices it from — and
-- left the old column required.
--
-- So the estimator's own gate editor could not save a gate. It writes the type
-- and the quantity, which is what the screen asks for and all it knows, and the
-- insert came back "null value in column rate_code". Nothing in the type system
-- or the typecheck could see it: the action is correct, the column was wrong.
-- It surfaced the first time an actual gate was put on an actual job, which is
-- the argument for having one job in the database rather than none.
--
-- Three of the six seeded gate types have no rate behind them at all, and the
-- screens already say so rather than pricing a turnstile at nothing. A column
-- that insists on a code the catalog does not have is the same claim made in a
-- place that cannot explain itself.

alter table hopper.fence_gate alter column rate_code drop not null;

alter table hopper.fence_gate drop constraint if exists fence_gate_names_something;
alter table hopper.fence_gate add constraint fence_gate_names_something
  check (type_code is not null or rate_code is not null);
