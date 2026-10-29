-- Run AFTER 202610280001_case_capture_audit.sql. Existing case data is unchanged.
begin;
create table public.court_search_captures (
 id uuid primary key, workspace_id uuid not null references public.workspaces,
 connection_id uuid not null references public.capture_connections, captured_by uuid not null references auth.users,
 captured_at timestamptz not null, received_at timestamptz not null default now(), source_url text not null,
 search_context jsonb not null, total_establishments integer, reported_cases integer,
 court_totals jsonb not null, loaded_rows integer not null, skipped_rows integer not null,
 snapshot jsonb not null, parser_version text not null
);
create table public.case_listings (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces,
 cnr text not null check(cnr ~ '^[A-Z]{4}[0-9]{12}$'), data jsonb not null,
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),
 observed_at timestamptz not null, search_capture_id uuid not null references public.court_search_captures,
 unique(workspace_id,cnr)
);
create table public.listing_audit (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces,
 cnr text not null, search_capture_id uuid not null references public.court_search_captures,
 actor_id uuid not null references auth.users,occurred_at timestamptz not null default now(),
 action text not null check(action in ('listed','updated')),changes jsonb not null
);
create index case_listings_workspace on public.case_listings(workspace_id,last_seen_at desc);
create index listing_audit_case on public.listing_audit(workspace_id,cnr,occurred_at desc);
create index court_searches_workspace on public.court_search_captures(workspace_id,captured_at desc);
alter table public.court_search_captures enable row level security;
alter table public.case_listings enable row level security;
alter table public.listing_audit enable row level security;
create policy member_read on public.court_search_captures for select to authenticated using(public.is_workspace_member(workspace_id));
create policy member_read on public.case_listings for select to authenticated using(public.is_workspace_member(workspace_id));
create policy member_read on public.listing_audit for select to authenticated using(public.is_workspace_member(workspace_id));
revoke all on public.court_search_captures,public.case_listings,public.listing_audit from anon,authenticated;
grant select on public.court_search_captures,public.case_listings,public.listing_audit to authenticated;

