/* 0147 — BOOKING IT, AND CLOSING IT OUT.

   The two sections that had no screen. Closing a survey has always set the
   job's stage to `schedule` and there was nothing there; close-out is the same
   shape one step further on.

   THE 811 WINDOW WARNS RATHER THAN REFUSES. Ryan, 14 Sep. A hard block sounds
   safer and is not: the date a customer can take is sometimes the date, and a
   screen that refuses it gets worked around — the job is booked in somebody's
   head, or the locate dates get edited to make the form happy, which is the
   failure the block was supposed to prevent.

   SO THERE IS NO FLAG FOR IT. Whether a start falls outside the locate window
   is computed from `starts_on` against fence_survey's `dig_from` and
   `locate_expires`, which means it cannot drift: move the start or call a fresh
   locate and the warning corrects itself. A stored boolean would have to be
   kept in step with three dates by every write path that touches any of them.

   THE THIRD MEASURE. Drawn off a photograph, walked at the survey, and now
   built as the ground allowed — and the third genuinely differs from the second
   for reasons nobody could have known, like an oak nobody wanted to cut roots
   off. Ryan, 14 Sep: keep it, to be safe. Same pattern as fence_survey_run, for
   the same reason: each measure stays where it was made, so in November the
   record still says which number came from where. */

alter table hopper.fence_job
  add column if not exists days_on_site integer check (days_on_site is null or days_on_site between 1 and 90),
  add column if not exists ends_on date,
  add column if not exists booked_at timestamptz,
  add column if not exists booked_by uuid references hopper.person(id);

comment on column hopper.fence_job.ends_on is
  'Follows the start and the days. Stored rather than derived so a job that ran long can say so afterwards.';

create table if not exists hopper.fence_closeout (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references beebee.accounts(id) on delete cascade,
  job_id       uuid not null references hopper.fence_job(id) on delete cascade,
  walked_with  text,
  walked_on    date,
  they_said    text,
  note         text,
  /* Null until somebody says. Built short of what was sold means either the
     price comes down or somebody agreed to hold it, and billing must not be
     the one deciding which. */
  price_held   boolean,
  closed_at    timestamptz,
  closed_by    uuid references hopper.person(id),
  created_at   timestamptz not null default now()
);
create unique index if not exists fence_closeout_job on hopper.fence_closeout (job_id);
create index if not exists fence_closeout_acct on hopper.fence_closeout (account_id, job_id);

create table if not exists hopper.fence_closeout_run (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  run_id      uuid not null references hopper.fence_run(id) on delete cascade,
  built_ft    numeric(10,1) check (built_ft is null or built_ft >= 0),
  /* Asked in the same row as the number it explains, not in a note somewhere
     else. "Stopped short of the oak, customer agreed on site" is the sentence
     that answers a question somebody asks in March. */
  why         text
);
create unique index if not exists fence_closeout_run_one on hopper.fence_closeout_run (run_id);
create index if not exists fence_closeout_run_job on hopper.fence_closeout_run (account_id, job_id);

do $$
declare t text;
begin
  foreach t in array array['fence_closeout', 'fence_closeout_run'] loop
    execute format('alter table hopper.%I enable row level security', t);
    execute format('drop policy if exists %I on hopper.%I', t || '_read', t);
    execute format(
      'create policy %I on hopper.%I for select to authenticated
         using (internal.hopper_fence_reach(account_id, job_id))', t || '_read', t);
    execute format('drop policy if exists %I on hopper.%I', t || '_write', t);
    execute format(
      'create policy %I on hopper.%I for all to authenticated
         using (internal.hopper_fence_edits(account_id, job_id, ''closeout''))
         with check (internal.hopper_fence_edits(account_id, job_id, ''closeout''))',
      t || '_write', t);
  end loop;
end $$;
