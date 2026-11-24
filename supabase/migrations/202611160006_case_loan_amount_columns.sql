-- Store monetary recovery data as first-class case columns. The JSON values
-- written by the first loan-import release are retained for compatibility.
begin;

alter table public.court_cases
  add column if not exists db_amount numeric(16,2) check (db_amount >= 0),
  add column if not exists pos_recovered numeric(16,2) check (pos_recovered >= 0),
  add column if not exists pos_as_of_nov_16 numeric(16,2) check (pos_as_of_nov_16 >= 0);

-- Backfill safely from any imports performed before these columns existed.
-- Only plain non-negative numeric JSON values are copied; malformed legacy
-- values remain in JSON and are not silently converted.
update public.court_cases
set
  db_amount = case
    when data->>'db_amount' ~ '^[0-9]+(\.[0-9]+)?$' then (data->>'db_amount')::numeric
    else db_amount
  end,
  pos_recovered = case
    when data->>'pos_recovered' ~ '^[0-9]+(\.[0-9]+)?$' then (data->>'pos_recovered')::numeric
    else pos_recovered
  end,
  pos_as_of_nov_16 = case
    when data->>'pos_as_of_nov_16' ~ '^[0-9]+(\.[0-9]+)?$' then (data->>'pos_as_of_nov_16')::numeric
    else pos_as_of_nov_16
  end
where data ?| array['db_amount', 'pos_recovered', 'pos_as_of_nov_16'];

create index if not exists court_cases_workspace_db_amount
  on public.court_cases(workspace_id, db_amount)
  where db_amount is not null;

create or replace function public.import_loan_data(
  p_workspace uuid,
  p_filename text,
  p_rows jsonb,
  p_summary jsonb default '{}'
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  row_data jsonb;
  case_key uuid;
  db_value numeric;
  recovered_value numeric;
  pos_value numeric;
  updated_count integer := 0;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only workspace owners can import loan data';
  end if;
  if p_filename is null or length(trim(p_filename)) not between 1 and 255 then
    raise exception 'A CSV filename is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import must contain 1 to 5,000 matched rows';
  end if;

  for row_data in select value from jsonb_array_elements(p_rows) loop
    case_key := (row_data->>'case_id')::uuid;
    if coalesce(jsonb_typeof(row_data->'db_amount'), 'null') not in ('number', 'null')
      or coalesce(jsonb_typeof(row_data->'pos_recovered'), 'null') not in ('number', 'null')
      or coalesce(jsonb_typeof(row_data->'pos_as_of_nov_16'), 'null') not in ('number', 'null') then
      raise exception 'Invalid monetary value';
    end if;
    db_value := nullif(row_data->>'db_amount', '')::numeric;
    recovered_value := nullif(row_data->>'pos_recovered', '')::numeric;
    pos_value := nullif(row_data->>'pos_as_of_nov_16', '')::numeric;
    if coalesce(db_value, 0) < 0 or coalesce(recovered_value, 0) < 0 or coalesce(pos_value, 0) < 0 then
      raise exception 'Amounts cannot be negative';
    end if;

    update public.court_cases
    set
      db_amount = coalesce(db_value, court_cases.db_amount),
      pos_recovered = coalesce(recovered_value, court_cases.pos_recovered),
      pos_as_of_nov_16 = coalesce(pos_value, court_cases.pos_as_of_nov_16),
      updated_at = now()
    where id = case_key and workspace_id = p_workspace;
    if not found then
      raise exception 'A matched case is no longer available';
    end if;
    updated_count := updated_count + 1;
  end loop;

  insert into public.loan_data_imports(workspace_id, imported_by, filename, total_rows, updated_rows, summary)
  values (p_workspace, auth.uid(), trim(p_filename), jsonb_array_length(p_rows), updated_count, coalesce(p_summary, '{}'));

  return jsonb_build_object('updated', updated_count);
end $$;

revoke all on function public.import_loan_data(uuid, text, jsonb, jsonb) from public;
grant execute on function public.import_loan_data(uuid, text, jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
