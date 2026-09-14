-- 0152 — the document keeps a copy of itself
--
-- The billing letter reproduces the estimate and the firm quote as full pages,
-- and the letter is built in SQL by a security definer that reads what it mails
-- rather than being handed it. A definer cannot call the pricer, and a second
-- copy of the pricer written in plpgsql would be two pricers in two languages
-- drifting apart on a document somebody already put their name to.
--
-- So the page is frozen at the moment of signing, by the same function that drew
-- it on the screen they signed on. This is the argument the accepted option
-- already makes for its takeoff, one step further along.
--
-- NULL IS ALLOWED AND MEANS EXACTLY ONE THING: signed before this column
-- existed. Every reader says "the signed document is on file" rather than
-- inventing a page, because a reconstructed contract is worse than an absent
-- one.

alter table hopper.fence_signature
  add column if not exists page jsonb;

comment on column hopper.fence_signature.page is
  'The customer document exactly as it read when this signature landed — labels, cells and a total, never markup. Null on signatures taken before the column existed.';
