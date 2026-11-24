-- Read-only check of the "Loan recovery performance" panel against the database.
-- Run in Supabase SQL Editor. Replace the workspace name below.
-- Mirrors src/lib/analytics.js recoveryAnalytics(): dedicated column first,
-- JSON fallback second; cases without a valid DB amount are excluded.
with ws as (
  select id from public.workspaces where name = 'YOUR WORKSPACE NAME'
),
base as (
  select
    c.id,
    -- to_jsonb(c) works whether or not the 0006 amount columns exist yet.
    coalesce(to_jsonb(c)->>'db_amount', c.data->>'db_amount') as db_raw,
    coalesce(to_jsonb(c)->>'pos_recovered', c.data->>'pos_recovered') as rec_raw,
    lower(trim(coalesce(c.data->>'case_status', ''))) as status_raw,
    upper(trim(coalesce(
      nullif(trim(c.data->>'business_type'), ''),
      nullif(split_part(trim(c.data->>'case_type'), ' - ', 1), ''),
      substring(c.data->>'case_reference' from '^(.+?)/\d+/\d{4}$'),
      'Type not recorded'))) as business_type,
    lower(regexp_replace(
      coalesce(c.data->>'lender', '') || coalesce(c.data->>'parties_text', '')
      || coalesce((c.data->'petitioners')::text, '') || coalesce((c.data->'respondents')::text, ''),
      '[^a-zA-Z0-9]', '', 'g')) as parties,
    row_number() over (order by c.last_checked_at desc) as load_rank
  from public.court_cases c join ws on c.workspace_id = ws.id
),
amounts as (
  select *,
    case when db_raw ~ '^[0-9]+(\.[0-9]+)?$' then db_raw::numeric end as db,
    case when rec_raw ~ '^[0-9]+(\.[0-9]+)?$' then rec_raw::numeric else 0 end as rec,
    case status_raw when 'pending' then 'Pending' when 'disposed' then 'Disposed' else 'Status unknown' end as status,
    case
      when parties like '%trillianloans%' then 'Trillianloans'
      when parties like '%niyogin%' then 'Niyogin'
      when parties like '%idfc%' then 'IDFC'
      when parties like '%gromor%' then 'Gromor'
      else 'Not recorded' end as lender
  from base
),
scoped as (select * from amounts where db is not null)
select 'TOTAL (all cases in DB)' as grp, '' as label, count(*) as cases,
       sum(db) as loan, sum(rec) as recovered, greatest(sum(db) - sum(rec), 0) as outstanding,
       round(100 * sum(rec) / nullif(sum(db), 0), 1) as pct
from scoped
union all
select 'TOTAL (first 1000 the app loads)', '', count(*), sum(db), sum(rec),
       greatest(sum(db) - sum(rec), 0), round(100 * sum(rec) / nullif(sum(db), 0), 1)
from scoped where load_rank <= 1000
union all
select 'By lender', lender, count(*), sum(db), sum(rec), greatest(sum(db) - sum(rec), 0),
       round(100 * sum(rec) / nullif(sum(db), 0), 1) from scoped group by lender
union all
select 'By business type', business_type, count(*), sum(db), sum(rec), greatest(sum(db) - sum(rec), 0),
       round(100 * sum(rec) / nullif(sum(db), 0), 1) from scoped group by business_type
union all
select 'By case status', status, count(*), sum(db), sum(rec), greatest(sum(db) - sum(rec), 0),
       round(100 * sum(rec) / nullif(sum(db), 0), 1) from scoped group by status
union all
select 'Data quality', 'cases in workspace', (select count(*) from base), null, null, null, null
union all
select 'Data quality', 'recovered but no DB amount (excluded)',
       (select count(*) from amounts where db is null and rec > 0), null,
       (select sum(rec) from amounts where db is null), null, null
union all
select 'Data quality', 'recovered > DB amount',
       (select count(*) from scoped where rec > db), null, null, null, null
order by 1, 2;
