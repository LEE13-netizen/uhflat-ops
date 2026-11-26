-- 서버 함수(service_role)가 계정 표를 읽고 쓸 수 있게 권한을 명시한다.
-- 운영 프로젝트는 새 표에 service_role 기본 권한이 붙지 않아 관리자 계정 만들기에서 "부서를 찾지 못했습니다"가 났다.
-- 브라우저(anon/authenticated) 권한은 바꾸지 않는다.
grant select, insert, update, delete on table
  public.branches, public.departments, public.profiles,
  public.auth_guard, public.audit_logs, public.app_settings
to service_role;
grant usage, select on all sequences in schema public to service_role;
