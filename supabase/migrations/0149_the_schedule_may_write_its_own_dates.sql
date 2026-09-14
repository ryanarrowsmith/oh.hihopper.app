/* 0149 — THE SCHEDULE MAY WRITE ITS OWN DATES.

   0147 put the booking columns on fence_job — starts_on, days_on_site, ends_on,
   booked_at, booked_by — and fence_job's write policy only ever answered for two
   sections: intake and survey. So the project manager owned a section they could
   not save.

   This adds the third clause, in the same shape as the two already there. It is
   a WIDENING and it is worth naming: fence_job has no per-column policy, so
   whoever may edit the schedule section may now write every column on the row,
   spec_code and sold_price included — exactly as intake and survey already
   could. The seal is still what holds: hopper_fence_edits checks the seal before
   it checks anything else, so once schedule is sealed this clause stops
   answering, administrator included.

   0125's standing warning applies as always — the policies are OR'd, so a
   clause that answers to nothing widens nothing, and one that answers too
   easily widens everything. This one answers only to the schedule section's own
   owner. */

drop policy if exists fence_job_write on hopper.fence_job;
create policy fence_job_write on hopper.fence_job for all to authenticated
  using (
    internal.hopper_fence_edits(account_id, id, 'intake')
    or internal.hopper_fence_edits(account_id, id, 'survey')
    or internal.hopper_fence_edits(account_id, id, 'schedule')
  )
  with check (
    internal.hopper_fence_edits(account_id, id, 'intake')
    or internal.hopper_fence_edits(account_id, id, 'survey')
    or internal.hopper_fence_edits(account_id, id, 'schedule')
  );
