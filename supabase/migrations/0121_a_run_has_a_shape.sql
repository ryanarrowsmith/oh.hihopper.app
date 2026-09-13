-- 0121 — a run has a shape, and a project manager prices work
--
-- `fence_run` recorded plan_ft: a number somebody typed. The estimator draws the
-- line on county imagery, so the run needs the line itself. Points, not a
-- PostGIS geometry: nothing here does spatial queries — no "which jobs are
-- within a mile", no intersections — and the one thing the app does do with the
-- shape (measure it, count its corners) it does in TypeScript on the way to a
-- price. A jsonb array read and written whole is the honest size of the need,
-- and it survives a Supabase project that has not enabled the extension.
--
-- [[lng, lat]] in that order, which is GeoJSON's order rather than the order
-- people say out loud. The check constraint below is the only place that can
-- catch a pair written the wrong way round: latitude cannot exceed 90, so a
-- transposed Tulsa point (36, -95) fails on the longitude test.
--
-- plan_ft stays, and stays authoritative: a run measured with a wheel or a laser
-- at the survey has no points at all, and the number it produces beats anything
-- read off an aerial. Points fill plan_ft in when the line was drawn; the survey
-- overwrites it.

alter table hopper.fence_run
  add column if not exists points jsonb,
  add column if not exists measured_by text;

-- A check constraint cannot hold a subquery, and walking an array needs one, so
-- the shape test is an IMMUTABLE function in `internal` and the constraint calls
-- it. No definer, so nothing for the contract checker to flag, and `internal` is
-- not exposed to PostgREST in any case.
create or replace function internal.hopper_fence_line_ok(points jsonb)
returns boolean
language sql immutable set search_path to ''
as $$
  select points is null or (
    jsonb_typeof(points) = 'array'
    and jsonb_array_length(points) >= 2
    and not exists (
      select 1 from jsonb_array_elements(points) p
       where jsonb_typeof(p) <> 'array'
          or jsonb_array_length(p) <> 2
          or jsonb_typeof(p -> 0) <> 'number'
          or jsonb_typeof(p -> 1) <> 'number'
          or abs((p ->> 0)::numeric) > 180
          or abs((p ->> 1)::numeric) > 90
    )
  );
$$;

alter table hopper.fence_run
  drop constraint if exists fence_run_points_shape;

alter table hopper.fence_run
  add constraint fence_run_points_shape
  check (internal.hopper_fence_line_ok(points));

alter table hopper.fence_run
  drop constraint if exists fence_run_measured_by;

alter table hopper.fence_run
  add constraint fence_run_measured_by check (
    measured_by is null or measured_by in ('aerial', 'wheel', 'laser', 'plans', 'typed')
  );

comment on column hopper.fence_run.points is
  'The drawn line as [[lng, lat], ...]. Null when the length was measured rather than drawn.';
comment on column hopper.fence_run.measured_by is
  'How plan_ft was arrived at. Aerial is a quote; a survey figure is a build.';

-- ------------------------------------------- the project manager prices work
-- Ryan, 13 Sep: a PM is in the cost list by default. They price change orders
-- and they close the job out, and needing an explicit grant to see the figure
-- they are revising is a support call waiting to happen. Field crew is still
-- the one job that must never appear here.
create or replace function internal.hopper_fence_costs(
  acct uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path to ''
as $$
  select internal.hopper_member(acct, uid) and (
    internal.hopper_may_manage(acct, uid)
    or exists (select 1 from hopper.fence_person fp
                where fp.account_id = acct
                  and fp.person_id = internal.hopper_person(acct, uid)
                  and fp.job_role in ('sales', 'pm', 'billing'))
    or exists (select 1 from hopper.access_grant g
                where g.account_id = acct
                  and g.person_id = internal.hopper_person(acct, uid)
                  and g.object = 'fence_costs' and g.may_view)
  );
$$;
