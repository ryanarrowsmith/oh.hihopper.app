-- 0132 — two policies the handoff would have died on
--
-- `handToPm` does one business act — sales sends the job forward — out of two
-- writes: it seals the estimate, and it opens the project manager's task list
-- from the plan. Both were refused, and neither refusal would have shown up
-- until somebody pressed the button.
--
-- THE TASKS BELONG TO SECTIONS THE SENDER DOES NOT OWN. `fence_task_write` is
-- `hopper_fence_edits(section)`, which is right for working a task: the survey
-- tasks are the project manager's, the ticket's are the crew's. But sales is the
-- one handing over, and every row they need to insert is somebody else's
-- section. Under that policy alone, only an administrator could ever hand a job
-- over.
--
-- So opening the plan is its own narrow right, and it rides on the one that
-- already exists: whoever may SEAL a job may open its plan. A permissive policy
-- ORs with the section one, and this one is deliberately tiny — only rows marked
-- `from_plan`, only insert. It does not let sales tick a project manager's task
-- afterwards, which is exactly the line: sales opens the list, the project
-- manager works it.
--
-- AND A LOCATION WAS WRITEABLE BY ANY MEMBER. 0130 wrote `hopper_member` for the
-- write policy, which is everybody with a Hopper login — including people with
-- no fence access at all — and the row holds the Navusoft account number a
-- customer is billed under. The population that should touch it is the one that
-- can already see the book.

create policy fence_task_open_the_plan on hopper.fence_task
  for insert with check (
    from_plan
    and internal.hopper_fence_reach(account_id, job_id)
    and internal.hopper_granted(account_id, 'fence_seal', 'edit')
  );

drop policy if exists fence_location_write on hopper.fence_location;
create policy fence_location_write on hopper.fence_location
  for all using (internal.hopper_fence_book(account_id))
       with check (internal.hopper_fence_book(account_id));
