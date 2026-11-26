-- 기록 보호(화면에서만 막던 것을 DB에서도 막는다)
-- - 처리 이력(taskEvents)·인수 확인(handoffs): 추가만. 고치기·지우기는 SYSTEM OWNER만
-- - 지우기: 직접 추가한 예약(manualStays)만 직원이 지울 수 있다(화면에서 쓰는 유일한 삭제). 나머지는 SYSTEM OWNER만
-- restrictive 정책이라 기존 허용 정책(같은 지점 직원·부서 공용 계정)과 AND로 걸린다.
drop policy if exists "ops guard delete" on public.ops_docs;
drop policy if exists "ops guard history update" on public.ops_docs;
create policy "ops guard delete" on public.ops_docs as restrictive for delete to authenticated
  using (col = 'manualStays' or (select private.fb_owner()));
create policy "ops guard history update" on public.ops_docs as restrictive for update to authenticated
  using (col not in ('taskEvents', 'handoffs') or (select private.fb_owner()));
