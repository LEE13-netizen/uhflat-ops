-- 근무 마감·인수인계 기록(handovers)도 추가만: 고치기는 SYSTEM OWNER만(지우기는 0009에서 이미 manualStays 외 SYSTEM OWNER만)
drop policy if exists "ops guard history update" on public.ops_docs;
create policy "ops guard history update" on public.ops_docs as restrictive for update to authenticated
  using (col not in ('taskEvents', 'handoffs', 'handovers') or (select private.fb_owner()));
