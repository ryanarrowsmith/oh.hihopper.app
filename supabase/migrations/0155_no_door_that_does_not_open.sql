-- 0155 — the letter stops offering a door accounting cannot open
--
-- Ryan, 14 Sep, on being asked: cut it.
--
-- Every billing letter ended on a filled blue "Open the whole job" button
-- pointing at /fence/<id>/record. The only person who receives this letter is
-- whoever keys it, and they have no Hopper account — so the button opened a
-- sign-in page, every time, for everybody.
--
-- That was a defensible trade while the job lived in the app and the letter was
-- only a keying sheet: worth a wasted tap on the days somebody internal was
-- copied. It stopped being defensible the moment 0153 put the whole job IN the
-- letter. A button that opens nothing is worse than no button, because it
-- teaches the reader that what they are holding is a summary of the real thing
-- somewhere else — which is exactly the opposite of what this document is.
--
-- What replaces it is the sentence the renderer already shows any letter with
-- no link, said properly: who sent it, and that replying reaches them. The
-- renderer takes it from `reply_note`, because only the app knows whose name
-- goes in it.
--
-- Everything else in the function is 0154 unchanged.

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
  v_sold    record;
  v_pm      text;
  v_done    date;
  v_recent  int;
  v_total   numeric;
  v_recur   boolean;
  v_lines   int;
  v_rows    jsonb;
  v_facts   jsonb;
  v_log     jsonb;
  v_changes jsonb;
  v_pages   jsonb;
  v_notes   int;
  v_shots   int;
  v_pgs     int;
  v_built   numeric;
  v_plan    numeric;
  v_short   numeric;
  v_extra   jsonb := '{}'::jsonb;
  v_base    text := internal.hopper_app_url();
  v_id      bigint;
  v_money   text := 'FM999,999,990.00';
