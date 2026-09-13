-- 0123 — the recipe: what a foot of fence is made of
--
-- The bill of materials runs on trade rules. Three tension bands per terminal
-- post. Two bags of concrete per line post, three per terminal. A tie every ten
-- inches. Forty feet of chain link an hour for a crew of three.
--
-- Every one of those is a number On Call will want to change, and none of them
-- belongs in TypeScript: a rule hard-coded in the pricer is a SECOND rate book,
-- hidden from the screen that manages the first one, and the day somebody
-- changes crews or suppliers they would be editing a deployment rather than a
-- row. So the rules are data, the admin panel manages them, and the pricer walks
-- the table.
--
-- `per` is what the quantity is counted against, and the vocabulary is the
-- takeoff's own: a foot of fence, a post of each kind, a gate, or the job. That
-- is why labour fits here too rather than needing a table of its own — a crew
-- hour per foot is 1/40 when the crew does forty feet an hour, and it prices
-- through the same book as the fabric.
--
-- `spec_code` null means "every spec in this class". Fabric is the thing that
-- actually depends on the spec, because six-foot fabric is not four-foot fabric;
-- rail, ties, posts, concrete and labour do not care. So most rows are written
-- against the class and the pricer takes both.
--
-- Nothing here is money. A recipe row names a rate code and a quantity; what
-- that rate costs and sells for stays in the book, behind its own policy.

create table if not exists hopper.fence_recipe (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references beebee.accounts(id) on delete cascade,
  cls        hopper.fence_class not null,
  spec_code  text,
  rate_code  text not null,
  per        text not null,
  qty        numeric(12,5) not null default 1,
  waste      boolean not null default false,
  note       text,
  sort       integer not null default 0,
  active     boolean not null default true,
  constraint fence_recipe_per check (per in
    ('foot', 'line_post', 'terminal_post', 'corner_post', 'gate', 'job')),
  constraint fence_recipe_qty check (qty > 0),
  unique (account_id, cls, spec_code, rate_code, per)
);

create index if not exists fence_recipe_book
  on hopper.fence_recipe (account_id, cls, sort);

alter table hopper.fence_recipe enable row level security;

-- Readable by anybody who can see the book, because a quantity is not a price:
-- a project manager checking why the estimate wants 104 line posts should not
-- need the cost table to find out.
create policy fence_recipe_read on hopper.fence_recipe
  for select using (internal.hopper_fence_book(account_id));

create policy fence_recipe_write on hopper.fence_recipe
  for all using (internal.hopper_may_manage(account_id))
       with check (internal.hopper_may_manage(account_id));

revoke all on hopper.fence_recipe from anon;

-- The rules as On Call builds today, for the seeded book. Placeholders in the
-- same sense the rates are: the shape is right and the figures want a foreman.
insert into hopper.fence_recipe
  (account_id, cls, spec_code, rate_code, per, qty, waste, sort, note)
select '1ade454c-54e8-45d9-beec-cc52a21f7ea2'::uuid,
       v.cls::hopper.fence_class, v.spec, v.rate, v.per, v.qty, v.waste, v.sort, v.note
from (values
  -- Permanent chain link ---------------------------------------------------
  ('permanent','CL-6-9-3','CL-FAB6','foot',          1,      true,  10,
     'Six-foot fabric. The one line that depends on the spec rather than the class.'),
  ('permanent', null,     'CL-RAIL','foot',          1,      true,  20,
     'Top rail runs the whole line, including across a corner.'),
  ('permanent', null,     'CL-TIE', 'foot',          1.2,    false, 30,
     'A tie roughly every ten inches, and two at each post.'),
  ('permanent', null,     'CL-LINE','line_post',     1,      false, 40, null),
  ('permanent', null,     'CL-LOOP','line_post',     1,      false, 50, null),
  ('permanent', null,     'CL-CONC','line_post',     2,      false, 60, null),
  ('permanent', null,     'CL-TERM','terminal_post', 1,      false, 70, null),
  ('permanent', null,     'CL-TBAR','terminal_post', 1,      false, 80, null),
  ('permanent', null,     'CL-TBND','terminal_post', 3,      false, 90, null),
  ('permanent', null,     'CL-CONC','terminal_post', 3,      false, 100, null),
  ('permanent', null,     'CL-TERM','corner_post',   1,      false, 110,
     'A corner is a terminal post in the middle of a run — the fabric pulls both ways.'),
  ('permanent', null,     'CL-TBAR','corner_post',   2,      false, 120, null),
  ('permanent', null,     'CL-TBND','corner_post',   3,      false, 130, null),
  ('permanent', null,     'CL-CONC','corner_post',   3,      false, 140, null),
  ('permanent', null,     'LAB-CL', 'foot',          0.025,  false, 150,
     'Forty feet of line an hour, crew of three, on ground that digs.'),
  ('permanent', null,     'EQ-AUG', 'job',           1,      false, 160,
     'One day of the auger truck. Two-day jobs are a change on the estimate.'),

  -- Wood privacy ------------------------------------------------------------
  ('permanent','WD-6-CED','WD-CEDAR','foot',         2.18,   true,  200,
     '5½ inch pickets, laid tight. The waste allowance covers the culls.'),
  ('permanent','WD-6-CED','WD-RAIL', 'foot',         0.375,  true,  210,
     'Three rails to an eight-foot section.'),
  ('permanent','WD-6-CED','LAB-WD',  'foot',         0.045,  false, 220,
     'Twenty-two feet an hour. Wood is slower than link.'),

  -- Temporary ---------------------------------------------------------------
  ('temporary', null,     'TF-PNL', 'foot',          0.0834, false, 300,
     'One panel to twelve feet.'),
  ('temporary', null,     'TF-BASE','foot',          0.0834, false, 310, null),
  ('temporary', null,     'TF-CLMP','foot',          0.0834, false, 320, null),
  ('temporary', null,     'TF-SAND','foot',          0.1668, false, 330,
     'Two bags a panel on open ground.'),
  ('temporary', null,     'LAB-TF', 'foot',          0.008,  false, 340,
     'A hundred and twenty-five feet an hour once the truck is on site.'),
  ('temporary', null,     'R-DEL',  'job',           1,      false, 350, null),
  ('temporary', null,     'R-PU',   'job',           1,      false, 360,
     'The pickup is quoted with the set, because it always happens.'),

  -- Secure ------------------------------------------------------------------
  ('secure','SEC-358-8','SEC-358','foot',            1,      true,  400, null),
  ('secure', null,      'SEC-DIG','foot',            1,      false, 410,
     'Anti-dig apron the length of the line.'),
  ('secure', null,      'SEC-NUT','foot',            0.5,    false, 420, null),
  ('secure', null,      'CL-TERM','terminal_post',   1,      false, 430, null),
  ('secure', null,      'CL-CONC','terminal_post',   3,      false, 440, null),
  ('secure', null,      'CL-TERM','corner_post',     1,      false, 450, null),
  ('secure', null,      'CL-CONC','corner_post',     3,      false, 460, null),
  ('secure', null,      'LAB-SEC','foot',            0.05,   false, 470,
     'Twenty feet an hour. Escorted sites are slower than the fence is.'),
  ('secure', null,      'EQ-TEL', 'job',             1,      false, 480, null)
) as v(cls, spec, rate, per, qty, waste, sort, note)
on conflict do nothing;
