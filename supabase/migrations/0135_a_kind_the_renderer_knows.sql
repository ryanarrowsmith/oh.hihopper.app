-- 0135 — the outbox only accepts kinds the renderer knows
--
-- `beebee.mail_outbox.kind` carries a CHECK enumerating every kind, and that
-- list is deliberately the same list as request-mail's `copyFor`. It is the
-- platform stopping an app from queueing a message nothing can render — which
-- would sit pending, fail five times and end up as a row nobody reads.
--
-- So adding a mail kind is TWO acts and this is the second: the template went in
-- with request-mail version 26, and the kind is allowed here. Found by probe, not
-- by reading: `internal.hopper_fence_handoff_mail` was correct in every other
-- respect and the insert was refused on its way out.
--
-- THIS IS A PLATFORM TABLE, NOT HOPPER'S. It is changed from a Hopper migration
-- because Hopper is the app adding the kind, and the constraint has to move in
-- the same breath as the template or one of the two is a bug. The Beebee source
-- for request-mail is checked in at beebee/supabase/functions/request-mail/.

alter table beebee.mail_outbox drop constraint mail_outbox_kind_check;

alter table beebee.mail_outbox add constraint mail_outbox_kind_check check (
  kind = any (array[
    'request.opened', 'request.replied', 'request.answered', 'request.resolved',
    'interest.received', 'platform.unhealthy',
    'auth.signup', 'auth.invite', 'auth.recovery', 'auth.magiclink',
    'auth.email_change', 'auth.email_change_new', 'auth.email_change_current',
    'auth.reauthentication', 'auth.other',
    'todo.assigned', 'todo.moved', 'todo.due', 'todo.late',
    'desk.reported', 'desk.calledoff',
    'app.share',
    'beta.confirm', 'beta.welcome', 'beta.announce', 'beta.invite',
    'check.question', 'check.answered',
    'team.invite',
    -- A finished fence job reaching accounting. Not a notification: the whole
    -- keying sheet is in the letter, because the reader has no Hopper account.
    'fence.handoff'
  ])
);
