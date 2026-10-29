-- Run after 202610280001_case_capture_audit.sql (and the normal listing setup).
-- Decision Date is a separate source field, never inferred from Disposal Date.
-- Detail parser 1.1.0 requires this migration; legacy 1.0.0 stays supported.
-- Applying this migration again does not rewrite existing cases or audit history.
begin;

create or replace function public.ingest_case_capture(p_token text,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare c capture_connections; old court_cases; capture_key uuid; observed timestamptz; cnr_value text;
 clean jsonb := '{}'; next_data jsonb; delta jsonb := '{}'; field text; value jsonb; outcome_value text; case_key uuid; previous case_captures;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Connection invalid or expired'; end if;
 select * into c from capture_connections where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now() for share;
 if c.id is null or not exists(select 1 from workspace_members where workspace_id=c.workspace_id and user_id=c.user_id) then raise exception 'Connection invalid or expired'; end if;
 if p_capture is null or jsonb_typeof(p_capture)<>'object' or octet_length(p_capture::text)>250000 then raise exception 'Invalid capture size'; end if;
 capture_key := (p_capture->>'id')::uuid;
 observed := (p_capture->>'captured_at')::timestamptz;
 cnr_value := upper(p_capture->>'cnr');
 if capture_key is null or observed is null or observed>now()+interval '5 minutes' or observed<now()-interval '7 days' or cnr_value is null or cnr_value !~ '^[A-Z]{4}[0-9]{12}$' then raise exception 'Invalid case identity or capture time'; end if;
 -- Never persist source session tokens, fragments, CAPTCHA, or page HTML/scripts.
 if p_capture->>'source_url' is distinct from 'https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index' then raise exception 'Unsupported source'; end if;
 if p_capture->>'parser_version' is null or p_capture->>'parser_version' not in ('1.0.0','1.1.0') then raise exception 'Unsupported parser version'; end if;
 if jsonb_typeof(p_capture->'data') is distinct from 'object' then raise exception 'Case data required'; end if;
 foreach field in array array['case_type','filing_number','filing_date','registration_number','registration_date','first_hearing_date','next_hearing_date','case_stage','court','court_number_judge','case_status','decision_date','disposal_date','nature_of_disposal','petitioners','respondents','acts','processes','history','orders'] loop
  value := p_capture->'data'->field;
  if field in ('petitioners','respondents','acts','processes','history','orders') then
   if value is not null and jsonb_typeof(value)<>'array' then raise exception 'Invalid array field %',field; end if;
   if jsonb_typeof(value)='array' and jsonb_array_length(value)>0 then clean := clean || jsonb_build_object(field,value); end if;
  else
   if value is not null and jsonb_typeof(value) not in ('string','null') then raise exception 'Invalid text field %',field; end if;
   if jsonb_typeof(value)='string' and length(trim(value #>> '{}'))>0 and value #>> '{}' <> '-' then
    if length(value #>> '{}')>2000 then raise exception 'Field too long'; end if;
    clean := clean || jsonb_build_object(field,trim(value #>> '{}'));
   end if;
  end if;
 end loop;
 if not clean ? 'registration_number' or not clean ? 'court' or (not clean ? 'case_stage' and not clean ? 'case_status') then raise exception 'Incomplete case detail page'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.workspace_id::text || cnr_value,0));
 select * into previous from case_captures where id=capture_key;
 if previous.id is not null then
  if previous.connection_id<>c.id then raise exception 'Capture identity conflict'; end if;
  return jsonb_build_object('status',previous.outcome,'case_id',previous.case_id,'duplicate',true);
 end if;
 select * into old from court_cases where workspace_id=c.workspace_id and cnr=cnr_value for update;
 if old.id is null then
  next_data:=clean; outcome_value:='created';
  insert into court_cases(workspace_id,cnr,data,last_checked_at,latest_capture_at) values(c.workspace_id,cnr_value,clean,now(),observed) returning id into case_key;
 else
  case_key:=old.id;
  if observed<old.latest_capture_at then outcome_value:='stale'; next_data:=old.data;
  else
   next_data:=old.data || clean;
   -- A disposed capture must not retain the previous pending hearing date.
   if clean->>'case_status'='Disposed' and not clean ? 'next_hearing_date' then next_data:=next_data-'next_hearing_date'; end if;
   outcome_value:=case when next_data=old.data then 'unchanged' else 'updated' end;
   update court_cases set data=next_data,last_checked_at=now(),latest_capture_at=observed,
    updated_at=case when outcome_value='updated' then now() else updated_at end where id=case_key;
  end if;
 end if;
 insert into case_captures(id,case_id,workspace_id,connection_id,captured_by,captured_at,source_url,snapshot,parser_version,outcome)
 values(capture_key,case_key,c.workspace_id,c.id,c.user_id,observed,p_capture->>'source_url',clean,p_capture->>'parser_version',outcome_value);
 if outcome_value in ('created','updated') then
  for field in select jsonb_object_keys(coalesce(old.data,'{}') || next_data) loop
   if (old.data->field) is distinct from (next_data->field) then
    delta:=delta || jsonb_build_object(field,jsonb_build_object('old',old.data->field,'new',next_data->field));
   end if;
  end loop;
  insert into case_audit(workspace_id,case_id,capture_id,actor_id,action,changes) values(c.workspace_id,case_key,capture_key,c.user_id,outcome_value,delta);
 end if;
 return jsonb_build_object('status',outcome_value,'case_id',case_key);
end $$;

revoke all on function public.ingest_case_capture(text,jsonb) from public;
grant execute on function public.ingest_case_capture(text,jsonb) to anon,authenticated;
commit;
