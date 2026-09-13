-- 0122 — a gate on a job names its type
--
-- `fence_gate` held `rate_code`, which was the only identifier it had, so the
-- estimator would have had to put a gate CATALOG code (G-VD-16) in a column
-- called rate_code and then look the width up by guessing which of the two lists
-- the value came from. A column named for one thing holding another is how the
-- next person writes a bug with a clear conscience.
--
-- So: `type_code` is the catalog entry — it carries the opening width, which is
-- what the takeoff subtracts from the fence line — and `rate_code` stays for the
-- gate that is priced straight off a rate with no catalog entry behind it. Three
-- of the six seeded gate types have no rate_code at all, which is a gap in the
-- book rather than a gap here, and the screen says so instead of pricing a
-- turnstile at nothing.

alter table hopper.fence_gate
  add column if not exists type_code text;

comment on column hopper.fence_gate.type_code is
  'The fence_gate_type this is one of. Carries the opening width the takeoff deducts.';
comment on column hopper.fence_gate.rate_code is
  'What it prices from, when that is not reached through the catalog entry.';
