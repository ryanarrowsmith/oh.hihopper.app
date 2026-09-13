-- 0126 — a scope of work is written in parts, in two languages, from one set of facts
--
-- `fence_sow` held body_en and body_es: two blocks of prose. The approved screen
-- is not two blocks of prose — it is a fixed spine of headings with the project
-- manager's text under each, and the headings do not move, so that every scope
-- reads the same way and a crew knows where to look. Prose cannot carry that
-- structure without a parser, and a parser over text somebody is free to edit is
-- a bug with a schedule.
--
-- So the parts ARE the record: `parts_en` and `parts_es`, each an array of
-- { key, text }. body_en and body_es are dropped rather than kept in step —
-- there were no scopes written yet, and a derived copy of the same words is
-- exactly the kind of second answer this module keeps refusing to store. The
-- crew ticket and the glossary check read the parts.
--
-- The two languages are NOT a translation of each other and the schema should not
-- pretend otherwise. Both are rendered from the same takeoff, the same spec and
-- the same gates, so neither is downstream of the other. What does need recording
-- is WHEN each was last touched, because a project manager who edits the English
-- after the Spanish was written has left a crew building from the older of the
-- two — and that is the one thing nobody notices on their own.

alter table hopper.fence_sow
  add column if not exists parts_en   jsonb not null default '[]'::jsonb,
  add column if not exists parts_es   jsonb not null default '[]'::jsonb,
  add column if not exists written_en timestamptz,
  add column if not exists written_es timestamptz,
  add column if not exists drafted_at timestamptz;

alter table hopper.fence_sow drop column if exists body_en;
alter table hopper.fence_sow drop column if exists body_es;

-- The same shape test the run geometry gets: an array of objects, each with a
-- key and a string. A check constraint cannot hold a subquery, so the walk lives
-- in an IMMUTABLE function in `internal`, which is not exposed.
create or replace function internal.hopper_fence_parts_ok(parts jsonb)
returns boolean
language sql immutable set search_path to ''
as $$
  select parts is null or (
    jsonb_typeof(parts) = 'array'
    and jsonb_array_length(parts) <= 20
    and not exists (
      select 1 from jsonb_array_elements(parts) p
       where jsonb_typeof(p) <> 'object'
          or jsonb_typeof(p -> 'key') <> 'string'
          or jsonb_typeof(p -> 'text') <> 'string'
          or length(p ->> 'key') > 40
          or length(p ->> 'text') > 8000
    )
  );
$$;

alter table hopper.fence_sow drop constraint if exists fence_sow_parts_shape;
alter table hopper.fence_sow add constraint fence_sow_parts_shape
  check (internal.hopper_fence_parts_ok(parts_en)
     and internal.hopper_fence_parts_ok(parts_es));

comment on column hopper.fence_sow.parts_en is
  'The scope in English, as [{key, text}] against the fixed spine in lib/sow.ts.';
comment on column hopper.fence_sow.written_es is
  'When the Spanish was last written. Older than written_en means the crew is reading the older of the two.';
