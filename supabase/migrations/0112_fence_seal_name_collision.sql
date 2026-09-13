-- 0112 — the seal sealed everything.
--
-- `hopper_fence_edits(acct, job, section, uid)` asked:
--
--   not exists (select 1 from hopper.fence_seal s
--                where s.job_id = job and s.section = section)
--
-- and `section` is BOTH the function's parameter and a column of the table
-- being scanned. In a SQL function the column wins, so the test read
-- `s.section = s.section` — true for any row — and one seal anywhere on a job
-- closed every section of it. The probe caught it: with the estimate sealed,
-- sales could no longer edit intake either.
--
-- The parameter is qualified by the function's own name now. Same lesson as
-- .mn / .plan / roleName, in SQL rather than CSS: grep for the name before you
-- use it, and a parameter sharing a column's name is already ambiguous.

create or replace function internal.hopper_fence_edits(
  acct uuid, job uuid, section hopper.fence_section, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to '' as $$
  select internal.hopper_fence_reach(acct, job, uid)
     and not exists (select 1 from hopper.fence_seal s
                      where s.job_id = job
                        and s.section = hopper_fence_edits.section)
     and exists (
       select 1 from hopper.fence_job j
        where j.id = job and j.account_id = acct
          and internal.hopper_module_level(acct, 'fence', j.entity_id, uid) in ('edit','admin'))
     and (
       internal.hopper_may_manage(acct, uid)
       or exists (
         select 1 from hopper.fence_person fp
          where fp.account_id = acct
            and fp.person_id = internal.hopper_person(acct, uid)
            and fp.job_role = internal.hopper_fence_owner(hopper_fence_edits.section))
     );
$$;
