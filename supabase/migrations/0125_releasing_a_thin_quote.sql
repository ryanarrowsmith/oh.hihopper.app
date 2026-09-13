-- 0125 — releasing a quote that sits under the margin floor
--
-- The floor is the whole reason sales sees margin: below it, a quote needs
-- somebody senior to say yes. Until now the estimator wrote the option, marked it
-- as needing a release, and nothing could release it — a rule with no mechanism,
-- which is a rule people learn to ignore.
--
-- A RELEASE IS ITS OWN ROW, not three columns on the option, and that is the
-- whole design. The first draft added `released_by`, `released_at` and a note to
-- `fence_option` with a second UPDATE policy beside the section's. Two things
-- were wrong with it, and both are the kind that only show up later:
--
--   Postgres cannot scope a policy to columns, and policies are OR'd. A second
--   permissive UPDATE policy would have let anybody holding `fence_release` —
--   who is otherwise nothing to this job — rewrite the PRICE of any option
--   rather than stamp it, which is the opposite of what a release is.
--
--   Worse, it would have handed an edit on an option whose section is SEALED to
--   everybody it named, administrators included. The section's own policy goes
--   through `hopper_fence_edits`, which tests the seal before it tests
--   `hopper_may_manage`; a policy sitting beside it is OR'd with it and answers
--   to nothing. A seal beats an administrator is the rule this module is built
--   on, and it is only true while every write path asks the same function.
--   (An administrator editing an UNSEALED option is not new and is not this
--   migration's business: `hopper_fence_edits` has always allowed it. Probed,
--   rather than assumed, after this was applied.)
--
-- `fence_seal` is already a table for exactly this reason. A release is the same
-- shape: an act by somebody, recorded against a thing, touching nothing.
--
-- Releasing is also not editing, and not the estimator's to do. A salesperson
-- releasing their own thin quote is the floor releasing itself, so the right is
-- `fence_release` — which lib/access.ts already named — or whoever administers
-- the account.

create or replace function internal.hopper_fence_release(
  acct uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path to ''
as $$
  select internal.hopper_member(acct, uid) and (
    internal.hopper_may_manage(acct, uid)
    or exists (select 1 from hopper.access_grant g
                where g.account_id = acct
                  and g.person_id = internal.hopper_person(acct, uid)
                  and g.object = 'fence_release' and g.may_edit)
  );
$$;

revoke all on function internal.hopper_fence_release(uuid, uuid) from public, anon;
grant execute on function internal.hopper_fence_release(uuid, uuid) to authenticated;

create table if not exists hopper.fence_option_release (
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  option_id   uuid not null references hopper.fence_option(id) on delete cascade,
  released_by uuid references beebee.profiles(id),
  released_at timestamptz not null default now(),
  note        text,
  primary key (account_id, option_id)
);

create index if not exists fence_option_release_option
  on hopper.fence_option_release (account_id, option_id);

alter table hopper.fence_option_release enable row level security;

-- Anybody who can reach the job can see that a quote was released and by whom.
-- A release nobody can see is a release nobody can be held to.
create policy fence_option_release_read on hopper.fence_option_release
  for select using (exists (select 1 from hopper.fence_option o
                             where o.id = option_id and o.account_id = account_id
                               and internal.hopper_fence_reach(o.account_id, o.job_id)));

create policy fence_option_release_write on hopper.fence_option_release
  for all using (internal.hopper_fence_release(account_id))
       with check (internal.hopper_fence_release(account_id));

revoke all on hopper.fence_option_release from anon;

-- Four answers now, and the screens ask for all four in one call.
drop function if exists hopper.fence_rights(uuid);

create function hopper.fence_rights(acct uuid)
returns table (may_manage boolean, may_read_book boolean,
               may_read_costs boolean, may_release boolean)
language sql stable security invoker set search_path to ''
as $$
  select internal.hopper_may_manage(acct),
         internal.hopper_fence_book(acct),
         internal.hopper_fence_costs(acct),
         internal.hopper_fence_release(acct);
$$;

revoke all on function hopper.fence_rights(uuid) from public, anon;
grant execute on function hopper.fence_rights(uuid) to authenticated;
