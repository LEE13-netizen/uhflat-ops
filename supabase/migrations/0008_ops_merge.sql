-- 객실 청소 기록(roomSvc) 동시 수정 손실 방지: 통째 덮어쓰기 대신 "바꾼 칸만" 서버에서 합친다.
-- 문서가 없으면 만든다(ops_patch는 수정만 됨). log는 새 기록을 앞에 덧붙이고 최근 p_log_max개만 둔다.
-- security invoker: 기존 ops_docs 행 수준 보안(RLS)이 그대로 적용된다.
create or replace function public.ops_merge(p_col text, p_id text, p_patch jsonb, p_log_max int default 20)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  newlog jsonb := p_patch -> 'log';
  rest jsonb := p_patch - 'log';
begin
  insert into public.ops_docs as d (col, id, data)
  values (p_col, p_id, rest || case when newlog is null then '{}'::jsonb else jsonb_build_object('log', newlog) end)
  on conflict (col, id) do update set data = d.data || rest || case when newlog is null then '{}'::jsonb else jsonb_build_object('log',
    (select coalesce(jsonb_agg(t.e order by t.o), '[]'::jsonb)
       from jsonb_array_elements(newlog || coalesce(d.data -> 'log', '[]'::jsonb)) with ordinality as t(e, o)
      where t.o <= greatest(1, least(p_log_max, 50)))) end;
end $$;
revoke execute on function public.ops_merge(text, text, jsonb, int) from public, anon;
grant execute on function public.ops_merge(text, text, jsonb, int) to authenticated;
