/* 0148 — A LEG IS ONE SIDE OF A FENCE.

   Ryan, 14 Sep: "run is confusing because we use that to describe one leg of
   the fence typically." He is right, and the word was the smaller half of it —
   the app had no unit for a side at all. A drawn line was one object with
   invisible segments, the spec sat on the JOB so every side was the same fence
   by construction, and a gate was a count with no position, which is why it
   could not be drawn.

   So: a LEG is one straight side between two corners. It has a length, it can
   carry its own spec when it differs, and gates sit on it.

   THE GEOMETRY STILL HAS ONE HOME. fence_leg does not store points. Its rows
   MIRROR the segments of fence_run's polyline — same count, same order, written
   by the same save — so a length is computed in one place and a leg keeps its
   id when a point moves. Two copies of a length is two answers, and the one on
   the quote would be the stale one.

   THE SPEC IS AN OVERRIDE, NOT A DECLARATION. Ryan, 14 Sep: "only override when
   it's different." Null means whatever the job is, which is one choice made
   once instead of four made every time — and it is what lets the customer's
   estimate stay rolled up on an ordinary job and grow a line only for the side
   that needs explaining.

   at_pct IS A FRACTION, NOT A DISTANCE. "About 45% along" rather than "84 ft
   from the corner": an aerial estimate cannot honestly support the second, and
   a number that precise invites somebody to build to it. It is enough to draw a
   marker the customer recognizes and enough for a crew to find the opening.

   WHAT THIS CHANGES IN THE ARITHMETIC, proven in lib/legs.check.ts. Feet are
   the same geometry read two ways and agree exactly; corners and terminal posts
   agree. LINE POSTS DIFFER BY ONE PER LEG, and the per-leg figure is the better
   one: the old formula spread ceil(total / spacing) across the whole line and
   took one off per RUN, where counting per leg asks the question a crew answers
   — how many posts fit between these two corners — and takes one off per LEG.
   On a four-sided job that is a single post the old count had and nobody would
   set. */

create table if not exists hopper.fence_leg (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references beebee.accounts(id) on delete cascade,
  job_id     uuid not null references hopper.fence_job(id) on delete cascade,
  run_id     uuid not null references hopper.fence_run(id) on delete cascade,
  sort       integer not null,
  label      text,
  spec_code  text
);
create unique index if not exists fence_leg_one on hopper.fence_leg (run_id, sort);
create index if not exists fence_leg_job on hopper.fence_leg (account_id, job_id);

alter table hopper.fence_leg enable row level security;

/* Same answer as the run it belongs to: readable by anybody who can reach the
   job, writable by whoever owns the estimate, and sealed by the signature. */
drop policy if exists fence_leg_read on hopper.fence_leg;
create policy fence_leg_read on hopper.fence_leg for select to authenticated
  using (internal.hopper_fence_reach(account_id, job_id));

drop policy if exists fence_leg_write on hopper.fence_leg;
create policy fence_leg_write on hopper.fence_leg for all to authenticated
  using (internal.hopper_fence_edits(account_id, job_id, 'estimate'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

alter table hopper.fence_gate
  add column if not exists leg_id uuid references hopper.fence_leg(id) on delete set null,
  add column if not exists at_pct numeric(4,3) check (at_pct is null or (at_pct >= 0 and at_pct <= 1));

create index if not exists fence_gate_leg on hopper.fence_gate (leg_id);

/* ON DELETE SET NULL, not cascade. A gate whose leg was redrawn is still a gate
   somebody is paying for — it stops being drawable, not stops existing. The
   screen shows it as unplaced and asks where it went. */

comment on table hopper.fence_leg is
  'One side of a fence, between two corners. Ryan calls this a run; the polyline it belongs to is fence_run. Rows mirror the segments of that polyline and are written by the same save, so the geometry has one home and a leg keeps its id when a point moves.';
comment on column hopper.fence_leg.spec_code is
  'An OVERRIDE. Null means this leg is whatever the job is — one choice made once rather than four made every time.';
comment on column hopper.fence_gate.at_pct is
  'Roughly how far along its leg, 0 to 1. Deliberately not a distance: an aerial estimate cannot honestly support "84 ft from the corner", and a number that precise invites somebody to build to it.';
