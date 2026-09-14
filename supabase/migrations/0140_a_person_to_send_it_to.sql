/* ==========================================================================
   0140 — A PERSON TO SEND IT TO.

   Ryan's call, 14 Sep: the salesperson puts a contact on the estimate, and
   contacts are reusable. Until now a job carried a `customer` — a company name
   typed into a box — and nothing that could be addressed. An estimate goes to
   a PERSON.

   ACCOUNT-WIDE, NOT PER JOB. That is the whole of "reusable": the second job
   for Redbud Logistics picks Dana Whitfield off a list instead of retyping her
   and getting the address one character wrong. Reads follow the module
   (hopper_fence_book), and so do writes -- a salesperson adding the contact
   they are quoting is the ordinary case, and making that an administrator's
   job would mean the list is never added to.

   NOTHING IS DELETED. `active` false takes a contact off the picker and leaves
   every estimate that named them still able to say who it went to. There is no
   delete policy for that reason.
   ========================================================================== */

create table if not exists hopper.fence_contact (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  full_name   text not null,
  title       text,
  email       text,
  phone       text,
  -- Who they are with. The job's own `customer` is the company the WORK is
  -- for, and it is usually the same one -- but a property manager quoting for
  -- three landlords is one contact and three customers, so they are separate.
  company     text,
  note        text,
  active      boolean not null default true,
  created_by  uuid references hopper.person(id),
  created_at  timestamptz not null default now()
);
create index if not exists fence_contact_acct_idx
  on hopper.fence_contact (account_id, active, full_name);
-- Two people can share a name; one person cannot be in the list twice with the
-- same address. Partial, because a contact with no email is perfectly normal.
create unique index if not exists fence_contact_one_email
  on hopper.fence_contact (account_id, lower(email)) where email is not null;

alter table hopper.fence_job
  add column if not exists contact_id uuid references hopper.fence_contact(id);

alter table hopper.fence_contact enable row level security;

drop policy if exists fence_contact_read on hopper.fence_contact;
create policy fence_contact_read on hopper.fence_contact for select
  using (internal.hopper_fence_book(account_id));

drop policy if exists fence_contact_add on hopper.fence_contact;
create policy fence_contact_add on hopper.fence_contact for insert
  with check (internal.hopper_fence_book(account_id));

drop policy if exists fence_contact_edit on hopper.fence_contact;
create policy fence_contact_edit on hopper.fence_contact for update
  using (internal.hopper_fence_book(account_id))
  with check (internal.hopper_fence_book(account_id));

grant select, insert, update on hopper.fence_contact to authenticated;

comment on table hopper.fence_contact is
  'The people estimates are addressed to. Account-wide and reusable across jobs; deactivated rather than deleted so an old estimate can still say who it went to.';
comment on column hopper.fence_job.contact_id is
  'Who the estimate is for. Null until sales puts somebody on it.';
