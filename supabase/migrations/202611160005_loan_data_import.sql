-- Owner-only, atomic enrichment of existing court cases with loan data.
begin;

create table if not exists public.loan_data_imports (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces on delete cascade,
 imported_by uuid not null references auth.users,
 filename text not null check (length(filename) between 1 and 255),
 total_rows integer not null check (total_rows >= 0),
 updated_rows integer not null check (updated_rows >= 0),
 summary jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index if not exists loan_data_imports_workspace_created on public.loan_data_imports(workspace_id, created_at desc);
alter table public.loan_data_imports enable row level security;
create policy loan_imports_member_read on public.loan_data_imports for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.loan_data_imports from anon, authenticated;
grant select on public.loan_data_imports to authenticated;

create or replace function public.import_loan_data(p_workspace uuid, p_filename text, p_rows jsonb, p_summary jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare row_data jsonb; case_key uuid; old_data jsonb; db_value numeric; recovered_value numeric; pos_value numeric; updated_count integer := 0;
begin
 if not exists (select 1 from public.workspace_members where workspace_id=p_workspace and user_id=auth.uid() and role='owner') then
   raise exception 'Only workspace owners can import loan data';
 end if;
 if p_filename is null or length(trim(p_filename)) not between 1 and 255 then raise exception 'A CSV filename is required'; end if;
 if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 5000 then raise exception 'Import must contain 1 to 5,000 matched rows'; end if;
 for row_data in select value from jsonb_array_elements(p_rows) loop
   case_key := (row_data->>'case_id')::uuid;
   if jsonb_typeof(row_data->'db_amount') not in ('number','null') or jsonb_typeof(row_data->'pos_recovered') not in ('number','null') then raise exception 'Invalid monetary value'; end if;
   db_value := nullif(row_data->>'db_amount','')::numeric;
   recovered_value := nullif(row_data->>'pos_recovered','')::numeric;
   pos_value := nullif(row_data->>'pos_as_of_nov_16','')::numeric;
   if coalesce(db_value,0) < 0 or coalesce(recovered_value,0) < 0 or coalesce(pos_value,0) < 0 then raise exception 'Amounts cannot be negative'; end if;
   select data into old_data from public.court_cases where id=case_key and workspace_id=p_workspace for update;
   if old_data is null then raise exception 'A matched case is no longer available'; end if;
   update public.court_cases set data=old_data || jsonb_strip_nulls(jsonb_build_object('db_amount',db_value,'pos_recovered',recovered_value,'pos_as_of_nov_16',pos_value)), updated_at=now() where id=case_key;
   updated_count := updated_count + 1;
 end loop;
 insert into public.loan_data_imports(workspace_id,imported_by,filename,total_rows,updated_rows,summary)
 values(p_workspace,auth.uid(),trim(p_filename),jsonb_array_length(p_rows),updated_count,coalesce(p_summary,'{}'));
 return jsonb_build_object('updated',updated_count);
end $$;
revoke all on function public.import_loan_data(uuid,text,jsonb,jsonb) from public;
grant execute on function public.import_loan_data(uuid,text,jsonb,jsonb) to authenticated;
-- Make the new RPC immediately visible to the Supabase REST schema cache after
-- this migration commits, rather than requiring an application restart.
notify pgrst, 'reload schema';
commit;
