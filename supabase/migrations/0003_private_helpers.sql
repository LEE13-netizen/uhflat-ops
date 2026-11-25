-- 보안 점검 반영: 권한 확인 함수를 API에 노출되지 않는 private 스키마로 옮긴다
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.my_branch() returns text
language sql stable security definer set search_path = '' as $$
  select p.branch_id from public.profiles p where p.user_id = (select auth.uid()) and p.active
$$;
create function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role::text from public.profiles p where p.user_id = (select auth.uid()) and p.active
$$;
revoke execute on function private.my_branch(), private.my_role() from public, anon;
grant execute on function private.my_branch(), private.my_role() to authenticated;

drop policy "branch read" on public.branches;
drop policy "dept read" on public.departments;
drop policy "profile read same branch" on public.profiles;
drop policy "settings read" on public.app_settings;
drop policy "audit read super" on public.audit_logs;
drop policy "ops read for staff" on public.ops_docs;
drop policy "ops insert for staff" on public.ops_docs;
drop policy "ops update for staff" on public.ops_docs;
drop policy "ops delete for staff" on public.ops_docs;

create policy "branch read" on public.branches for select to authenticated using (id = (select private.my_branch()));
create policy "dept read" on public.departments for select to authenticated using (branch_id = (select private.my_branch()));
create policy "profile read same branch" on public.profiles for select to authenticated using (branch_id = (select private.my_branch()));
create policy "settings read" on public.app_settings for select to authenticated using (branch_id = (select private.my_branch()));
create policy "audit read super" on public.audit_logs for select to authenticated
  using (branch_id = (select private.my_branch()) and (select private.my_role()) = 'super_admin');
create policy "ops read for staff" on public.ops_docs for select to authenticated using (branch_id = (select private.my_branch()));
create policy "ops insert for staff" on public.ops_docs for insert to authenticated with check (branch_id = (select private.my_branch()));
create policy "ops update for staff" on public.ops_docs for update to authenticated
  using (branch_id = (select private.my_branch())) with check (branch_id = (select private.my_branch()));
create policy "ops delete for staff" on public.ops_docs for delete to authenticated using (branch_id = (select private.my_branch()));

drop function public.my_profile();
drop function public.my_branch();
drop function public.my_role();
