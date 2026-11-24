-- Access requests submitted from the public "Request access" form on the
-- client login page. Visitors can only submit through submit_access_request();
-- they cannot read, edit or list requests. Review them in the Supabase dashboard
-- (Table editor -> access_requests) or with the SQL editor.
begin;

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 120),
  work_email text not null check (length(work_email) between 5 and 254 and work_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company text not null check (length(company) between 2 and 160),
  phone text check (phone is null or length(phone) between 6 and 32),
  role text check (role is null or length(role) <= 120),
  message text check (message is null or length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'declined')),
  created_at timestamptz not null default now()
);
create index if not exists access_requests_created on public.access_requests (created_at desc);
create index if not exists access_requests_email_created on public.access_requests (lower(work_email), created_at desc);

-- No direct table access for browser roles; only the function below writes.
alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon, authenticated;

create or replace function public.submit_access_request(
  p_full_name text,
  p_work_email text,
  p_company text,
  p_phone text default null,
  p_role text default null,
  p_message text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text := lower(trim(coalesce(p_work_email, '')));
begin
  if length(trim(coalesce(p_full_name, ''))) < 2 then raise exception 'Please enter your full name.'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid work email.'; end if;
  if length(trim(coalesce(p_company, ''))) < 2 then raise exception 'Please enter your company name.'; end if;
  -- Light abuse guard: at most 3 requests per email per day.
  if (select count(*) from public.access_requests
      where lower(work_email) = v_email and created_at > now() - interval '1 day') >= 3 then
    raise exception 'We already have your request. Our team will get back to you soon.';
  end if;
  insert into public.access_requests (full_name, work_email, company, phone, role, message)
  values (
    left(trim(p_full_name), 120),
    v_email,
    left(trim(p_company), 160),
    nullif(left(trim(coalesce(p_phone, '')), 32), ''),
    nullif(left(trim(coalesce(p_role, '')), 120), ''),
    nullif(left(trim(coalesce(p_message, '')), 1000), '')
  );
end $$;

revoke all on function public.submit_access_request(text, text, text, text, text, text) from public;
grant execute on function public.submit_access_request(text, text, text, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
