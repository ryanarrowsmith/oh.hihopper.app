/* 0141 — THE ESTIMATE GOES OUT BY MAIL.

   Ryan's call, 14 Sep: sending an estimate should mail the contact the link
   rather than leaving a salesperson to copy it somewhere. The link still shows
   on the screen — a customer who says "I never got it" needs somebody able to
   paste it into a reply — but the ordinary path is now one button that actually
   sends.

   Two columns on the link so the screen can say what happened, and a kind so
   the outbox will carry it. The renderer's copyFor has to learn the same word;
   that is the other half and it is deployed separately. */

alter table hopper.fence_quote_link
  add column if not exists mailed_at timestamptz,
  add column if not exists mailed_to text;

comment on column hopper.fence_quote_link.mailed_at is
  'When Hopper mailed this link to the contact. Null means it was only ever copied by hand.';

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
  'fence.handoff', 'fence.signed', 'fence.estimate'
));
