-- 0114 — language belongs to the person, not to Fence Builder.
--
-- English/Spanish goes sitewide, starting with fencing. So the language
-- somebody reads is a fact about them, held once on hopper.person and read by
-- every module — not a Fence Builder setting the rest of Hopper would have to
-- ask Fence Builder about.
--
-- `fence_person.lang` is dropped here rather than kept in step. Two places to
-- answer "what does this person read" is two places to be wrong, which is the
-- same argument that keeps entitlement derived rather than stored.

alter table hopper.person
  add column if not exists lang text not null default 'en'
  check (lang in ('en','es'));

comment on column hopper.person.lang is
  'What this person reads. Their crew ticket, scope of work and the app shell arrive in it — a setting on them, not a toggle they have to find on every screen.';

update hopper.person p
   set lang = fp.lang
  from hopper.fence_person fp
 where fp.person_id = p.id and fp.lang <> p.lang;

alter table hopper.fence_person drop column if exists lang;

create or replace function internal.hopper_lang(acct uuid, uid uuid default auth.uid())
returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select p.lang from hopper.person p
                    where p.account_id = acct and p.profile_id = uid and p.active
                    limit 1), 'en');
$$;
comment on function internal.hopper_lang(uuid, uuid) is
  'The language to render in. One answer, so the shell, the ticket and the scope of work cannot disagree.';
