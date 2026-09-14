-- 0117 — labor_markup belongs with cost and markup, not with the floor.
--
-- 0116 revoked `crew_rate` and stopped there, which was half an answer:
-- `fence_rate.markup` is revoked for the reason that knowing a markup and a
-- sell price gives you the cost. `fence_settings.labor_markup` is the same
-- number for labor, so leaving it readable handed back what revoking crew_rate
-- had just taken away.
--
-- margin_floor and waste_pct stay readable. The floor is the whole reason sales
-- sees margin at all, and waste is a quantity rule rather than a price.

do $$
declare cols text;
begin
  revoke select on hopper.fence_settings from authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'hopper' and table_name = 'fence_settings'
     and column_name not in ('crew_rate', 'labor_markup');
  execute format('grant select (%s) on hopper.fence_settings to authenticated', cols);
end $$;

comment on column hopper.fence_settings.labor_markup is
  'Revoked like cost and markup: a markup plus a sell price is a cost. Labor is estimated in crew-hours per unit and multiplied by the burdened rate and this, so a wage change moves one field and the hours stay true.';
