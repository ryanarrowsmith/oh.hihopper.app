/* ==========================================================================
   0138 — A SIGNATURE IS THE HANDOFF.

   Ryan's call, 14 Sep: the customer e-signs the estimate, and signing is what
   starts the job. It notifies the salesperson and the project manager, opens
   the project manager's section, and every date in the plan counts from the
   day they signed rather than the day somebody got round to it.

   Two tables and one mail kind.

   THE LINK IS THE ESTIMATE'S, NOT THE JOB'S. It names the option that was sent,
   because a customer signs a price rather than a folder — and a job with three
   priced options and one signature has to know which one they bought. Managed
   through the estimate section like everything else the estimate owns, which
   means the seal ends link management too: after the sale is settled there is
   nothing left to send.

   THE SIGNATURE IS APPEND-ONLY, like fence_handoff and for the same reason. A
   signed record that can be edited afterwards is a record of nothing. There is
   no insert policy at all: the signer has no account and no session, so the
   write comes through the service role on the token route, the way the crew
   ticket already reads.
   ========================================================================== */

create table if not exists hopper.fence_quote_link (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  option_id   uuid not null references hopper.fence_option(id) on delete cascade,
  token       uuid not null default gen_random_uuid(),
  issued_by   uuid references hopper.person(id),
  issued_at   timestamptz not null default now(),
  -- The estimate's own validity. Past it the link says the same thing an
  -- unknown token says, because a reply that differs is a way to test tokens.
  expires_on  date,
  revoked     boolean not null default false,
  signed_at   timestamptz,
  unique (token)
);
create index if not exists fence_quote_link_acct_idx
  on hopper.fence_quote_link (account_id, job_id, issued_at desc);

create table if not exists hopper.fence_signature (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  job_id      uuid not null references hopper.fence_job(id) on delete cascade,
  option_id   uuid not null references hopper.fence_option(id) on delete cascade,
  link_id     uuid references hopper.fence_quote_link(id) on delete set null,
  -- What they typed, and what the request carried. Both, because a typed name
  -- with nothing around it is a claim and the rest is the evidence.
  signed_name  text not null,
  signed_title text,
  signed_email text,
  signed_at    timestamptz not null default now(),
  ip           text,
  agent        text,
  -- The price they agreed to, frozen here as well as on the option: the option
  -- is sealed, but a signature that cannot say what it was for on its own is a
  -- signature that depends on another row still being there.
  price        numeric(12,2),
  unique (link_id)
);
create index if not exists fence_signature_acct_idx
  on hopper.fence_signature (account_id, job_id, signed_at desc);

alter table hopper.fence_quote_link enable row level security;
alter table hopper.fence_signature  enable row level security;

drop policy if exists fence_quote_link_read on hopper.fence_quote_link;
create policy fence_quote_link_read on hopper.fence_quote_link for select
  using (internal.hopper_fence_reach(account_id, job_id));

drop policy if exists fence_quote_link_issue on hopper.fence_quote_link;
create policy fence_quote_link_issue on hopper.fence_quote_link for insert
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

drop policy if exists fence_quote_link_cycle on hopper.fence_quote_link;
create policy fence_quote_link_cycle on hopper.fence_quote_link for update
  using (internal.hopper_fence_edits(account_id, job_id, 'estimate'))
  with check (internal.hopper_fence_edits(account_id, job_id, 'estimate'));

-- Readable by anybody who can reach the job. No insert, update or delete policy
-- on purpose: append-only, and the only writer is the token route.
drop policy if exists fence_signature_read on hopper.fence_signature;
create policy fence_signature_read on hopper.fence_signature for select
  using (internal.hopper_fence_reach(account_id, job_id));

grant select on hopper.fence_quote_link, hopper.fence_signature to authenticated;
grant insert, update on hopper.fence_quote_link to authenticated;

comment on table hopper.fence_quote_link is
  'One customer-facing estimate link per option sent. Resolved by the token route with the service role; managed through the estimate section, so the seal ends it.';
comment on table hopper.fence_signature is
  'The customer''s e-signature on an estimate. Append-only: no insert policy, written by the token route alone.';

/* THE MAIL KIND IS TWO ACTS. The outbox enumerates every kind it will carry so
   an app cannot queue something nothing can render; the renderer's copyFor has
   to learn the same word. This is the first half. */
alter table beebee.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table beebee.mail_outbox add constraint mail_outbox_kind_check check (kind in (
  'request.opened', 'request.replied', 'request.answered', 'request.resolved',
  'interest.received', 'platform.unhealthy',
  'auth.signup', 'auth.invite', 'auth.recovery', 'auth.magiclink',
  'auth.email_change', 'auth.email_change_new', 'auth.email_change_current',
  'auth.reauthentication', 'auth.other',
  'todo.assigned', 'todo.moved', 'todo.due', 'todo.late',
  'desk.reported', 'desk.calledoff',
  'app.share', 'beta.confirm', 'beta.welcome', 'beta.announce', 'beta.invite',
  'check.question', 'check.answered', 'team.invite',
  'fence.handoff', 'fence.signed'
));
