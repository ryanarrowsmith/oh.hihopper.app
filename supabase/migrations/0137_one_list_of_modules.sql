-- 0137 — one list of modules, not two
--
-- `hopper.my_module_levels` answers "which organizations do I hold which modules
-- on", and it carried its own hardcoded list: reporting, projects, staffing,
-- meetings, wiki. `internal.hopper_optional_modules()` carries the real one, and
-- 0109 added 'fence' to that. So Fence Builder has been invisible to this
-- function since the day it was built — which matters now, because the screen
-- that opens a job has to ask which organizations this person may open one on.
--
-- The literal is the bug, not the missing entry. It reads from the one list now,
-- plus 'wiki', which is not an optional module and so is not in it.

create or replace function hopper.my_module_levels(acct uuid)
returns table(module text, entity_id uuid, entity_name text, level text, scoped boolean)
language sql
stable
set search_path to ''
as $function$
  select m.key, e.id, e.name,
         internal.hopper_module_level(acct, m.key, e.id),
         internal.hopper_grant_level(acct, m.key, e.id) is not null
    from unnest(internal.hopper_optional_modules() || array['wiki']) as m(key)
    cross join hopper.entity e
   where e.account_id = acct
     and internal.hopper_entity_level(acct, e.id) is not null
     and internal.hopper_module_level(acct, m.key, e.id) is not null;
$function$;

comment on function hopper.my_module_levels(uuid) is
  'Which modules this person holds on which organizations. The module list comes from internal.hopper_optional_modules() so it cannot drift from the one the rest of the app uses.';
