-- Permanently delete a company workspace and everything stored in it.
-- Only the workspace owner (the person who created it) can do this, and they
-- must type the workspace name exactly to confirm. The child tables do not
-- cascade from workspaces, so their rows are removed here in dependency order.
begin;

create or replace function public.delete_workspace(p_workspace uuid, p_confirm_name text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w workspaces;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into w from workspaces where id = p_workspace for update;
  if w.id is null or not exists (
    select 1 from workspace_members
    where workspace_id = p_workspace and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the workspace owner can delete this workspace';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> w.name then
    raise exception 'Type the workspace name exactly to confirm deletion';
  end if;

  delete from listing_audit where workspace_id = p_workspace;
  delete from case_listings where workspace_id = p_workspace;
  delete from court_search_captures where workspace_id = p_workspace;
  delete from case_audit where workspace_id = p_workspace;
  delete from case_captures where workspace_id = p_workspace;
  delete from court_cases where workspace_id = p_workspace;
  delete from capture_connections where workspace_id = p_workspace;
  delete from loan_data_imports where workspace_id = p_workspace;
  delete from workspace_members where workspace_id = p_workspace;
  delete from workspaces where id = p_workspace;
end $$;

revoke all on function public.delete_workspace(uuid, text) from public, anon;
grant execute on function public.delete_workspace(uuid, text) to authenticated;

commit;
