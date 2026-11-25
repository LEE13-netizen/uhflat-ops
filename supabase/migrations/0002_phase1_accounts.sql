-- 1단계: 개인 계정 · 권한 (설계서 docs/PHASE1-1-계정권한-설계서.md)
-- 기존 ops_docs 데이터는 건드리지 않는다. 부서 공용 계정은 병행 기간 동안 그대로 동작한다.

-- 지점 ------------------------------------------------------------------
create table public.branches (
  id text primary key,
  name text not null,
  mode text not null default 'SINGLE',
  created_at timestamptz not null default now()
);
insert into public.branches (id, name) values ('SEOCHO', 'UH FLAT 서초');

-- 부서 ------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null references public.branches(id),
  code text not null check (code ~ '^[A-Z]{2,8}$'),
  name text not null,
  en text not null,
  active boolean not null default true,
  sort int not null default 0,
  unique (branch_id, code)
);
insert into public.departments (branch_id, code, name, en, sort) values
  ('SEOCHO', 'FO', '프론트', 'Front Office', 1),
  ('SEOCHO', 'HK', '키핑', 'Housekeeping', 2),
  ('SEOCHO', 'FM', '시설', 'Facility', 3),
  ('SEOCHO', 'MG', '관리', 'Management', 4);

-- 직원 ------------------------------------------------------------------
create type public.staff_role as enum ('super_admin', 'dept_admin', 'staff');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  branch_id text not null default 'SEOCHO' references public.branches(id),
  login_id text not null check (login_id ~ '^[a-z0-9._-]{3,20}$'),
  auth_email text not null unique,
  name text not null check (length(name) between 1 and 40),
  title text not null default '' check (length(title) <= 30),
  dept_id uuid not null references public.departments(id),
  role public.staff_role not null default 'staff',
  active boolean not null default true,
  must_change_pin boolean not null default true,
  pepper_version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by uuid
);
create unique index profiles_branch_login on public.profiles (branch_id, login_id);
-- 프로그램 관리자는 지점에 한 명
create unique index profiles_one_super on public.profiles (branch_id) where role = 'super_admin';

-- 로그인 잠금 상태 (서버 함수만 읽고 씀) -----------------------------------
create table public.auth_guard (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  failed_count int not null default 0,
  locked_until timestamptz,
  admin_lock boolean not null default false,
  last_failed_at timestamptz,
  last_login_at timestamptz
);

-- 감사 로그 (추가만) -------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  branch_id text not null default 'SEOCHO',
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb
);
create index audit_logs_at on public.audit_logs (branch_id, at desc);

-- 지점 설정 ---------------------------------------------------------------
create table public.app_settings (
  branch_id text primary key references public.branches(id),
  idle_logout_min int not null default 30 check (idle_logout_min between 1 and 1440),
  otp_required boolean not null default false,
  legacy_dept_login boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_settings (branch_id) values ('SEOCHO');

-- 권한 확인 함수 -----------------------------------------------------------
create function public.my_profile() returns public.profiles
language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p where p.user_id = (select auth.uid()) and p.active
$$;
create function public.my_branch() returns text
language sql stable security definer set search_path = '' as $$
  select p.branch_id from public.profiles p where p.user_id = (select auth.uid()) and p.active
$$;
create function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role::text from public.profiles p where p.user_id = (select auth.uid()) and p.active
$$;
revoke execute on function public.my_profile(), public.my_branch(), public.my_role() from public, anon;
grant execute on function public.my_profile(), public.my_branch(), public.my_role() to authenticated;

-- RLS ---------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.auth_guard enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

create policy "branch read" on public.branches for select to authenticated using (id = (select public.my_branch()));
create policy "dept read" on public.departments for select to authenticated using (branch_id = (select public.my_branch()));
create policy "profile read same branch" on public.profiles for select to authenticated using (branch_id = (select public.my_branch()));
create policy "settings read" on public.app_settings for select to authenticated using (branch_id = (select public.my_branch()));
create policy "audit read super" on public.audit_logs for select to authenticated
  using (branch_id = (select public.my_branch()) and (select public.my_role()) = 'super_admin');
-- auth_guard: 정책 없음 → 브라우저 접근 불가. 쓰기는 모두 서버 함수(service_role)만.

revoke all on public.branches, public.departments, public.profiles, public.auth_guard, public.audit_logs, public.app_settings from anon;
revoke all on public.auth_guard from authenticated;
revoke insert, update, delete on public.branches, public.departments, public.profiles, public.audit_logs, public.app_settings from authenticated;
grant select on public.branches, public.departments, public.profiles, public.audit_logs, public.app_settings to authenticated;

-- 기존 업무 데이터: 개인 계정(활성 직원, 같은 지점)도 읽기·쓰기 허용. 부서 공용 계정 정책은 병행 기간 유지
alter table public.ops_docs add column if not exists branch_id text not null default 'SEOCHO';
create policy "ops read for staff" on public.ops_docs for select to authenticated using (branch_id = (select public.my_branch()));
create policy "ops insert for staff" on public.ops_docs for insert to authenticated with check (branch_id = (select public.my_branch()));
create policy "ops update for staff" on public.ops_docs for update to authenticated
  using (branch_id = (select public.my_branch())) with check (branch_id = (select public.my_branch()));
create policy "ops delete for staff" on public.ops_docs for delete to authenticated using (branch_id = (select public.my_branch()));

-- PIN 비밀값(PEPPER): Vault에 보관, 서버 함수(service_role)만 읽음 ---------------
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'ops_pin_pepper_v1', 'PIN을 감싸는 서버 비밀값 v1');
create function public.ops_pin_pepper(p_version int) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ops_pin_pepper_v' || p_version
$$;
revoke execute on function public.ops_pin_pepper(int) from public, anon, authenticated;
grant execute on function public.ops_pin_pepper(int) to service_role;
