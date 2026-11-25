-- 아티팩트 v0.23 부서 구조: 매니지먼트(MN) 신설, 관리자(MG) = 프로그램 관리자 전용
insert into public.departments (branch_id, code, name, en, sort)
values ('SEOCHO', 'MN', '매니지먼트', 'Management', 4)
on conflict (branch_id, code) do nothing;
update public.departments set name = '관리자', en = 'Administrator', sort = 5 where branch_id = 'SEOCHO' and code = 'MG';
-- MG 부서에 있던 일반·부서 관리자 직원은 매니지먼트로 옮긴다(프로그램 관리자는 MG 유지)
update public.profiles p set dept_id = (select id from public.departments where branch_id = p.branch_id and code = 'MN'), updated_at = now()
where p.role <> 'super_admin' and p.dept_id = (select id from public.departments where branch_id = p.branch_id and code = 'MG');
