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
