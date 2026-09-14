-- 0115 — the crew link carries its own language.
--
-- Everywhere else in Hopper the language is a fact about the person
-- (hopper.person.lang, 0114). The crew ticket has no person: it opens on a link
-- with no sign-in, which is the whole point of it. So the language belongs to
-- the LINK — the PM issues it to a crew and picks the language that crew reads,
-- the same decision they are already making when they choose who to send it to.

alter table hopper.fence_ticket_link
  add column if not exists lang text not null default 'es'
  check (lang in ('en','es'));

comment on column hopper.fence_ticket_link.lang is
  'The language this ticket opens in. Held on the link because the ticket has no signed-in person to ask. Defaults to Spanish: the crews that work off this link read Spanish, and a default that is wrong for the majority is a default nobody trusts.';
