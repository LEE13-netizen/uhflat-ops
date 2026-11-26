-- 의견함: 프로그램 불편·오류 신고와 기능 제안 (web/feedback.js)
-- - 직원: 보내기, 자기가 보낸 것 읽기만. 남의 의견은 보이지 않는다.
-- - SYSTEM OWNER: 같은 지점 전체 읽기, 상태·답변 바꾸기
-- - 삭제 없음(기록 보존). 보류는 사유(답변)가 있어야 한다.
-- - 부서 공용 계정(병행 기간)도 보낼 수 있다(작성자 = 공용 계정)
-- ops_docs에 넣지 않는 이유: ops_docs는 같은 지점 누구나 읽고 고치고 지울 수 있다.

create or replace function private.fb_branch() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.branch_id from public.profiles p where p.user_id = (select auth.uid()) and p.active),
    case when (select auth.jwt() -> 'app_metadata' ->> 'dept') in ('FO','HK','FM','MG') then 'SEOCHO' end)
$$;

create or replace function private.fb_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role::text = 'super_admin' from public.profiles p where p.user_id = (select auth.uid()) and p.active), false)
      or coalesce((select auth.jwt() -> 'app_metadata' ->> 'owner') = 'true', false)
$$;

revoke execute on function private.fb_branch(), private.fb_owner() from public, anon;
grant execute on function private.fb_branch(), private.fb_owner() to authenticated;

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  branch_id text not null default 'SEOCHO' references public.branches(id),
  created_at timestamptz not null default now(),
  author_id uuid not null default auth.uid(),
  author_name text not null default '' check (length(author_name) <= 40),
  dept text not null default '' check (length(dept) <= 8),
  kind text not null check (kind in ('bug', 'idea')),
  body text not null check (length(body) between 2 and 2000),
  ctx jsonb not null default '{}'::jsonb check (pg_column_size(ctx) < 8000),
  status text not null default 'new' check (status in ('new', 'review', 'done', 'hold')),
  reply text not null default '' check (length(reply) <= 1000),
  replied_by uuid,
  replied_at timestamptz,
  constraint feedback_hold_reason check (status <> 'hold' or length(btrim(reply)) > 0)
);
create index if not exists feedback_branch_at on public.feedback (branch_id, created_at desc);
create index if not exists feedback_author_at on public.feedback (author_id, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback insert own" on public.feedback;
drop policy if exists "feedback read own or owner" on public.feedback;
drop policy if exists "feedback update owner" on public.feedback;

create policy "feedback insert own" on public.feedback for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and branch_id = (select private.fb_branch())
    and status = 'new' and reply = '' and replied_by is null and replied_at is null
  );
create policy "feedback read own or owner" on public.feedback for select to authenticated
  using (branch_id = (select private.fb_branch()) and (author_id = (select auth.uid()) or (select private.fb_owner())));
create policy "feedback update owner" on public.feedback for update to authenticated
  using (branch_id = (select private.fb_branch()) and (select private.fb_owner()))
  with check (branch_id = (select private.fb_branch()) and (select private.fb_owner()));

revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant update (status, reply, replied_by, replied_at) on public.feedback to authenticated;
grant select, insert, update, delete on public.feedback to service_role;
