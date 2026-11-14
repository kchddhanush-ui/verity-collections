-- Run after the existing capture migrations. Safe to run again.
-- A connection can check detail coverage for at most 2,000 supplied CNRs in
-- its own workspace. It cannot read case content, audits or other workspaces.
begin;

create or replace function public.get_case_capture_coverage(p_token text,p_cnrs jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare c capture_connections; result jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Connection invalid or expired'; end if;
 select * into c from capture_connections
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now();
 if c.id is null or not exists(select 1 from workspace_members where workspace_id=c.workspace_id and user_id=c.user_id) then raise exception 'Connection invalid or expired'; end if;
 if p_cnrs is null or jsonb_typeof(p_cnrs)<>'array' or octet_length(p_cnrs::text)>50000 then raise exception 'Invalid case list'; end if;
 if jsonb_array_length(p_cnrs)>2000 then raise exception 'Too many cases'; end if;
 if exists(select 1 from jsonb_array_elements(p_cnrs) e where jsonb_typeof(e)<>'string' or (e #>> '{}') !~ '^[A-Z]{4}[0-9]{12}$') then raise exception 'Invalid case identity'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('cnr',requested.cnr,'has_details',exists(
  select 1 from court_cases d where d.workspace_id=c.workspace_id and d.cnr=requested.cnr
 )) order by requested.position),'[]'::jsonb) into result
 from (select value as cnr,min(ordinality) as position from jsonb_array_elements_text(p_cnrs) with ordinality group by value) requested;
 return result;
end $$;

revoke all on function public.get_case_capture_coverage(text,jsonb) from public;
grant execute on function public.get_case_capture_coverage(text,jsonb) to anon,authenticated;
commit;