begin
  if v_user is null then raise exception 'not signed in'; end if;

  select j.id, j.account_id, j.ref, j.name, j.customer, j.site_address,
         j.location_id, j.shot_token
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
                else regexp_replace(to_char(cl.qty, 'FM999,999,990.99'), '\.$', '')
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

  /* WHO SOLD IT. The quote link that was actually signed, and the person who
     issued it — the same lookup the customer's own document makes for the name
     at the bottom of it. A link that was signed wins over one that was only
     sent, and the most recent of those wins over an earlier one, because a firm
     price signed in September is the sale. */
  select p.full_name, p.role_title into v_sold
    from hopper.fence_quote_link ql
    join hopper.person p on p.id = ql.issued_by
   where ql.account_id = v_acct and ql.job_id = p_job
     and not coalesce(ql.revoked, false)
   order by (ql.signed_at is null), ql.signed_at desc nulls last,
            ql.issued_at desc nulls last
   limit 1;

  v_facts := jsonb_build_array(
    -- First, and first deliberately: this is the line that credits the sale.
    jsonb_build_object('label', 'Sold by', 'value',
      case when v_sold.full_name is null then null
           else v_sold.full_name
                || coalesce(' · ' || v_sold.role_title, '') end),
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

  /* ---- THE PROJECT LOG -------------------------------------------------
     Every note on the job in the order it happened, whichever section it was
     left on, with its photographs at letter width.

     THE ENGLISH TWIN, NOT A TRANSLATION MADE HERE. A crew writes Spanish on the
     ticket and it stays Spanish on the ticket; body_en was written once when the
     note was saved. coalesce is the whole rule, and the entry says plainly that
     the original was Spanish so the record is honest about what was typed
     without making accounting read past it. */
  select count(*), count(*) filter (where n.file_mime like 'image/%')
    into v_notes, v_shots
    from hopper.fence_note n
   where n.account_id = v_acct and n.job_id = p_job;

  if coalesce(v_notes, 0) > 0 then
    select jsonb_agg(s.e order by s.hap) into v_log from (
      select n.created_at as hap,
             jsonb_build_object(
               'date', to_char(n.created_at::date, 'FMDD Mon'),
               'who',  coalesce(n.by_crew, p.full_name, 'Somebody'),
               'tag',  case n.section::text
                         when 'intake'   then 'Intake'
                         when 'estimate' then 'Estimate'
                         when 'survey'   then 'Site survey'
                         when 'schedule' then 'Schedule'
                         when 'sow'      then 'Scope of work'
                         when 'ticket'   then 'Crew ticket'
                         when 'closeout' then 'Close-out'
                         when 'billing'  then 'Billing'
                         else null end,
               'crew', n.by_crew is not null,
               'body', case when n.body = n.file_name then null
                            else coalesce(n.body_en, n.body) end,
               'from', case when n.lang = 'es'
                            then 'Written in Spanish on the crew ticket' end,
               'shots', case when n.file_mime like 'image/%' then jsonb_build_array(
                          jsonb_build_object(
                            'src', v_base || '/shot/' || v_job.shot_token::text
                                   || '/' || n.id::text,
                            'caption', coalesce(n.file_name, 'Photograph')
                              || ' — ' || to_char(n.created_at::date, 'FMDD Mon')
                              || ', ' || coalesce(n.by_crew, p.full_name, 'Somebody')))
                        end
             ) as e
        from hopper.fence_note n
        left join hopper.person p on p.id = n.author_id
       where n.account_id = v_acct and n.job_id = p_job
       order by n.created_at
       limit 150
    ) s;

    v_extra := v_extra || jsonb_build_object('log', jsonb_build_object(
      'title', 'The project log',
      'note', v_notes::text || ' entr' || case when v_notes = 1 then 'y' else 'ies' end
              || case when coalesce(v_shots, 0) > 0
                      then ' · ' || v_shots::text || ' photograph'
                           || case when v_shots = 1 then '' else 's' end
                      else '' end,
      'foot', case when coalesce(v_shots, 0) > 0
                   then 'The full-resolution original of every photograph above is held '
                        || 'against ' || v_job.ref || ' and does not expire.' end,
      'entries', v_log));
  end if;

  /* ---- WHAT CHANGED, AND WHO AGREED TO IT ------------------------------
     Two sources, one column of dates: a signature is somebody agreeing to a
     figure, and a close-out is the figure the job actually landed on.

     SHORT OF WHAT, EXACTLY. The close-out screen measures built against WALKED
     where somebody walked it and against DRAWN only where nobody did — that is
     what it calls sold, and it is the figure the project manager was asked to
     justify before the job could close. Measuring against plan_ft here instead
     would print a different number in the letter than the one on the screen he
     approved, on the one line most likely to be argued with. */
  select coalesce(sum(cr.built_ft), 0) into v_built
    from hopper.fence_closeout_run cr
   where cr.account_id = v_acct and cr.job_id = p_job;
  select coalesce(sum(coalesce(sr.walked_ft, r.plan_ft)), 0) into v_plan
    from hopper.fence_run r
    left join hopper.fence_survey_run sr
      on sr.run_id = r.id and sr.account_id = v_acct
   where r.account_id = v_acct and r.job_id = p_job;

  v_short := case when v_plan > 0 and v_built > 0 then round(v_plan - v_built) end;

  select jsonb_agg(s.c order by s.hap) into v_changes from (
    select sg.signed_at as hap,
           jsonb_build_object(
             'date', to_char(sg.signed_at::date, 'FMDD Mon'),
             'title', case when ql.revision_id is not null
                           then 'Firm price signed at' else 'Estimate signed at' end,
             'amount', '$' || to_char(coalesce(sg.price, 0), v_money),
             'body', nullif(concat_ws(' ',
               nullif(concat_ws(', ', sg.signed_name, sg.signed_title), '') || '.',
               nullif(coalesce(rv.note, rv.reason), '')), '')
           ) as c
      from hopper.fence_signature sg
      left join hopper.fence_quote_link ql on ql.id = sg.link_id
      left join hopper.fence_revision rv on rv.id = ql.revision_id
     where sg.account_id = v_acct and sg.job_id = p_job

    union all

    select coalesce(co.walked_on::timestamptz, co.closed_at) as hap,
           jsonb_build_object(
             'date', to_char(coalesce(co.walked_on, co.closed_at::date), 'FMDD Mon'),
             'title', 'Built',
             'amount', to_char(v_built, 'FM999,999,990') || ' ft',
             'tail', nullif(coalesce(case when coalesce(v_short, 0) > 0
                          then ' — ' || to_char(v_short, 'FM999,999,990') || ' ft short' end, '')
                     || case when coalesce(co.price_held, false)
                             then case when coalesce(v_short, 0) > 0 then ', ' else ' — ' end
                                  || 'price held' else '' end, ''),
             'body', nullif(concat_ws(' ',
               case when co.walked_with is not null
                    then 'Walked with ' || co.walked_with || '.' end,
               nullif(co.they_said, ''), nullif(co.note, '')), '')
           ) as c
      from hopper.fence_closeout co
     -- A close-out row exists as soon as somebody types who they walked it
     -- with, which can be days before any run has a built figure on it. "Built
     -- 0 ft" in a document accounting files is worse than no line at all.
     where co.account_id = v_acct and co.job_id = p_job and v_built > 0
  ) s;

  if v_changes is not null and jsonb_array_length(v_changes) > 0 then
    v_extra := v_extra || jsonb_build_object('changes', jsonb_build_object(
      'title', 'What changed, and who agreed to it',
      'items', v_changes));
  end if;

  /* ---- THE SIGNED DOCUMENTS, AS PAGES ----------------------------------
     Read, never rebuilt. Numbered here rather than at signing, because "page 1
     of 1" frozen the day the estimate was signed is a lie the day the firm
     price joins it. */
  select count(*) into v_pgs
    from hopper.fence_signature sg
   where sg.account_id = v_acct and sg.job_id = p_job and sg.page is not null;

  if coalesce(v_pgs, 0) > 0 then
    select jsonb_agg(s.x order by s.hap) into v_pages from (
      select sg.signed_at as hap,
             sg.page || jsonb_build_object('label',
               'Page ' || (row_number() over (order by sg.signed_at))::text
               || ' of ' || v_pgs::text
               || ' · ' || coalesce(sg.page->>'label', 'the signed document')) as x
        from hopper.fence_signature sg
       where sg.account_id = v_acct and sg.job_id = p_job and sg.page is not null
    ) s;

    v_extra := v_extra || jsonb_build_object('pages', jsonb_build_object(
      'title', 'Signed documents',
      'note', v_pgs::text || ' page' || case when v_pgs = 1 then '' else 's' end,
      'items', v_pages));
  end if;

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
            /* NO URL, AND THEREFORE NO BUTTON. The letter used to end on
               "Open the whole job", which for the only person who receives it
               is a sign-in page they cannot pass. That was defensible while the
               job was in the app and not in the letter. It is not defensible
               now that the whole job is in the letter, and a button that opens
               nothing is worse than no button: it teaches the reader that the
               document is a summary of something else. */
            'reply_note', 'Sent by ' || coalesce(v_sender.full_name, 'Hopper')
                          || ' from Hopper. Reply to this message and it reaches '
                          || case when v_sender.full_name is null then 'us' else 'them' end
                          || ' — there is no account to sign in to and none is needed.',
            -- A keying sheet with a job under it is a document, not a note.
            -- The shell's own default is unchanged for every other letter.
            'width', 680,
            'facts', v_facts,
            'table', jsonb_build_object(
              'head', jsonb_build_array('Code', 'Description', 'Qty', 'Amount'),
              'align', jsonb_build_array('left', 'left', 'right', 'right'),
              'rows', v_rows,
              'total_label', 'Total',
              'total', '$' || to_char(v_total, v_money)),
            'body', nullif(trim(coalesce(p_note, '')), ''),
            'author', v_sender.full_name,
            'reply_to', v_sender.email)
          || v_extra,
          'pending', 0)
  returning id into v_id;

  return v_id;
end $fn$;

comment on function internal.hopper_fence_handoff_mail(uuid, text) is
  'Queues the keying sheet, and the whole job under it, to the account''s billing target. Reads the sheet, the address, the log, the changes and the signed pages itself; the caller supplies only the job and a note.';
