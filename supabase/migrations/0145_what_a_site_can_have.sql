/* 0145 — WHAT A SITE CAN HAVE, and what each one costs.

   Placeholders, like the rest of the book: source 'placeholder', no verified
   date, so every screen that shows them marks them as unchecked. Ryan, 14 Sep:
   "let's work from here" -- these are a starting point he edits, not figures
   anybody should quote from.

   EVERY ONE OF THESE IS AN ORDINARY RATE BOOK ROW. That is the whole point of
   giving a condition a rate_code rather than a price: removal, rock and steps
   are edited in Admin > Fence Builder > Rate book exactly like fabric and
   concrete, by the same form, with the same Checked column and the same cost
   side behind the same policy. There is no second place where a price lives.

   SELL IS NOT SET HERE. hopper.fence_rate_sell() derives it from cost x markup
   whenever the cost row is written, so seeding sell directly would create a
   figure the trigger disagrees with the moment anybody touches it.

   SC-CORE IS DELIBERATELY ABSENT from the book while DIG-CORE exists in the
   catalog. A condition whose rate_code names no line MEASURES BUT DOES NOT
   PRICE, and every demo should walk over that path rather than discovering it
   on a real job. Same reason the seeded book prices the sample job under the
   margin floor. */

do $$
declare
  a uuid;
  r record;
  rid uuid;
