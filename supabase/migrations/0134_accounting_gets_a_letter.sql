-- 0134 — new codes for the classes that had none, and the letter itself
-- (the record of this migration, with its reasoning, is
--  supabase/migrations/0134_accounting_gets_a_letter.sql)

insert into hopper.fence_charge_code
  (account_id, target_id, code, description, recurring, cycle_days, sort, provisional, note)
select '1ade454c-54e8-45d9-beec-cc52a21f7ea2'::uuid, t.id, v.code, v.descr,
       false, null, v.sort, true, v.note
from (values
  ('INST-SEC',  'Secure fence install, anti-climb and anti-dig', 15,
     'Invented 14 Sep so a secure job could be billed at all — not yet matched to a template'),
  ('GATE-TF',   'Panel gate, temporary fence',                   45,
     'Bills on its own line rather than inside the rental cycle'),
  ('GATE-TURN', 'Full-height turnstile, supply and install',      62, null),
  ('GATE-M30',  'Crash-rated vehicle gate, supply and install',   64, null),
  ('GATE-SEC',  'Secure gate, supply and install',                66,
     'The fallback for a secure gate type that names no code of its own')
) as v(code, descr, sort, note)
left join hopper.fence_billing_target t
  on t.account_id = '1ade454c-54e8-45d9-beec-cc52a21f7ea2'::uuid and t.active
on conflict (account_id, code) do nothing;

insert into hopper.fence_charge_rule (account_id, cls, takes, charge_code, note)
values
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2', 'secure', 'fence', 'INST-SEC',
   'Everything the recipe priced except the gates, by the foot'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2', 'secure', 'gate', 'GATE-SEC',
   'Only for a secure gate type that names no code of its own'),
  ('1ade454c-54e8-45d9-beec-cc52a21f7ea2', 'temporary', 'gate', 'GATE-TF',
   'Ryan, 14 Sep: a panel gate bills on its own line after all')
on conflict (account_id, cls, takes) do nothing;

update hopper.fence_gate_type set charge_code = 'GATE-TF'
 where code = 'G-TF-PNL' and charge_code is null;
update hopper.fence_gate_type set charge_code = 'GATE-TURN'
 where code = 'G-SEC-TURN' and charge_code is null;
update hopper.fence_gate_type set charge_code = 'GATE-M30'
 where code = 'G-SEC-M30' and charge_code is null;

