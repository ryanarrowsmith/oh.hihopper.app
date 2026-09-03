-- Hopper against the Beebee contract. Run it after any schema change.
--
--   psql "$DATABASE_URL" -f supabase/checks/contract.sql
--
-- beebee.check_app('hopper') is the real thing and it is staff-only, so this
-- reproduces its rules from the catalogue instead. That is not a substitute
-- and does not pretend to be: it is the version anybody working on Hopper can
-- run, on the machine they are working on, without asking for rights they
-- should not have. When it disagrees with check_app, check_app is right.
--
-- One row per rule. `ok` false is a thing to fix before doing anything else.
-- Every rule cites the contract clause it comes from, because a failing check
-- that cannot tell you why it exists gets deleted by the next person.

\pset border 2
\echo ''
\echo '  Hopper / Beebee contract'
\echo ''

with
tables as (
  select c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'hopper' and c.relkind = 'r'
),
-- A table may opt out of tenancy by saying so in its comment, in those words.
-- Rule 5 gives that escape hatch and rule 1 has to honour it or the hatch is
-- decorative.
scoped as (
  select t.*, coalesce(obj_description(t.oid, 'pg_class'), '') as note
  from tables t
),
exempt as (select oid, relname from scoped where note ilike '%service-role only%'),

r1_tenancy as (
  select 'tenancy' as rule,
         'every table carries account_id (rule 1)' as asks,
         coalesce(string_agg(s.relname, ', ' order by s.relname), '') as offenders
  from scoped s
  where s.oid not in (select oid from exempt)
    and not exists (select 1 from pg_attribute a
                    where a.attrelid = s.oid and a.attname = 'account_id'
                      and a.attnum > 0 and not a.attisdropped)
),
r2_fk as (
  select 'tenancy_fk', 'account_id really references beebee.accounts (rule 1)',
         coalesce(string_agg(s.relname, ', ' order by s.relname), '')
  from scoped s
  where s.oid not in (select oid from exempt)
    and exists (select 1 from pg_attribute a where a.attrelid = s.oid and a.attname='account_id')
    and not exists (
      select 1 from pg_constraint c
      where c.conrelid = s.oid and c.contype = 'f'
        and c.confrelid = 'beebee.accounts'::regclass
        and (select a.attnum from pg_attribute a
             where a.attrelid = s.oid and a.attname = 'account_id') = any(c.conkey))
),
r3_index as (
  select 'tenancy_index', 'account_id leads an index (rule 1)',
         coalesce(string_agg(s.relname, ', ' order by s.relname), '')
  from scoped s
  where s.oid not in (select oid from exempt)
    and exists (select 1 from pg_attribute a where a.attrelid = s.oid and a.attname='account_id')
    and not exists (
      select 1 from pg_index i
      where i.indrelid = s.oid
        and (i.indkey::int2[])[0] = (select a.attnum from pg_attribute a
                                     where a.attrelid = s.oid and a.attname = 'account_id'))
),
-- Rule 2 names these as always the platform's, whatever schema they turn up in.
-- The list is a smell test and not the rule; the rule is the question about
-- signing in, paying, and what somebody may open, which no query can ask.
r4_owned as (
  select 'platform_ownership', 'no table the platform owns (rule 2)',
         coalesce(string_agg(relname, ', ' order by relname), '')
  from tables
  where relname in ('users','customers','tenants','subscriptions','invoices',
                    'plans','prices','payments','staff','app_access')
),
r5_history as (
  select 'audit_ownership', 'no private history or support table (rules 11, 12)',
         coalesce(string_agg(relname, ', ' order by relname), '')
  from tables
  where relname ~ '(_history|_log|_versions)$'
     or relname in ('audit_entry','audit_log','support_request','support_requests',
                    'feedback','contact_request')
),
r6_rls as (
  select 'rls_enabled', 'RLS on (rule 5)',
         coalesce(string_agg(t.relname, ', ' order by t.relname), '')
  from tables t join pg_class c on c.oid = t.oid
  where not c.relrowsecurity
),
-- RLS on with no policies denies everyone, which is correct for a
-- service-role-only table and a bug anywhere else. Rule 5 says the table must
-- say so in its comment, in those words, so that is what makes it pass.
r7_policies as (
  select 'rls_policies', 'RLS has policies, or the comment says service-role only (rule 5)',
         coalesce(string_agg(s.relname, ', ' order by s.relname), '')
  from scoped s
  where s.oid not in (select oid from exempt)
    and not exists (select 1 from pg_policy p where p.polrelid = s.oid)
),
-- Rule 6. hopper IS exposed to PostgREST, so a SECURITY DEFINER function with
-- arguments in it is an HTTP endpoint anyone may call with arguments of their
-- choosing. Zero-argument triggers are fine; helpers belong in internal.
r8_definers as (
  select 'definer_exposed', 'no SECURITY DEFINER with arguments in an exposed schema (rule 6)',
         coalesce(string_agg(p.proname, ', ' order by p.proname), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hopper' and p.prosecdef and p.pronargs > 0
),
r9_searchpath as (
  select 'definer_search_path', 'every SECURITY DEFINER sets search_path (rule 6)',
         coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('hopper','internal') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%')
),
r10_identity as (
  select 'identity_reference', 'nothing references auth.users (rule 7)',
         coalesce(string_agg(c.conrelid::regclass::text, ', '), '')
  from pg_constraint c join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'hopper' and c.contype = 'f'
    and c.confrelid::regclass::text like 'auth.%'
),
-- Rule 11. Not a warning here: an unwatched table is a hole in the ledger and
-- the ledger is the platform's whole answer to "what happened".
r11_coverage as (
  select 'audit_coverage', 'every table is watched by the ledger (rule 11)',
         coalesce(string_agg(t.relname, ', ' order by t.relname), '')
  from tables t
  where not exists (select 1 from beebee.audited_tables a
                    where a.schema_name = 'hopper' and a.table_name = t.relname)
    and coalesce(obj_description(t.oid,'pg_class'), '') not ilike '%not audited%'
),
-- Learned the hard way: cron_key was registered with its own secret as the key
-- column, so the ledger recorded it. A registered table whose key column holds
-- a secret, or which redacts nothing while holding one, is worth a look.
r12_secrets as (
  select 'audit_secrets', 'no secret column is a ledger key or unredacted (rule 11)',
         coalesce(string_agg(a.table_name || '.' || col, ', '), '')
  from beebee.audited_tables a
  cross join lateral (
    select att.attname as col from pg_attribute att
    where att.attrelid = ('hopper.' || a.table_name)::regclass
      and att.attnum > 0 and not att.attisdropped
      -- Tight on purpose. The first version matched anything ending _key and
      -- failed on entity_module.module_key, which holds the word 'reporting'.
      -- A check that cries wolf gets ignored, and an ignored check is worse
      -- than no check -- so this matches a column that IS a secret, not one
      -- whose name ends in a word secrets also use.
      and att.attname ~* '^(secret|token|nonce|password|passphrase|key)$|_(secret|token|password|passphrase)$|api_key$|secret_key$'
  ) s(col)
  where a.schema_name = 'hopper'
    and (a.key_column = col or not (col = any(a.redact)))
),
-- Rule 8's trap. Two policies each reading the other's table make Postgres
-- refuse the query outright, and reading the policies never shows it. This
-- cannot catch every cycle, but it catches the shape that has already bitten:
-- a policy naming another hopper table whose own policies name this one back.
r13_recursion as (
  select 'policy_recursion', 'no two policies read each other''s table (rule 8)',
         coalesce(string_agg(distinct a.tablename || ' <-> ' || b.tablename, ', '), '')
  from pg_policies a join pg_policies b
    on a.schemaname = 'hopper' and b.schemaname = 'hopper'
   and a.tablename <> b.tablename
   and coalesce(a.qual,'') || coalesce(a.with_check,'') like '%hopper.' || b.tablename || '%'
   and coalesce(b.qual,'') || coalesce(b.with_check,'') like '%hopper.' || a.tablename || '%'
)
select rule, case when offenders = '' then 'PASS' else 'FAIL' end as ok, asks,
       nullif(offenders, '') as offenders
from (
  select * from r1_tenancy union all select * from r2_fk union all select * from r3_index
  union all select * from r4_owned union all select * from r5_history
  union all select * from r6_rls union all select * from r7_policies
  union all select * from r8_definers union all select * from r9_searchpath
  union all select * from r10_identity union all select * from r11_coverage
  union all select * from r12_secrets union all select * from r13_recursion
) all_rules
order by (offenders <> '') desc, rule;

\echo ''
\echo '  Anything FAIL is a thing to fix before building on top of it.'
\echo '  beebee.check_app(''hopper'') is the real check; this is the one you can run.'
\echo ''
