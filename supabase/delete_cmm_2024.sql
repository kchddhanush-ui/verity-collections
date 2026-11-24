-- One-off cleanup: delete everything stored for the eCourts party search
--   Karnataka / BENGALURU / CMM Court Complex, Bangalore /
--   CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU / Ninjacart / registration year 2024
-- in the Ninjacart workspace, so the search can be captured again cleanly.
--
-- Deletes (expected counts, checked 17 Nov 2026):
--   410 detailed cases (CNR year 2024 at this court) - 154 of them carry imported loan amounts
--   417 case snapshots, 410 case audit entries
--   410 search listings, 410 listing audit entries
--     8 saved searches for this court + year
-- Not touched: 2025/2026 cases at this court, City Civil Court cases, workspaces,
-- connections, loan import code. None of the foreign keys cascade, so rows are
-- removed children-first. If any count differs, the script raises an error and
-- the whole transaction rolls back - nothing is deleted.
--
-- Run once in Supabase SQL Editor.
begin;

create temp table target_cases on commit drop as
select c.id, c.cnr
from public.court_cases c
join public.workspaces w on w.id = c.workspace_id and w.name = 'Ninjacart'
where c.data->>'court' = 'CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU'
  and substring(c.cnr from 13 for 4) = '2024';

create temp table target_searches on commit drop as
select s.id
from public.court_search_captures s
join public.workspaces w on w.id = s.workspace_id and w.name = 'Ninjacart'
where s.search_context->>'establishment' = 'CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU'
  and s.search_context->>'registration_year' = '2024';

do $$
declare
  n_cases int := (select count(*) from target_cases);
  n_searches int := (select count(*) from target_searches);
  n_foreign int := (
    select count(*) from public.case_listings l
    where l.search_capture_id in (select id from target_searches)
      and l.cnr not in (select cnr from target_cases)
  );
begin
  if n_cases <> 410 or n_searches <> 8 or n_foreign <> 0 then
    raise exception 'Safety check failed (cases=%, searches=%, other listings on these searches=%). Nothing was deleted.',
      n_cases, n_searches, n_foreign;
  end if;
end $$;

delete from public.case_audit    where case_id in (select id from target_cases);
delete from public.case_captures where case_id in (select id from target_cases);
delete from public.listing_audit
where cnr in (select cnr from target_cases) or search_capture_id in (select id from target_searches);
delete from public.case_listings
where cnr in (select cnr from target_cases) or search_capture_id in (select id from target_searches);
delete from public.court_search_captures where id in (select id from target_searches);
delete from public.court_cases where id in (select id from target_cases);

-- All four must be 0.
select
  (select count(*) from public.court_cases
    where data->>'court' = 'CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU' and substring(cnr from 13 for 4) = '2024') as cases_left,
  (select count(*) from public.case_listings
    where data->>'court' = 'CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU' and substring(cnr from 13 for 4) = '2024') as listings_left,
  (select count(*) from public.court_search_captures
    where search_context->>'establishment' = 'CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU'
      and search_context->>'registration_year' = '2024') as searches_left,
  (select count(*) from public.case_captures where case_id in (select id from target_cases)) as snapshots_left;

commit;
