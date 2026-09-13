-- 0127 — a scope says who drafted it, and with what
--
-- Two things can now write the first version of a scope of work: the renderer in
-- lib/sow.ts, which turns the takeoff into sentences and cannot invent a figure,
-- and a model, which writes better prose and could. A reader cannot tell them
-- apart from the words — that is rather the point of the model — so the row says
-- which, per language, along with the model that did it.
--
-- This is not bookkeeping. A project manager deciding how hard to read something
-- before signing it is entitled to know whether a person, a template or a model
-- put the words there, and a year from now "who wrote this sentence" is a
-- question somebody will actually ask.

alter table hopper.fence_sow
  add column if not exists drafted_en  text,
  add column if not exists drafted_es  text,
  add column if not exists draft_model text;

alter table hopper.fence_sow drop constraint if exists fence_sow_drafted_by;
alter table hopper.fence_sow add constraint fence_sow_drafted_by check (
  (drafted_en is null or drafted_en in ('facts', 'claude'))
  and (drafted_es is null or drafted_es in ('facts', 'claude')));

comment on column hopper.fence_sow.drafted_en is
  'How the English got its first version: facts = rendered from the takeoff, claude = a model wrote it. Null once nobody can tell (it was typed).';
comment on column hopper.fence_sow.draft_model is
  'The model id that last drafted either language, recorded because model behaviour changes between versions.';
