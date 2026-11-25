# 개발 방식

**업무 화면은 claude.ai 아티팩트 "통합 업무 시스템"에서 만들고, 이 저장소는 그 화면에 웹 기능(개인 로그인·권한·Supabase)을 덧입혀 운영합니다.**
DB·서버 함수·로그인·권한은 이 저장소가 원본입니다.

## 아티팩트에서 바꾼 화면을 웹에 반영할 때
Claude Code에 "아티팩트 바꾼 것 웹판에 반영해줘"라고 요청하면:
1. 아티팩트 최신 파일(index.html, js/*.js)을 받는다.
2. `tools/port-artifact.ps1 -From <받은 폴더>` 실행 → `index.html`, `js/` 갱신 + `js/app.js`에 웹 수정(`[web]`) 덧입힘.
   기준 문장이 바뀌어 맞지 않으면 스크립트가 멈추고 어느 수정인지 알려 준다.
3. 부서·권한 구조가 바뀌었으면 `web/auth.js`, DB(`supabase/migrations`)도 맞춘다.
4. localhost(시험 환경)에서 로그인·권한·화면 확인 → 운영 DB 반영 → GitHub에 올림(1~2분 뒤 반영).

## 구조
| 위치 | 내용 |
|---|---|
| `index.html`, `js/` | 업무 화면과 엔진 (아티팩트에서 옮김) |
| `web/config.js` | 운영/시험 Supabase 주소·공개 키, 부서 공용 계정 목록 |
| `web/auth.js` | 로그인 화면(개인 아이디 + PIN, 부서 공용 PIN), 첫 로그인 PIN 변경, 잠금, 자동 로그아웃 |
| `web/staff.js` | 직원·권한 창, 일반 설정, 감사 로그 |
| `web/store-supabase.js` | 저장 창구(`OPS.Store`)를 Supabase로 연결 |
| `web/web.css` | 로그인·직원 창 스타일, 시험 환경 경고 띠 |
| `supabase/` | DB 변경(migrations), 서버 함수(functions) |
| `tools/port-artifact.ps1` | 아티팩트 → 웹 반영 도구 |
| `docs/` | 분석 보고서, 설계서 |
| `backups/` | 운영 데이터 백업 (저장소에 올리지 않음) |

## 환경
- 운영: https://lee13-netizen.github.io/uhflat-ops/ → Supabase `vtlzettgvppkjrvipvyj`
- 시험: localhost 또는 `?env=staging` → Supabase `vgdavojjtfchdlfzngtk` (화면 맨 위 빨간 "시험 환경" 띠)

## 지켜야 할 것
- 저장은 `OPS.Store` 창구로만 한다. 화면 코드에서 Supabase를 직접 부르지 않는다.
- DB 구조를 바꾸기 전에는 `backups/`에 먼저 백업한다.
- 비밀 키(service_role)·PIN 비밀값은 코드에 넣지 않는다(서버 함수·Vault에만).
- 운영 반영 전에 시험 환경에서 먼저 확인한다.
