-- 0131 — the task plan, and a task that cannot be ticked on the way past
--
-- Ryan, 13 Sep: the project manager's first task is to create the Navusoft
-- account; there needs to be a task plan kicked off when Sales sends the job
-- forward; start it with what we already have.
--
-- THE PLAN IS A TABLE. `fence_task.from_plan` has been sitting there since 0109
-- waiting for one. A list of standing steps hard-coded in the app would be the
-- same mistake as burying the trade rules in the pricer — invisible to the
-- screen that manages everything else, and changed by editing a deployment.
--
-- IT STARTS WHERE SALES STOPS. The plan holds the phases after the handoff,
-- because the handoff is what kicks it off: seeding sales' own steps would
-- create a to-do list of work already finished. Sales' sections are absent on
-- purpose, not by oversight.
--
-- `needs` IS WHAT MAKES A TASK HONEST. A step naming a field is not done until
-- the field has something in it. "Create Navusoft Account" with no account
-- number beside it is a checkbox somebody ticks on the way past — and that one
-- gates billing, which makes it the worst one to be able to fake. The vocabulary
-- is deliberately tiny: a task either needs nothing, or names the one piece of
-- data it is about.

create table if not exists hopper.fence_task_plan (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references beebee.accounts(id) on delete cascade,
  section    hopper.fence_section not null,
  en         text not null,
  es         text not null,
  -- What has to exist before it may be called done. Null means a person's word
  -- is the whole of it, which is most of them.
  needs      text,
  /* Days after the handoff this is due. Null is "no date" rather than "today" —
     a plan that invents deadlines teaches people to ignore the ones that matter. */
  due_days   integer,
  sort       integer not null default 0,
  active     boolean not null default true,
  constraint fence_task_plan_needs check (needs is null or needs in ('navusoft_account')),
  unique (account_id, section, en)
);

create index if not exists fence_task_plan_order
  on hopper.fence_task_plan (account_id, sort);

alter table hopper.fence_task_plan enable row level security;

create policy fence_task_plan_read on hopper.fence_task_plan
  for select using (internal.hopper_fence_book(account_id));

create policy fence_task_plan_write on hopper.fence_task_plan
  for all using (internal.hopper_may_manage(account_id))
       with check (internal.hopper_may_manage(account_id));

revoke all on hopper.fence_task_plan from anon;

-- A task on a job remembers what it needs, so the rule survives a plan that is
-- edited afterwards. The tasks already on a job answer to the plan as it was
-- when they were made.
alter table hopper.fence_task
  add column if not exists needs text;

alter table hopper.fence_task drop constraint if exists fence_task_needs;
alter table hopper.fence_task add constraint fence_task_needs
  check (needs is null or needs in ('navusoft_account'));

-- The plan as the scope of record describes it, phase by phase. TBD steps are
-- Ryan's to add; these are the ones the business has already written down.
insert into hopper.fence_task_plan
  (account_id, section, en, es, needs, due_days, sort)
select '1ade454c-54e8-45d9-beec-cc52a21f7ea2'::uuid,
       v.section::hopper.fence_section, v.en, v.es, v.needs, v.due_days, v.sort
from (values
  -- Survey — the project manager picks it up
  ('survey', 'Create the Navusoft account', 'Crear la cuenta de Navusoft',
     'navusoft_account', 2, 10),
  ('survey', 'Read the sold scope and the estimate', 'Leer el alcance vendido y el estimado',
     null, 2, 20),
  ('survey', 'Set the site survey with the customer', 'Agendar el levantamiento con el cliente',
     null, 3, 30),
  ('survey', 'Walk the site and confirm the measure', 'Recorrer el sitio y confirmar la medida',
     null, null, 40),
  ('survey', 'Revise the quote if the site says otherwise', 'Revisar la cotización si el sitio lo exige',
     null, null, 50),

  -- Schedule
  ('schedule', 'Agree the build dates with the customer', 'Acordar las fechas con el cliente',
     null, null, 60),
  ('schedule', 'Assign the crew', 'Asignar la cuadrilla', null, null, 70),
  ('schedule', 'Order the materials against the takeoff', 'Pedir el material según la medida',
     null, null, 80),

  -- Scope of work
  ('sow', 'Draft the scope of work', 'Redactar el alcance de trabajo', null, null, 90),
  ('sow', 'Check the Spanish against the glossary', 'Revisar el español contra el glosario',
     null, null, 100),
  ('sow', 'Get it signed by somebody who reads both', 'Firmarlo alguien que lea ambos idiomas',
     null, null, 110),
  ('sow', 'Send the crew their link', 'Enviar el enlace a la cuadrilla', null, null, 120),

  -- The crew's own ticket
  ('ticket', 'Pull the materials and the special tools', 'Surtir material y herramienta especial',
     null, null, 130),
  ('ticket', 'Build the line', 'Construir la línea', null, null, 140),
  ('ticket', 'Photograph the finished work', 'Fotografiar el trabajo terminado', null, null, 150),
  ('ticket', 'Sign the ticket off', 'Firmar el ticket', null, null, 160),

  -- Close-out, back with the project manager
  ('closeout', 'Walk it and photograph it', 'Recorrerlo y fotografiarlo', null, null, 170),
  ('closeout', 'QA inspect against the scope', 'Inspeccionar contra el alcance', null, null, 180),
  ('closeout', 'Confirm the customer is satisfied', 'Confirmar la satisfacción del cliente',
     null, null, 190),
  ('closeout', 'Release it to billing', 'Liberarlo a facturación', null, null, 200),

  -- Billing
  ('billing', 'Key the job into Navusoft', 'Capturar el trabajo en Navusoft', null, null, 210),
  ('billing', 'Attach the photographs to the account', 'Adjuntar las fotos a la cuenta',
     null, null, 220)
) as v(section, en, es, needs, due_days, sort)
on conflict (account_id, section, en) do nothing;
