# OPS 통합 업무 시스템 (웹판)

claude.ai 아티팩트 "통합 업무 시스템" v0.18을 일반 웹사이트로 옮긴 판입니다.
정적 파일(HTML·JS)만으로 동작하며, 데이터와 로그인은 Supabase가 맡습니다.

## 로그인
- 첫 화면에서 부서를 고르고 PIN 4자리를 누릅니다.
- 부서 계정(프론트·키핑·시설·관리자)은 자기 부서 화면으로 고정됩니다.
- 프로그램 관리자(OWNER) 계정만 네 부서를 모두 오갈 수 있습니다.
- 로그인은 그 기기에 유지됩니다. 공용 기기는 화면 위 **잠금**을 눌러 PIN 화면으로 돌아갑니다.
- PIN 5번 연속으로 틀리면 30초 동안 입력을 막습니다.
- PIN은 코드에 들어 있지 않습니다. Supabase Auth에 암호화되어 저장됩니다.

## 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 틀과 스타일, PIN 화면 |
| `js/config.js` | Supabase 주소, 공개(publishable) 키, 부서 계정 목록 |
| `js/auth.js` | PIN 로그인, 로그인 후 앱 스크립트 불러오기, 잠금 |
| `js/store.js` | 저장소 창구. 웹에서는 Supabase 표 `ops_docs` + Realtime |
| 나머지 `js/*.js` | 원본 아티팩트의 업무 화면과 엔진 |

## Supabase
- 표: `public.ops_docs (col, id, data jsonb)`. 원본의 모음(tasks, roomDays 등)을 `col`로 나눠 담습니다.
- 행 수준 보안(RLS): 서버에서 부서(`app_metadata.dept`)가 지정된 계정만 읽고 쓸 수 있습니다.
- 실시간: `supabase_realtime` 발행에 포함되어 다른 기기의 변경이 바로 보입니다.
- 함수 `ops_patch(col, id, patch)`: 문서 일부 수정(위쪽 키 병합).

## PIN 바꾸기
Supabase 대시보드 → Authentication → Users에서 해당 계정의 비밀번호를 `uhops-새PIN` 형식으로 바꿉니다.
(예: PIN 1234 → 비밀번호 `uhops-1234`)

## 권장 설정
- Supabase 대시보드 → Authentication → Sign In / Providers → **Allow new users to sign up 끄기**.
  (꺼져 있지 않아도 RLS가 막지만, 두 겹으로 막는 것이 안전합니다.)

## 로컬에서 열기
정적 서버로 이 폴더를 열면 됩니다. 파일을 더블클릭(file://)하면 로그인이 동작하지 않습니다.
