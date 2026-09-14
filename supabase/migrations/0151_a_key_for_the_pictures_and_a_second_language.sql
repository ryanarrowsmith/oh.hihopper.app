-- 0151 — the two columns the billing letter cannot be written without
--
-- THE PICTURE KEY BELONGS TO THE JOB, NOT THE HANDOFF. The obvious place for a
-- token that opens a photograph is the handoff row that mailed it — except the
-- letter is queued BEFORE that row is written, and deliberately so: fence_handoff
-- is append-only, so queue-then-record can only ever overstate by a transient
-- error, while record-then-queue leaves a permanent lie in the job's history the
-- first time the mail fails. A token minted with the job is there when the letter
-- is built, survives a second handoff, and is rotated rather than revoked.
--
-- A NOTE MAY BE WRITTEN IN A LANGUAGE ITS READER DOES NOT HAVE. The crew ticket
-- is Spanish because the crew is; accounting is not. So a note carries what was
-- actually typed AND, when that was not English, an English twin written once at
-- the moment it was saved. Once, because translating at read time means the same
-- sentence comes out differently on the screen and in the letter, and because
-- the letter is assembled in SQL by a definer that cannot call a model.
--
-- body stays the original and stays authoritative. body_en is a convenience for
-- everywhere outside the crew's own steps, and every reader of it says so.

alter table hopper.fence_job
  add column if not exists shot_token uuid not null default gen_random_uuid();

comment on column hopper.fence_job.shot_token is
  'Stands in for a session on /shot/<token>/<note>. Whoever holds the billing letter can open the photographs in it and nothing else. Rotate it and every letter already sent goes dark.';

alter table hopper.fence_note
  add column if not exists lang text,
  add column if not exists body_en text;

alter table hopper.fence_note drop constraint if exists fence_note_lang_ck;
alter table hopper.fence_note
  add constraint fence_note_lang_ck check (lang is null or lang in ('en', 'es'));

comment on column hopper.fence_note.lang is
  'What this was actually typed in. Null means nobody asked, which reads as English.';
comment on column hopper.fence_note.body_en is
  'The English of body, written once when the note was saved. Null when body is already English, so coalesce(body_en, body) is always the right thing to show.';
