-- 초기화(보관 후 비우기) · 되살리기 — SYSTEM OWNER 전용, 서버 함수 ops-reset(PIN 확인)에서만 부른다
-- 지우지 않고 private.ops_archive로 옮긴다. 분실물·처리 이력·인수 확인·직원·설정·객실 목록은 대상이 아니다(코드에서 막음).
create table if not exists private.ops_archive (
  batch_id uuid not null,
  archived_at timestamptz not null default now(),
  actor_id uuid,
  branch_id text,
  col text not null,
  id text not null,
  data jsonb not null,
  restored_at timestamptz,
  primary key (batch_id, col, id)
);
create index if not exists ops_archive_at on private.ops_archive (archived_at desc);
revoke all on private.ops_archive from public, anon, authenticated;

-- 초기화할 수 있는 모음(이 밖은 무시)
create or replace function private.ops_reset_allowed() returns text[]
language sql immutable set search_path = '' as $$
  select array['roomSvc','deliveries','tasks','roomNotes','manualStays','stock','roomDays','stayIndex']::text[]
$$;

-- 모음별 건수(미리 보기)
create or replace function public.ops_reset_preview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c, n), '{}'::jsonb) from (
    select a.c, (select count(*) from public.ops_docs d where d.col = a.c) n
    from unnest(private.ops_reset_allowed()) a(c)) x
$$;

-- 보관 후 비우기: 한 번에(트랜잭션). 반환: 묶음 id · 모음별 건수
create or replace function public.ops_reset_archive(p_actor uuid, p_cols text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b uuid := gen_random_uuid();
  cols text[];
  res jsonb := '{}'::jsonb;
  c text; n int;
begin
  select array_agg(x) into cols from unnest(p_cols) x where x = any(private.ops_reset_allowed());
  if cols is null or array_length(cols, 1) is null then raise exception '초기화할 항목이 없습니다'; end if;
  foreach c in array cols loop
    insert into private.ops_archive (batch_id, actor_id, branch_id, col, id, data)
      select b, p_actor, d.branch_id, d.col, d.id, d.data from public.ops_docs d where d.col = c;
    get diagnostics n = row_count;
    delete from public.ops_docs d where d.col = c;
    res := res || jsonb_build_object(c, n);
  end loop;
  return jsonb_build_object('batch', b, 'counts', res);
end $$;

-- 되살리기: 같은 자리에 그 뒤 새 기록이 있으면 새 기록을 지키고 건너뛴다(건수로 알려 줌)
create or replace function public.ops_reset_restore(p_batch uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare total int; ins int;
begin
  select count(*) into total from private.ops_archive where batch_id = p_batch and restored_at is null;
  if total = 0 then raise exception '되살릴 보관 묶음이 없습니다(이미 되살렸거나 없는 묶음)'; end if;
  insert into public.ops_docs (col, id, data, branch_id)
    select a.col, a.id, a.data, coalesce(a.branch_id, 'SEOCHO') from private.ops_archive a where a.batch_id = p_batch and a.restored_at is null
    on conflict (col, id) do nothing;
  get diagnostics ins = row_count;
  update private.ops_archive set restored_at = now() where batch_id = p_batch and restored_at is null;
  return jsonb_build_object('total', total, 'restored', ins, 'skipped', total - ins);
end $$;

-- 보관 묶음 목록
create or replace function public.ops_reset_batches() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
    select jsonb_build_object('batch', batch_id, 'at', min(archived_at), 'actor', min(actor_id::text), 'n', count(*), 'restored', bool_and(restored_at is not null),
      'cols', jsonb_object_agg(col, cnt)) x
    from (select batch_id, archived_at, actor_id, restored_at, col, count(*) over (partition by batch_id, col) cnt from private.ops_archive) s
    group by batch_id) t
$$;

-- 브라우저에서는 못 부른다(서버 함수의 service_role만)
revoke execute on function public.ops_reset_preview(), public.ops_reset_archive(uuid, text[]), public.ops_reset_restore(uuid), public.ops_reset_batches() from public, anon, authenticated;
grant execute on function public.ops_reset_preview(), public.ops_reset_archive(uuid, text[]), public.ops_reset_restore(uuid), public.ops_reset_batches() to service_role;
grant usage on schema private to service_role;
grant select, insert, update on private.ops_archive to service_role;
