-- 운영 DB에 이미 적용된 기존 구조(웹판 v1). 시험 환경을 운영과 같게 만들 때 사용.
create table if not exists public.ops_docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (col, id)
);
create index if not exists ops_docs_col_idx on public.ops_docs (col);
alter table public.ops_docs enable row level security;
alter table public.ops_docs replica identity full;

create or replace function public.ops_touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists ops_docs_touch on public.ops_docs;
create trigger ops_docs_touch before update on public.ops_docs for each row execute function public.ops_touch();

create or replace function public.ops_patch(p_col text, p_id text, p_patch jsonb)
returns void language sql security invoker set search_path = '' as $$
  update public.ops_docs set data = data || p_patch where col = p_col and id = p_id;
$$;
revoke execute on function public.ops_patch(text,text,jsonb) from public, anon;
grant execute on function public.ops_patch(text,text,jsonb) to authenticated;

grant select, insert, update, delete on table public.ops_docs to authenticated;
revoke all on table public.ops_docs from anon;

drop policy if exists "ops read for dept accounts" on public.ops_docs;
drop policy if exists "ops insert for dept accounts" on public.ops_docs;
drop policy if exists "ops update for dept accounts" on public.ops_docs;
drop policy if exists "ops delete for dept accounts" on public.ops_docs;
create policy "ops read for dept accounts" on public.ops_docs for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'dept') in ('FO','HK','FM','MG'));
create policy "ops insert for dept accounts" on public.ops_docs for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'dept') in ('FO','HK','FM','MG'));
create policy "ops update for dept accounts" on public.ops_docs for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'dept') in ('FO','HK','FM','MG'))
  with check ((select auth.jwt() -> 'app_metadata' ->> 'dept') in ('FO','HK','FM','MG'));
create policy "ops delete for dept accounts" on public.ops_docs for delete to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'dept') in ('FO','HK','FM','MG'));

do $$ begin
  alter publication supabase_realtime add table public.ops_docs;
exception when duplicate_object then null; end $$;
