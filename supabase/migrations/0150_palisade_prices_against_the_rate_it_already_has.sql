/* 0150 — THE PALISADE SPEC POINTS AT ITS OWN RATE.

   `SEC-PAL-8` (8' steel palisade) had no spec-scoped recipe row, so a palisade
   job priced posts, concrete, anti-dig apron and labor — everything except the
   fence. The rate `SEC-PAL` has existed and been priced the whole time; nothing
   pointed at it.

   NO NEW FIGURE IS INVENTED HERE. The row carries a quantity and names a rate;
   the money is the book's, unchanged. It mirrors `SEC-358-8 → SEC-358` exactly,
   including the waste flag, which is the one judgment in it: palisade arrives in
   bays rather than on a roll, so if Ryan decides cut-to-fit waste does not apply
   the flag comes off and the price drops by the waste percentage.

   Two specs are still short and both need a price that does not exist yet:
   `CL-4-9-3` has no four-foot fabric rate in the book at all, and `SEC-358-10`
   cannot honestly reuse the eight-foot mesh rate. The spec-gap rule in priceIt
   keeps saying so on screen until they are filled. */

insert into hopper.fence_recipe (account_id, cls, spec_code, rate_code, per, qty, waste, note, sort, active)
select r.account_id, 'secure', 'SEC-PAL-8', 'SEC-PAL', 'foot', 1, true,
       'Palisade the length of the line. Mirrors the 358 mesh rule.', 401, true
from hopper.fence_recipe r
where r.cls = 'secure' and r.spec_code = 'SEC-358-8' and r.rate_code = 'SEC-358'
  and not exists (
    select 1 from hopper.fence_recipe x
    where x.account_id = r.account_id and x.spec_code = 'SEC-PAL-8' and x.rate_code = 'SEC-PAL')
limit 1;
