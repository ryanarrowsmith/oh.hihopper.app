/* 0142 — BEING NAMED REACHES YOU.

   Ryan's call, 14 Sep: @ somebody in a note and they get a notification AND an
   email. hopper.notify() already rings the bell; nothing has ever sent the
   letter, so being named only reached people who happened to open the app.

   NOT FENCE'S. Mentions are a Hopper-wide idea — report notes already parse
   them with the same lib — so this is `mention.named` rather than
   `fence.mention`, and any screen with a comment box can call it.

   THE ADDRESS IS NEVER READ BY THE APP. hopper.directory deliberately carries
   no email: everyone signed in may see the top half of anybody, and contact
   details live behind the roster grant. So the function LOOKS THE ADDRESS UP
   ITSELF and the caller only ever names a person id. A definer that mailed
   arbitrary text to an arbitrary address would be a spam relay; this one can
   only reach an active person in the caller's own account.

   The full statements as applied are in the 0142 migration on the database;
   this file is the record. */

-- kind: mention.named added to beebee.mail_outbox's CHECK (see 0141 for the
-- full list; this adds one word to it).

-- internal.hopper_mention_mail(p_to uuid, p_title text, p_body text, p_href text)
--   SECURITY DEFINER. Same three rules as hopper.notify(): same account, still
--   active, never yourself — a letter is a louder bell, not a different
--   permission. Looks the address up itself. Thirty an hour per person, which
--   is somebody pasting a roster into a comment box.
-- hopper.mention_mail(...) SECURITY INVOKER wrapper, granted to authenticated.