begin
  /* THE ACCOUNT THAT ALREADY KEEPS A RATE BOOK.
     The first attempt matched on the name "On Call" and seeded nothing: there
     is no On Call ACCOUNT. On Call is an organization inside Ryan's account,
     and the rate book is account-wide -- which 0113 already had to learn once,
     when the book's policy asked for the module at organization scope and the
     people who price jobs could not see it. Asking the data which account holds
     fence rates is both correct and self-checking: no book, nothing to add to. */
  select account_id into a from hopper.fence_rate
   group by account_id order by count(*) desc limit 1;
  if a is null then
    raise notice 'no fence rate book anywhere — nothing seeded';
    return;
  end if;

  -- ------------------------------------------------- what it bills under
  insert into hopper.fence_charge_code (account_id, code, description, provisional, sort)
  values
    (a, 'HAUL',     'Haul off and dispose', true, 60),
    (a, 'SITE-DIG', 'Difficult digging — rock, hand dig, coring', true, 61),
    (a, 'SITE-GRD', 'Grade and clearing work on the line', true, 62)
  on conflict do nothing;

  -- ----------------------------------------------------- what it prices at
  for r in
    select * from (values
      ('DM-CL4',  'Removal', 'Remove 4'' chain link',        'Retirar malla ciclónica de 4''',   'ft',    2.50,  1.70),
      ('DM-CL6',  'Removal', 'Remove 6'' chain link',        'Retirar malla ciclónica de 6''',   'ft',    3.00,  1.80),
      ('DM-WD',   'Removal', 'Remove wood privacy',          'Retirar cerca de madera',          'ft',    3.25,  1.80),
      ('DM-ORN',  'Removal', 'Remove ornamental or iron',    'Retirar cerca ornamental o hierro','ft',    3.80,  1.80),
      ('DM-FTG',  'Removal', 'Break out a post footing',     'Romper la base de un poste',       'ea',    6.50,  1.70),
      ('DM-HAUL', 'Removal', 'Haul off and dispose, a load', 'Acarreo y desecho, por carga',     'load',110.00,  1.70),
      ('SC-ROCK', 'Site conditions', 'Rock at post depth, a post',  'Roca a la profundidad del poste', 'post', 22.00, 1.75),
      ('SC-HAND', 'Site conditions', 'Hand dig a post',             'Excavar un poste a mano',         'post', 27.00, 1.75),
      ('SC-CLEAR','Site conditions', 'Clear the line',              'Despejar la línea',               'ft',    1.80, 1.75),
      ('SC-STEP', 'Site conditions', 'Step panels on grade',        'Escalonar paneles en pendiente',  'step', 15.50, 1.75),
      ('SC-SPOIL','Site conditions', 'Haul off spoil, a load',      'Acarreo de tierra, por carga',    'load', 95.00, 1.75)
    ) as v(code, grp, name_en, name_es, uom, cost, markup)
  loop
    insert into hopper.fence_rate
      (account_id, code, kind, grp, name_en, name_es, uom, source, active)
    values (a, r.code, 'labor', r.grp, r.name_en, r.name_es, r.uom, 'placeholder', true)
    on conflict do nothing;

    select id into rid from hopper.fence_rate
     where account_id = a and code = r.code;

    insert into hopper.fence_rate_cost (account_id, rate_id, cost, markup)
    values (a, rid, r.cost, r.markup)
    on conflict (account_id, rate_id) do nothing;
  end loop;

  -- --------------------------------------------------- what can be found
  insert into hopper.fence_condition
    (account_id, code, name_en, name_es, blurb_en, blurb_es,
     rate_code, charge_code, wants_qty, at_estimate, sort)
  values
    (a, 'DEMO-CL4', 'Remove existing 4'' chain link', 'Retirar malla ciclónica de 4'' existente',
     'Fabric, rails and posts out, footings left in place',
     'Malla, rieles y postes fuera; las bases quedan',
     'DM-CL4', 'TEAR', true, true, 10),
    (a, 'DEMO-CL6', 'Remove existing 6'' chain link', 'Retirar malla ciclónica de 6'' existente',
     'Fabric, rails and posts out, footings left in place',
     'Malla, rieles y postes fuera; las bases quedan',
     'DM-CL6', 'TEAR', true, true, 20),
    (a, 'DEMO-WD', 'Remove existing wood privacy', 'Retirar cerca de madera existente',
     'Pickets, rails and posts out', 'Tablas, rieles y postes fuera',
     'DM-WD', 'TEAR', true, true, 30),
    (a, 'DEMO-ORN', 'Remove existing ornamental or iron', 'Retirar cerca ornamental o de hierro',
     'Panels and posts out, cut free where welded',
     'Paneles y postes fuera; cortar donde esté soldado',
     'DM-ORN', 'TEAR', true, true, 40),
    (a, 'DEMO-FTG', 'Break out post footings', 'Romper las bases de los postes',
     'Only when the old posts were set in concrete and the new line reuses the path',
     'Solo si los postes viejos quedaron en concreto y la línea nueva usa el mismo trazo',
     'DM-FTG', 'TEAR', true, true, 50),
    (a, 'DEMO-HAUL', 'Haul off and dispose', 'Acarreo y desecho',
     'What comes out has to go somewhere, and the landfill weighs it',
     'Lo que sale tiene que ir a algún lado, y el relleno lo pesa',
     'DM-HAUL', 'HAUL', true, true, 60),
    (a, 'DIG-ROCK', 'Rock at post depth', 'Roca a la profundidad del poste',
     'The auger refuses before the hole is deep enough',
     'La barrena se detiene antes de la profundidad necesaria',
     'SC-ROCK', 'SITE-DIG', true, false, 70),
    (a, 'DIG-HAND', 'Hand dig only', 'Excavación a mano únicamente',
     'Utilities, irrigation or access rule the auger out on part of the line',
     'Servicios, riego o acceso impiden usar la barrena en parte de la línea',
     'SC-HAND', 'SITE-DIG', true, false, 80),
    (a, 'DIG-CORE', 'Coring through hard surface', 'Perforar superficie dura',
     'Posts landing in a slab, drive or sidewalk',
     'Postes que caen en losa, entrada o banqueta',
     'SC-CORE', 'SITE-DIG', true, false, 90),
    (a, 'CLEAR-LN', 'Clearing or tree roots', 'Desmonte o raíces',
     'Brush, roots or limbs in the way of the line',
     'Maleza, raíces o ramas en el paso de la línea',
     'SC-CLEAR', 'SITE-GRD', true, false, 100),
    (a, 'GRADE-STP', 'Stepped panels on grade', 'Paneles escalonados en pendiente',
     'Stepping rather than raking, where the fall is too steep to follow',
     'Escalonar en vez de seguir el terreno cuando la pendiente es fuerte',
     'SC-STEP', 'SITE-GRD', true, false, 110),
    (a, 'HAUL-SPL', 'Spoil haul-off', 'Acarreo de tierra',
     'Nowhere on site to leave the dirt from the holes',
     'No hay dónde dejar la tierra de las excavaciones en el sitio',
     'SC-SPOIL', 'HAUL', true, false, 120)
  on conflict do nothing;
end $$;
