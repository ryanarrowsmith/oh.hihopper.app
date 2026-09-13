-- 0110 — the money columns, actually closed.
--
-- 0109 granted only the columns it meant to and assumed that was the whole
-- story. It was not: hopper carries a DEFAULT ACL granting `authenticated`
-- arwd on every table created in the schema, so each fence table had
-- table-level SELECT the moment it existed and every price was readable. A
-- column grant cannot narrow a table grant — only a revoke can.
--
-- Same shape as 0031, 0052, 0053, 0106 and 0107: two individually-correct
-- components with the fault in the gap between them, invisible until something
-- actually asked.

do $$
declare r record; cols text;
begin
  for r in select * from (values
      ('fence_job',         array['sold_price']),
      ('fence_option',      array['price']),
      ('fence_charge_line', array['amount']),
      ('fence_rate',        array['cost','markup']),
      ('fence_revision',    array['sold_before','sold_after'])
    ) as t(tbl, hide)
  loop
    execute format('revoke select on hopper.%I from authenticated', r.tbl);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'hopper' and table_name = r.tbl
       and not (column_name = any(r.hide));
    execute format('grant select (%s) on hopper.%I to authenticated', cols, r.tbl);
  end loop;
end $$;

comment on column hopper.fence_job.sold_price is
  'The price the customer accepted. Frozen, and not readable by `authenticated` — the app reads it server-side once it knows who is asking.';
comment on column hopper.fence_rate.cost is
  'Not readable by `authenticated`. sell is generated from it, so a sell price needs no access to the cost it came from.';
