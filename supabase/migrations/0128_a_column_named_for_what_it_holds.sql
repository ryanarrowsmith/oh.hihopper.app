-- 0128 — `entered_at` does not hold a time
--
-- `fence_job.entered_at` is of type `hopper.fence_section`. It holds the
-- furthest phase a job has reached — intake, estimate, survey — and the job
-- screen uses it exactly that way. But every reader who has met a database
-- before reads `_at` as a timestamp, and the jobs list sits two files away
-- computing days-in-stage from a column that genuinely is one. It took a second
-- look to be sure the list was not quietly printing NaN.
--
-- It was not. That is the point: the name cost a check that the code did not
-- need. `type_code` got the same treatment in 0122 for the same reason — a
-- column named for one thing and holding another is how the next person writes a
-- bug with a clear conscience.

alter table hopper.fence_job rename column entered_at to reached;

comment on column hopper.fence_job.reached is
  'The furthest phase this job has got to. Not a time — see created_at for that.';
