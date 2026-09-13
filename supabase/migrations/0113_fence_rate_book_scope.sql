-- 0113 — the rate book was invisible to everybody who could actually use it.
--
-- The book is account-wide: one cost and one markup, however many organizations
-- run fence. Its policy therefore asked `hopper_module_level(acct,'fence',null)`
-- — the module at NULL scope. But a module grant is normally written against an
-- ORGANIZATION, so a salesperson holding fence on On Call Services and Rentals
-- resolved to null at null scope and read zero rows. The probe found it: cost
-- was correctly refused and the sell side came back empty too.
--
-- The question the book should ask is "do you have this module anywhere", not
-- "do you have it unscoped".

create or replace function internal.hopper_fence_book(acct uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to '' as $$
  select internal.hopper_member(acct, uid) and (
    internal.hopper_module_level(acct, 'fence', null, uid) is not null
    or exists (select 1 from hopper.entity e
                where e.account_id = acct
                  and internal.hopper_module_level(acct, 'fence', e.id, uid) is not null)
  );
$$;
comment on function internal.hopper_fence_book(uuid, uuid) is
  'Do you hold Fence Builder anywhere in this account? The rate book is account-wide, so it cannot ask about one organization.';

drop policy if exists fence_rate_read on hopper.fence_rate;
create policy fence_rate_read on hopper.fence_rate for select
  using (internal.hopper_fence_book(account_id));

drop policy if exists fence_billing_target_read on hopper.fence_billing_target;
create policy fence_billing_target_read on hopper.fence_billing_target for select
  using (internal.hopper_fence_book(account_id));