create or replace function internal.hopper_fence_handoff_mail(
  p_job uuid, p_note text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_user    uuid := auth.uid();
  v_acct    uuid;
  v_job     record;
  v_place   record;
  v_target  record;
  v_sender  record;
  v_pm      text;
  v_done    date;
  v_recent  int;
  v_total   numeric;
  v_recur   boolean;
  v_lines   int;
  v_rows    jsonb;
  v_facts   jsonb;
  v_id      bigint;
  v_money   text := 'FM999,999,990.00';
begin
  if v_user is null then raise exception 'not signed in'; end if;

  select j.id, j.account_id, j.ref, j.name, j.customer, j.site_address, j.location_id
    into v_job
    from hopper.fence_job j where j.id = p_job;
  if not found then raise exception 'no such job'; end if;
  v_acct := v_job.account_id;

  if not internal.hopper_fence_edits(v_acct, p_job, 'billing') then
    raise exception 'the billing handoff belongs to billing';
  end if;

  select l.line1, l.line2, l.city, l.region, l.postcode, l.navusoft_account
    into v_place
    from hopper.fence_location l where l.id = v_job.location_id;

  select bt.id, bt.name, bt.to_email into v_target
    from hopper.fence_billing_target bt
   where bt.account_id = v_acct and bt.active
   order by bt.name limit 1;
  if v_target.to_email is null
     or v_target.to_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'there is no billing target with an address to send to';
  end if;

  select count(*), coalesce(sum(cl.amount), 0), bool_or(cl.recurring)
    into v_lines, v_total, v_recur
    from hopper.fence_charge_line cl
   where cl.account_id = v_acct and cl.job_id = p_job;
  if coalesce(v_lines, 0) = 0 then
    raise exception 'nothing is written down to send';
  end if;

  select jsonb_agg(jsonb_build_array(
           cl.code,
           cl.description,
           case when cl.qty is null then '—'
                else regexp_replace(to_char(cl.qty, 'FM999,999,990.99'), '\.00$', '')
                     || coalesce(' ' || cl.uom, '') end,
           case when cl.amount is null then '—'
                else '$' || to_char(cl.amount, v_money) end
         ) order by cl.sort, cl.code)
    into v_rows
    from hopper.fence_charge_line cl
   where cl.account_id = v_acct and cl.job_id = p_job;

  select p.full_name into v_pm
    from hopper.fence_task t
    join hopper.person p on p.id = t.done_by
   where t.account_id = v_acct and t.job_id = p_job and t.done
     and t.section in ('survey', 'schedule', 'sow')
   order by t.done_at nulls last limit 1;

  select max(t.done_at)::date into v_done
    from hopper.fence_task t
   where t.account_id = v_acct and t.job_id = p_job and t.done
     and t.section in ('ticket', 'closeout');

  select p.full_name, p.email into v_sender
    from hopper.person p
   where p.account_id = v_acct and p.profile_id = v_user;

  v_facts := jsonb_build_array(
    jsonb_build_object('label', 'Navusoft account', 'value', v_place.navusoft_account),
    jsonb_build_object('label', 'Service location', 'value',
      coalesce(nullif(concat_ws(', ',
        v_place.line1, v_place.line2,
        nullif(concat_ws(', ', v_place.city, v_place.region), ''),
        v_place.postcode), ''), v_job.site_address)),
    jsonb_build_object('label', 'Customer', 'value', v_job.customer),
    jsonb_build_object('label', 'Work completed', 'value',
      case when v_done is null then null else to_char(v_done, 'FMDD Mon YYYY') end),
    jsonb_build_object('label', 'Project manager', 'value', v_pm),
    jsonb_build_object('label', 'Billing type', 'value',
      case when v_recur then 'Recurring — bills again every cycle' else 'One time' end)
  );

  select count(*) into v_recent
    from beebee.mail_outbox m
   where m.kind = 'fence.handoff'
     and m.created_at > now() - interval '1 hour'
     and m.payload->>'by' = v_user::text;
  if v_recent >= 20 then
    raise exception 'that is twenty in an hour, which is enough';
  end if;

  insert into beebee.mail_outbox (kind, app_id, to_email, to_name, payload, status, attempts)
  values ('fence.handoff', 'hopper',
          lower(trim(v_target.to_email)), v_target.name,
          jsonb_build_object(
            'by', v_user::text,
            'job', v_job.ref || coalesce(' · ' || v_job.name, ''),
            'account_no', v_place.navusoft_account,
            'url', internal.hopper_app_url() || '/fence/' || p_job::text || '/record',
            'facts', v_facts,
            'table', jsonb_build_object(
              'head', jsonb_build_array('Code', 'Description', 'Qty', 'Amount'),
              'align', jsonb_build_array('left', 'left', 'right', 'right'),
              'rows', v_rows,
              'total_label', 'Total',
              'total', '$' || to_char(v_total, v_money)),
            'body', nullif(trim(coalesce(p_note, '')), ''),
            'author', v_sender.full_name,
            'reply_to', v_sender.email),
          'pending', 0)
  returning id into v_id;

  return v_id;
end $fn$;

comment on function internal.hopper_fence_handoff_mail(uuid, text) is
  'Queues the keying sheet to the account''s billing target. Reads the sheet and the address itself; the caller supplies only the job and a note.';

create or replace function hopper.fence_handoff_mail(job uuid, note text default null)
returns bigint
language sql
security invoker
as $$
  select internal.hopper_fence_handoff_mail(job, note);
$$;

comment on function hopper.fence_handoff_mail(uuid, text) is
  'Queue the keying sheet to accounting. Refuses unless the caller owns the billing section of that job.';
