-- One-off cleanup: delete case P.C.R. 3472/2024 (CNR KABC030129172024, respondent
-- BALAJI TRADERS, CHIEF METROPOLITAN MAGISTRATE COURT, BENGALURU) from the
-- Ninjacart workspace, with its 4 snapshots and 1 audit entry. It has no search
-- listing and no loan amount. Nothing else is touched.
-- If the case is not found exactly once, the script stops and deletes nothing.
-- Run once in Supabase SQL Editor.
begin;

create temp table target_case on commit drop as
select c.id, c.cnr
from public.court_cases c
join public.workspaces w on w.id = c.workspace_id and w.name = 'Ninjacart'
where c.cnr = 'KABC030129172024'
  and c.data->>'registration_number' = '3472/2024';

do $$
begin
  if (select count(*) from target_case) <> 1 then
    raise exception 'Expected exactly one case 3472/2024 (KABC030129172024); found %. Nothing was deleted.',
      (select count(*) from target_case);
  end if;
end $$;

delete from public.case_audit    where case_id in (select id from target_case);
delete from public.case_captures where case_id in (select id from target_case);
delete from public.listing_audit where cnr in (select cnr from target_case);
delete from public.case_listings where cnr in (select cnr from target_case);
delete from public.court_cases   where id  in (select id from target_case);

-- Must be 0.
select count(*) as cases_left from public.court_cases where cnr = 'KABC030129172024';

commit;
