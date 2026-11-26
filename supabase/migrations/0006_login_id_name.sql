-- 로그인 아이디 = 직원 이름(한글 허용). 공백 없이 2~20자, 영문은 소문자. 같은 이름은 '홍길동2'처럼 구분
alter table public.profiles drop constraint if exists profiles_login_id_check;
alter table public.profiles add constraint profiles_login_id_check check (login_id ~ '^[가-힣a-z0-9._-]{2,20}$');
