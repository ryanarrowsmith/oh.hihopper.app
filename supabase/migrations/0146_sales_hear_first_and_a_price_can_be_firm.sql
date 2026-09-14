/* 0146 — SALES HEAR BEFORE ANYBODY DECIDES, and a firm price can be signed.

   Ryan, 14 Sep: mail the salesperson once the survey is done with the results,
   so they are aware BEFORE a decision is made about cost. They are the one who
   takes the phone call if the price moves, and being told what was settled
   without them is not the same as being asked.

   So it is two acts in order, and the ORDER IS ENFORCED HERE rather than in the
   markup: results_sent_at is stamped by the first, and closeSurvey refuses to
   run without it. A rule that lives only in a screen is a rule somebody skips
   on a busy Friday.

   THE SEAL IS NOT TOUCHED. fence_option's write policy is the estimate section
   and the signature sealed it, so a firm figure does NOT become a new option.
   It lives on fence_revision — which has existed since 0109 for exactly this
   (reason, sold_before, sold_after, held_price), is append-only, and whose
   INSERT policy is already the survey section. `held_price` is the whole
   difference between the two answers: absorbing means the CUSTOMER'S figure
   does not move and ours does.

   A LINK NOW POINTS AT ONE OR THE OTHER. option_id becomes nullable, revision_id
   arrives, and a check constraint makes them mutually exclusive — so there is no
   such thing as a link that is both, and /e/[token] never has to guess.

   THE EXTRA INSERT POLICY IS SAFE, which is not the usual case and is worth the
   paragraph. Policies are OR'd, and 0125 is the standing warning: a policy
   sitting beside a section's own answers to nothing, so somebody holding a
   narrow right could rewrite a price. This one cannot be used that way. It
   requires revision_id to be NOT NULL, and the constraint above makes that
   mutually exclusive with option_id — a survey-owner can issue a link to a
   revision and to nothing else, and the estimate's own links still answer only
   to the estimate section. */

alter table hopper.fence_survey
  add column if not exists results_sent_at timestamptz,
  add column if not exists results_sent_by uuid references hopper.person(id);

comment on column hopper.fence_survey.results_sent_at is
  'When the findings went to sales. The decision cannot be recorded before this — they hear first.';

alter table hopper.fence_revision
  add column if not exists note text;

comment on column hopper.fence_revision.note is
  'The sentence the customer reads on a firm revision, in the project manager''s words.';

alter table hopper.fence_quote_link
  alter column option_id drop not null,
  add column if not exists revision_id uuid references hopper.fence_revision(id) on delete cascade;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'hopper.fence_quote_link'::regclass
                   and conname = 'fence_quote_link_one_thing') then
    alter table hopper.fence_quote_link
      add constraint fence_quote_link_one_thing
      check ((option_id is not null) <> (revision_id is not null));
  end if;
end $$;

drop policy if exists fence_quote_link_revise on hopper.fence_quote_link;
create policy fence_quote_link_revise on hopper.fence_quote_link
  for insert to authenticated
  with check (
    revision_id is not null
    and internal.hopper_fence_edits(account_id, job_id, 'survey')
  );

drop policy if exists fence_quote_link_revise_cycle on hopper.fence_quote_link;
create policy fence_quote_link_revise_cycle on hopper.fence_quote_link
  for update to authenticated
  using (revision_id is not null
         and internal.hopper_fence_edits(account_id, job_id, 'survey'))
  with check (revision_id is not null
              and internal.hopper_fence_edits(account_id, job_id, 'survey'));

/* Two more kinds of letter. The CHECK enumerates every kind on purpose: a typo
   in a trigger fails at the insert rather than arriving with no copy and no
   icon. ADDING A KIND IS ALWAYS TWO ACTS — this, and copyFor in the
   request-mail edge function. One without the other is a letter that either
   cannot be queued or arrives blank. */
alter table beebee.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table beebee.mail_outbox add constraint mail_outbox_kind_check check (kind = any (array[
  'request.opened', 'request.replied', 'request.answered', 'request.resolved',
  'interest.received', 'platform.unhealthy',
  'auth.signup', 'auth.invite', 'auth.recovery', 'auth.magiclink',
  'auth.email_change', 'auth.email_change_new', 'auth.email_change_current',
  'auth.reauthentication', 'auth.other',
  'todo.assigned', 'todo.moved', 'todo.due', 'todo.late',
  'desk.reported', 'desk.calledoff', 'app.share',
  'beta.confirm', 'beta.welcome', 'beta.announce', 'beta.invite',
  'check.question', 'check.answered', 'team.invite',
  'fence.handoff', 'fence.signed', 'fence.estimate', 'fence.survey', 'fence.firm',
  'mention.named'
]));
