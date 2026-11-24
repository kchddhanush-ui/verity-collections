-- One-off cleanup: remove all imported loan amounts for the Ninjacart workspace
-- so the loan CSV can be re-imported from a clean state.
-- Clears DB Amount, POS recovered and POS as of Nov 16 from BOTH the dedicated
-- columns and the legacy JSON copy (analytics falls back to the JSON copy, so
-- clearing only the columns would leave the old figures on the dashboard).
-- Court data captured from eCourts is not touched.
-- Run once in Supabase SQL Editor. Expected: 298 cases cleared, 1 log row deleted.
begin;

with ws as (select id from public.workspaces where name = 'Ninjacart')
update public.court_cases c
set
  db_amount = null,
  pos_recovered = null,
  pos_as_of_nov_16 = null,
  data = c.data - 'db_amount' - 'pos_recovered' - 'pos_as_of_nov_16',
  updated_at = now()
from ws
where c.workspace_id = ws.id
  and (c.db_amount is not null or c.pos_recovered is not null or c.pos_as_of_nov_16 is not null
       or c.data ?| array['db_amount', 'pos_recovered', 'pos_as_of_nov_16']);

delete from public.loan_data_imports
where workspace_id = (select id from public.workspaces where name = 'Ninjacart');

-- Both counts must be 0 before this commits.
select
  count(*) filter (where db_amount is not null or pos_recovered is not null or pos_as_of_nov_16 is not null) as cases_still_with_columns,
  count(*) filter (where data ?| array['db_amount', 'pos_recovered', 'pos_as_of_nov_16']) as cases_still_with_json,
  (select count(*) from public.loan_data_imports) as import_log_rows
from public.court_cases;

commit;
