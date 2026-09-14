-- 0116 — the lists the admin panel manages.
--
-- The approved admin panel has seven sections and the schema supported three.
-- These are the other four, plus the pricing settings that were living in the
-- preview as figures with nowhere to be stored.
--
-- Grants follow the 0110 lesson: `hopper` has a DEFAULT ACL handing
-- `authenticated` arwd on every new table, so a column that must not be read is
-- REVOKED at the table and then re-granted by name. Here that is the burdened
-- crew rate, which is a cost input like any other.

create table if not exists hopper.fence_spec (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  code        text not null,
  cls         hopper.fence_class not null,
  name_en     text not null,
  name_es     text,
  height_ft   numeric(4,1),
  spacing_ft  numeric(4,1),
  note        text,
  active      boolean not null default true,
  unique (account_id, code)
);
create index if not exists fence_spec_acct_idx on hopper.fence_spec (account_id, cls, active);
comment on table hopper.fence_spec is
  'What can be built, by class. The class is chosen before anything is measured, and it narrows this list, the gate catalog, the labor task, the tools and the charge codes.';

create table if not exists hopper.fence_gate_type (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  code        text not null,
  cls         hopper.fence_class not null,
  name_en     text not null,
  name_es     text,
  width_ft    numeric(4,1),
  rate_code   text,
  active      boolean not null default true,
  unique (account_id, code)
);
create index if not exists fence_gate_type_acct_idx on hopper.fence_gate_type (account_id, cls, active);
comment on table hopper.fence_gate_type is
  'The gate catalog, narrowed by class. Changing a job class drops the gates that no longer apply rather than leaving them priced on the quote.';

create table if not exists hopper.fence_glossary (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  en          text not null,
  es          text not null,
  note        text,
  unique (account_id, en)
);
create index if not exists fence_glossary_acct_idx on hopper.fence_glossary (account_id);
comment on table hopper.fence_glossary is
  'The trade glossary the translator is held to, so "top rail" is not three different words across three jobs.';

create table if not exists hopper.fence_crew (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references beebee.accounts(id) on delete cascade,
  name        text not null,
  foreman_id  uuid references hopper.person(id),
  lang        text not null default 'es' check (lang in ('en','es')),
  badged      boolean not null default false,
  size        int,
  active      boolean not null default true,
  unique (account_id, name)
);
create index if not exists fence_crew_acct_idx on hopper.fence_crew (account_id, active);
comment on column hopper.fence_crew.badged is
  'A badged crew is the only one a secure site will admit. Escorted days are quoted against it.';

create table if not exists hopper.fence_settings (
  account_id     uuid primary key references beebee.accounts(id) on delete cascade,
  margin_floor   numeric(5,2) not null default 35,
  crew_rate      numeric(10,2) not null default 96,
  labor_markup   numeric(6,3) not null default 1.85,
  waste_pct      numeric(5,2) not null default 4,
  link_expires   boolean not null default true,
  updated_at     timestamptz not null default now()
);
comment on column hopper.fence_settings.crew_rate is
  'What an hour of crew costs us, all in. A cost input, so it is revoked like cost and markup — labor is estimated in crew-hours per unit and multiplied by this, which is why a wage change moves one field and the hours stay true.';
comment on column hopper.fence_settings.margin_floor is
  'Sales sees margin against this. A quote under it needs a manager to release it, which is the whole reason sales sees margin at all.';

alter table hopper.fence_spec      enable row level security;
alter table hopper.fence_gate_type enable row level security;
alter table hopper.fence_glossary  enable row level security;
alter table hopper.fence_crew      enable row level security;
alter table hopper.fence_settings  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fence_spec','fence_gate_type','fence_glossary','fence_crew','fence_settings']
  loop
    execute format('drop policy if exists %I on hopper.%I', t || '_read', t);
    execute format('create policy %I on hopper.%I for select using (internal.hopper_fence_book(account_id))', t || '_read', t);
    execute format('drop policy if exists %I on hopper.%I', t || '_write', t);
    execute format('create policy %I on hopper.%I for all using (internal.hopper_may_manage(account_id)) with check (internal.hopper_may_manage(account_id))', t || '_write', t);
    execute format('revoke all on hopper.%I from anon', t);
  end loop;
end $$;

-- The crew rate is a cost input. Same treatment, same reason.
do $$
declare cols text;
begin
  revoke select on hopper.fence_settings from authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'hopper' and table_name = 'fence_settings'
     and column_name <> 'crew_rate';
  execute format('grant select (%s) on hopper.fence_settings to authenticated', cols);
end $$;

insert into hopper.fence_settings (account_id)
values ('1ade454c-54e8-45d9-beec-cc52a21f7ea2')
on conflict (account_id) do nothing;

insert into hopper.fence_glossary (account_id, en, es) values
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','chain link','malla ciclónica'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','line post','poste intermedio'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','terminal post','poste terminal'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','top rail','riel superior'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','tension bar','barra tensora'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','tension band','abrazadera de tensión'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','loop cap','copa pasante'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','tie wire','alambre de amarre'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','vehicle gate','portón vehicular'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','walk gate','puerta peatonal'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','crew','cuadrilla'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','grade','pendiente'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','anti-climb mesh','malla antiescalamiento'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','shear nut','tuerca de corte'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','anti-dig apron','faldón antiexcavación'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','bollard','bolardo'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','escort','escolta'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','locates','marcas de servicios subterráneos')
on conflict (account_id, en) do nothing;

insert into hopper.fence_spec (account_id, code, cls, name_en, name_es, height_ft, spacing_ft) values
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','CL-6-9-3','permanent','6'' chain link, 9 ga, 3" mesh','Malla ciclónica 1.8 m, cal. 9',6,10),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','CL-4-9-3','permanent','4'' chain link, 9 ga, 3" mesh','Malla ciclónica 1.2 m, cal. 9',4,10),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','WD-6-CED','permanent','6'' cedar privacy','Cerca de privacidad de cedro 1.8 m',6,8),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','TF-6-PNL','temporary','6x12 panel, driven base','Panel 1.8x3.7 m con base',6,12),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','SEC-358-8','secure','8'' anti-climb 358 mesh','Malla antiescalamiento 2.4 m',8,8),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','SEC-358-10','secure','10'' anti-climb 358 mesh, sensor-ready','Malla antiescalamiento 3 m, lista para sensor',10,8),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','SEC-PAL-8','secure','8'' steel palisade','Empalizada de acero 2.4 m',8,8)
on conflict (account_id, code) do nothing;

insert into hopper.fence_gate_type (account_id, code, cls, name_en, name_es, width_ft, rate_code) values
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','G-WK-4','permanent','4'' walk gate','Puerta peatonal 1.2 m',4,'GATE-WK'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','G-VD-16','permanent','16'' double drive','Portón vehicular doble 4.9 m',16,'GATE-VD'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','G-SL-20','permanent','20'' cantilever slide','Portón corredizo en voladizo 6.1 m',20,'GATE-VD'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','G-TF-PNL','temporary','Panel gate','Portón de panel',12,null),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','G-SEC-M30','secure','M30 crash-rated slider','Portón corredizo certificado M30',24,null),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','G-SEC-TURN','secure','Full-height turnstile','Torniquete de altura completa',3,null)
on conflict (account_id, code) do nothing;

insert into hopper.fence_crew (account_id, name, lang, badged, size) values
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','Crew 1','es',false,4),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','Crew 2','es',true,5),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2','Crew 3','en',false,3)
on conflict (account_id, name) do nothing;