create function public.ingest_search_capture(p_token text,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare c capture_connections; capture_key uuid; observed timestamptz; previous court_search_captures;
 item jsonb; entry jsonb; clean_rows jsonb:='[]'; clean_context jsonb:='{}'; clean_courts jsonb:='[]';
 data_value jsonb; field text; val jsonb; cnr_value text; seen text[]:='{}'; total_value integer; establishments integer;
 loaded integer; skipped integer; old case_listings; changes jsonb; created integer:=0; updated integer:=0;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Connection invalid or expired'; end if;
 select * into c from capture_connections where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and expires_at>now() for share;
 if c.id is null or not exists(select 1 from workspace_members where workspace_id=c.workspace_id and user_id=c.user_id) then raise exception 'Connection invalid or expired'; end if;
 if p_capture is null or jsonb_typeof(p_capture)<>'object' or octet_length(p_capture::text)>1500000 then raise exception 'Search capture exceeds 1.5 MB'; end if;
 capture_key:=(p_capture->>'id')::uuid;observed:=(p_capture->>'captured_at')::timestamptz;
 if capture_key is null or observed is null or observed>now()+interval '5 minutes' or observed<now()-interval '7 days' then raise exception 'Invalid search capture time'; end if;
 if p_capture->>'source_url' is distinct from 'https://services.ecourts.gov.in/ecourtindia_v6/?p=casestatus/index' or p_capture->>'parser_version' is distinct from '1.0.0' then raise exception 'Unsupported search source or parser'; end if;
 if jsonb_typeof(p_capture->'entries') is distinct from 'array' or jsonb_array_length(p_capture->'entries') not between 1 and 2000 then raise exception 'Search must contain 1–2000 identified rows'; end if;
 loaded:=(p_capture->>'loaded_rows')::integer;skipped:=(p_capture->>'skipped_rows')::integer;
 total_value:=(p_capture->>'reported_cases')::integer;establishments:=(p_capture->>'total_establishments')::integer;
 if loaded is null or skipped is null or loaded<jsonb_array_length(p_capture->'entries') or skipped<0 or loaded<>jsonb_array_length(p_capture->'entries')+skipped or total_value<0 or establishments<0 then raise exception 'Invalid search totals'; end if;
 if jsonb_typeof(p_capture->'search_context') is distinct from 'object' or jsonb_typeof(p_capture->'court_totals') is distinct from 'array' then raise exception 'Search context and court totals required'; end if;
 foreach field in array array['state','district','court_complex','establishment','search_type','party_name','registration_year','status_filter'] loop
  val:=p_capture->'search_context'->field;
  if val is not null and jsonb_typeof(val)<>'string' then raise exception 'Invalid search context'; end if;
  if length(val #>> '{}')>500 then raise exception 'Search context too long'; end if;
  if length(trim(val #>> '{}'))>0 then clean_context:=clean_context || jsonb_build_object(field,trim(val #>> '{}')); end if;
 end loop;
 if jsonb_array_length(p_capture->'court_totals')>1000 then raise exception 'Too many courts'; end if;
 for item in select value from jsonb_array_elements(p_capture->'court_totals') loop
  if jsonb_typeof(item->'court') is distinct from 'string' or length(item->>'court') not between 1 and 500 or (item->>'reported_cases')::integer is null or (item->>'reported_cases')::integer<0 then raise exception 'Invalid court total'; end if;
  clean_courts:=clean_courts || jsonb_build_array(jsonb_build_object('court',item->>'court','reported_cases',(item->>'reported_cases')::integer));
 end loop;
 -- Sort identities for consistent lock order. Duplicated CNRs in a page are rejected rather than silently counted twice.
 for item in select value from jsonb_array_elements(p_capture->'entries') order by value->>'cnr' loop
  cnr_value:=item->>'cnr';data_value:='{}';
  if cnr_value is null or cnr_value !~ '^[A-Z]{4}[0-9]{12}$' or cnr_value=any(seen) or jsonb_typeof(item->'data') is distinct from 'object' then raise exception 'Invalid or duplicated listing CNR'; end if;
  seen:=array_append(seen,cnr_value);
  foreach field in array array['serial_number','case_reference','case_type','registration_number','court','parties_text'] loop
   val:=item->'data'->field;
   if jsonb_typeof(val) is distinct from 'string' or length(trim(val #>> '{}')) not between 1 and 2000 then raise exception 'Invalid listing field %',field; end if;
   data_value:=data_value || jsonb_build_object(field,trim(val #>> '{}'));
  end loop;
  foreach field in array array['petitioners','respondents'] loop
   val:=item->'data'->field;
   if val is not null then
    if jsonb_typeof(val)<>'array' or jsonb_array_length(val)>100 then raise exception 'Invalid party list'; end if;
    if exists(select 1 from jsonb_array_elements(val) v where jsonb_typeof(v)<>'string' or length(v #>> '{}')>2000) then raise exception 'Invalid party name'; end if;
    data_value:=data_value || jsonb_build_object(field,val);
   end if;
  end loop;
  clean_rows:=clean_rows || jsonb_build_array(jsonb_build_object('cnr',cnr_value,'data',data_value));
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(c.workspace_id::text || capture_key::text,2));
 select * into previous from court_search_captures where id=capture_key;
 if previous.id is not null then
  if previous.connection_id<>c.id then raise exception 'Search capture identity conflict'; end if;
  return jsonb_build_object('status','search_saved','saved_rows',jsonb_array_length(previous.snapshot),'duplicate',true);
 end if;
 insert into court_search_captures values(capture_key,c.workspace_id,c.id,c.user_id,observed,now(),p_capture->>'source_url',clean_context,establishments,total_value,clean_courts,loaded,skipped,clean_rows,'1.0.0');
 for entry in select value from jsonb_array_elements(clean_rows) loop
  cnr_value:=entry->>'cnr';data_value:=entry->'data';
  perform pg_advisory_xact_lock(hashtextextended(c.workspace_id::text || cnr_value,3));
  select * into old from case_listings where workspace_id=c.workspace_id and cnr=cnr_value for update;
  if old.id is null then
   insert into case_listings(workspace_id,cnr,data,observed_at,search_capture_id) values(c.workspace_id,cnr_value,data_value,observed,capture_key);
   changes:=jsonb_build_object('listing',jsonb_build_object('old',null,'new',data_value));
   insert into listing_audit(workspace_id,cnr,search_capture_id,actor_id,action,changes) values(c.workspace_id,cnr_value,capture_key,c.user_id,'listed',changes);created:=created+1;
  elsif observed>=old.observed_at then
   -- Serial number belongs to a search; a changed row number alone is not a case-data change.
   if (old.data-'serial_number') is distinct from (data_value-'serial_number') then
    changes:=jsonb_build_object('listing',jsonb_build_object('old',old.data,'new',data_value));
    insert into listing_audit(workspace_id,cnr,search_capture_id,actor_id,action,changes) values(c.workspace_id,cnr_value,capture_key,c.user_id,'updated',changes);updated:=updated+1;
   end if;
   update case_listings set data=data_value,last_seen_at=now(),observed_at=observed,search_capture_id=capture_key where id=old.id;
  end if;
 end loop;
 return jsonb_build_object('status','search_saved','saved_rows',jsonb_array_length(clean_rows),'created',created,'updated',updated,'skipped_rows',skipped);
end $$;
revoke all on function public.ingest_search_capture(text,jsonb) from public;
grant execute on function public.ingest_search_capture(text,jsonb) to anon,authenticated;
commit;
