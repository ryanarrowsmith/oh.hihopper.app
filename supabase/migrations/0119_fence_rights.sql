-- 0119 — one answer to "may I change these lists"
--
-- The admin panel draws a pencil beside every row it lets you change, and a
-- pencil that raises a form the database then refuses is worse than no pencil.
-- So the screen has to know, before it draws, whether this person may manage
-- the account's reference data.
--
-- It must not work that out in JavaScript. `internal.hopper_may_manage` is the
-- rule -- account owner or admin, or somebody holding the administrator object
-- -- and a copy of it in the app is a second place to be wrong. This is the
-- same shape `hopper.entity_rights` uses for the organization pages: ask the
-- database the question the policy asks.
--
-- SECURITY INVOKER, deliberately. It takes an account id, which would be a
-- warning from the contract checker on a DEFINER -- but nothing here reads a
-- row. Both helpers begin by testing membership, so passing somebody else's
-- account returns two falses rather than an answer about them.

create or replace function hopper.fence_rights(acct uuid)
returns table (may_manage boolean, may_read_book boolean)
language sql
stable
security invoker
set search_path to ''
as $$
  select internal.hopper_may_manage(acct), internal.hopper_fence_book(acct);
$$;

revoke all on function hopper.fence_rights(uuid) from public, anon;
grant execute on function hopper.fence_rights(uuid) to authenticated;
