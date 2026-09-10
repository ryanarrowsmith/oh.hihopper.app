# Migrations

Applied through the Supabase MCP rather than the CLI, so this folder is a record
rather than a source of truth. The database is the source of truth; what is
written down here is *why*, for the ones where the why is not obvious from the
SQL.

## 0029 — headline measure, and a share that never shared

`report_state.value` took the newest reading of **any** measure, so a report
with three of them showed whichever happened to be dated latest — a number the
card cannot label. The headline is `chart_measures[1]`.

`dashboard_read` compared `dashboard_share.dashboard_id` to `person.id`, so a
shared dashboard would never have been visible to the people it was shared with.
Nothing had exercised it — there are no dashboard screens yet — which is exactly
how a policy like that survives.

## 0030 — pg_net and pg_cron

The two halves of a schedule: something that wakes up, and something that can
make a request.

## 0031 — the sweep, reachable and authenticated

Two things.

**Reachable.** `read-report` was calling `internal.hopper_reports_due()` through
PostgREST, and PostgREST cannot see the `internal` schema at all —
`pgrst.db_schemas` is `public, graphql_public, beebee, site, hopper`. The sweep
would have failed on its first call. `internal` staying unexposed is right; what
was wrong was reaching for it from outside. `hopper.cron_sweep_due()` is the
door, open to the service role only, and the logic stays where it was.

**Authenticated, without anyone handling a key.** The obvious way to let pg_cron
prove itself to an edge function is to send the service-role key as a bearer
token — which means a person copies that key out of a dashboard and pastes it
somewhere. Nobody should have to. So the shared secret is generated *by the
database*, in SQL, and never leaves it: `vault.create_secret` stores 32 random
bytes, `internal.hopper_sweep()` reads it at call time to set `x-hopper-cron`,
and `hopper.cron_check()` is how the edge function asks whether what arrived
matches. No human and no agent has seen the value.

Verified both ways: the right secret returns `200 {"looked":0,...}`, a wrong one
returns `403 The sweep is not open to callers.`

The job is `hopper-read-reports`, `*/15 * * * *`. The interval is not the
schedule — `internal.hopper_reports_due()` decides what is actually due, and the
cron entry only knocks.

## 0104–0108 — Staffing, and two things that only showed up when it ran

**0104** puts the module's four tables in and, more importantly, decides that
the reporting line IS the permission. `internal.hopper_staff_line` walks UP
from the subject; if it meets you on the way, they are yours. Nobody grants
that — `person.manager_id` already said so, and a second list of who manages
whom is a second list that can disagree with the first. The walk stops at
depth 24, which is the cycle guard: nothing constrains `manager_id` against a
loop, and a loop inside a policy is a query that never returns.

`depth > 1` is doing quiet work. It is what makes a person not their own
manager, which is also what stops anybody scoring themselves.

`executive` does not open this and neither does `administrator`. Seeing every
business and reading every person's write-up are different sensitivities, and
one grant for both means whoever watches the numbers can read the coaching.
The account owner does, because an owner can grant it to themselves in one
click and pretending otherwise is theatre.

**0105** is the bucket. Reading a file is decided by the ROW — `exists (select
1 from hopper.staff_document …)` runs as the caller, so that table's own
policies answer, including the sensitive flag, which a storage path cannot
know. Writing is decided by the PATH, because the upload happens before the
row exists and a rule that waited for the row would refuse every first save.

**0106 and 0107 are the interesting ones**, and neither was predicted. The
model was tested by signing in as a real second person and reading the tables,
rather than by asking the helper functions whether they returned true — and a
manager could read their report's SCORE and not their report's NAME. Every row
on the Staffing home would have rendered blank for exactly the person the page
is for. `person_read` wanted the `roster` grant and knew nothing about
`manager_id`.

0106 fixed that with `hopper_staff_line`, which was the manager's case and only
the manager's case: somebody holding `staff_records` for a line that is not
theirs — the entire reason the grant exists — would have got the same page of
nameless rows. 0107 replaced it with `hopper_staff_reach`, which is the same
question with the grant and the owner folded in, and is the predicate every
other Staffing policy already uses.

Both bugs are the same shape as 0031, 0052 and 0053: a gate that returns the
right answer when you ask it, sitting next to a query that never asked.

**0108** is `hopper.staff_stance(acct)` — one answer to "what am I here", so the
pages do not each ask `access_grant` a question with its own policy. It decides
what is OFFERED, never what is permitted.
