-- Run once in Supabase SQL Editor. No court data or credentials are seeded.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), created_at timestamptz not null default now()
);
create table public.workspace_members (
 workspace_id uuid references public.workspaces on delete cascade, user_id uuid references auth.users on delete cascade,
 role text not null default 'member' check(role in ('owner','member')), primary key(workspace_id,user_id)
);
create table public.capture_connections (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces,
 user_id uuid not null references auth.users, label text not null, token_hash text unique not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 days', revoked_at timestamptz
);
create table public.court_cases (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces,
 cnr text not null check(cnr ~ '^[A-Z]{4}[0-9]{12}$'), data jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 last_checked_at timestamptz not null, latest_capture_at timestamptz not null,
 unique(workspace_id,cnr)
);
create table public.case_captures (
 id uuid primary key, case_id uuid not null references public.court_cases, workspace_id uuid not null references public.workspaces,
 connection_id uuid not null references public.capture_connections, captured_by uuid not null references auth.users,
 captured_at timestamptz not null, received_at timestamptz not null default now(), source_url text not null,
 snapshot jsonb not null, parser_version text not null, outcome text not null check(outcome in ('created','updated','unchanged','stale')),
 unique(connection_id,id)
);
create table public.case_audit (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces,
 case_id uuid not null references public.court_cases, capture_id uuid not null references public.case_captures,
 actor_id uuid not null references auth.users, occurred_at timestamptz not null default now(),
 action text not null check(action in ('created','updated')), changes jsonb not null
);
create index court_cases_workspace on public.court_cases(workspace_id,last_checked_at desc);
create index case_audit_case on public.case_audit(case_id,occurred_at desc);
create index case_captures_case on public.case_captures(case_id,received_at desc);

create function public.is_workspace_member(p_workspace uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from workspace_members where workspace_id=p_workspace and user_id=auth.uid())
$$;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.capture_connections enable row level security;
alter table public.court_cases enable row level security;
alter table public.case_captures enable row level security;
alter table public.case_audit enable row level security;
create policy member_read on public.workspaces for select to authenticated using(public.is_workspace_member(id));
create policy member_read on public.workspace_members for select to authenticated using(public.is_workspace_member(workspace_id));
create policy member_read on public.court_cases for select to authenticated using(public.is_workspace_member(workspace_id));
create policy member_read on public.case_captures for select to authenticated using(public.is_workspace_member(workspace_id));
create policy member_read on public.case_audit for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.workspaces,public.workspace_members,public.capture_connections,public.court_cases,public.case_captures,public.case_audit from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.court_cases,public.case_captures,public.case_audit to authenticated;

create function public.create_workspace(p_name text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(trim(p_name)) not between 1 and 120 then raise exception 'Enter a workspace name (1–120 characters)'; end if;
 insert into workspaces(name) values(trim(p_name)) returning id into w;
 insert into workspace_members values(w,auth.uid(),'owner'); return w;
end $$;

create function public.create_capture_connection(p_workspace uuid,p_label text) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare secret text; c capture_connections;
begin
 if not public.is_workspace_member(p_workspace) then raise exception 'Workspace access denied'; end if;
 if length(trim(p_label)) not between 1 and 80 then raise exception 'Connection label required (1–80 characters)'; end if;
 secret := encode(extensions.gen_random_bytes(32),'hex');
 insert into capture_connections(workspace_id,user_id,label,token_hash)
 values(p_workspace,auth.uid(),trim(p_label),encode(extensions.digest(secret,'sha256'),'hex')) returning * into c;
 return jsonb_build_object('id',c.id,'token',secret,'expires_at',c.expires_at);
end $$;
create function public.list_capture_connections(p_workspace uuid) returns table(id uuid,label text,created_at timestamptz,expires_at timestamptz,revoked_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select c.id,c.label,c.created_at,c.expires_at,c.revoked_at from capture_connections c
 where c.workspace_id=p_workspace and c.user_id=auth.uid() and public.is_workspace_member(p_workspace) order by c.created_at desc
$$;
create function public.revoke_capture_connection(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update capture_connections set revoked_at=now() where id=p_id and user_id=auth.uid() and public.is_workspace_member(workspace_id);
end $$;

create function public.check_capture_connection(p_token text) returns jsonb
language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb;
begin
 select jsonb_build_object('id',c.id,'workspace',w.name,'expires_at',c.expires_at) into result
 from capture_connections c join workspaces w on w.id=c.workspace_id
 join workspace_members m on m.workspace_id=c.workspace_id and m.user_id=c.user_id
 where c.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and c.revoked_at is null and c.expires_at>now();
 if result is null then raise exception 'Connection invalid or expired'; end if;
 return result;
end $$;
create function public.revoke_my_capture_connections() returns void language sql security definer set search_path=public,pg_temp as $$
 update capture_connections set revoked_at=now() where user_id=auth.uid() and revoked_at is null
$$;
revoke all on function public.check_capture_connection(text),public.revoke_my_capture_connections() from public;
grant execute on function public.check_capture_connection(text) to anon,authenticated;
grant execute on function public.revoke_my_capture_connections() to authenticated;

-- One transaction: lock case identity, record capture, update current record, append audit.
-- Token authorizes uploads only. It cannot read case records or choose a workspace/user.
create function public.ingest_case_capture(p_token text,p_capture jsonb) returns jsonb
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
 if p_capture->>'parser_version' is distinct from '1.0.0' then raise exception 'Unsupported parser version'; end if;
 if jsonb_typeof(p_capture->'data') is distinct from 'object' then raise exception 'Case data required'; end if;
 foreach field in array array['case_type','filing_number','filing_date','registration_number','registration_date','first_hearing_date','next_hearing_date','case_stage','court','court_number_judge','case_status','disposal_date','nature_of_disposal','petitioners','respondents','acts','processes','history','orders'] loop
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
 values(capture_key,case_key,c.workspace_id,c.id,c.user_id,observed,p_capture->>'source_url',clean,'1.0.0',outcome_value);
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

revoke all on function public.create_workspace(text),public.create_capture_connection(uuid,text),public.list_capture_connections(uuid),public.revoke_capture_connection(uuid),public.ingest_case_capture(text,jsonb) from public;
grant execute on function public.create_workspace(text),public.create_capture_connection(uuid,text),public.list_capture_connections(uuid),public.revoke_capture_connection(uuid) to authenticated;
grant execute on function public.ingest_case_capture(text,jsonb) to anon,authenticated;
commit;
