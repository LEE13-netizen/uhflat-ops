# 개발 방식 (2026-11-26부터)

**이 저장소의 코드가 UHC OPERATION SYSTEM의 원본입니다.**
claude.ai 아티팩트 "통합 업무 시스템"은 더 이상 원본이 아니며, 화면 시안을 빠르게 실험할 때만 씁니다.
아티팩트에서 마음에 드는 화면이 나오면 그 부분만 이 저장소 코드에 옮겨 넣습니다(자동 동기화 없음).

## 흐름
```
코드 수정 (Claude Code)
   → 로컬에서 확인 (정적 서버로 이 폴더 열기)
   → GitHub에 올림
   → 1~2분 뒤 웹 주소에 반영
```

## 구조
| 위치 | 내용 |
|---|---|
| `index.html` | 화면 틀·스타일, PIN 화면 자리, 스크립트 순서(`OPS_APP_SCRIPTS`) |
| `js/` | 업무 화면과 엔진 (아티팩트 v0.19에서 출발) |
| `web/config.js` | Supabase 주소·공개 키·부서 계정 목록 |
| `web/auth.js` | 로그인 화면, 잠금, 앱 불러오기 |
| `web/store-supabase.js` | 저장 창구(`OPS.Store`)를 Supabase로 연결 |
| `web/web.css` | 로그인 화면 스타일 |
| `docs/` | 분석 보고서, 설계서 |
| `backups/` | 운영 데이터 백업 (저장소에 올리지 않음, `.gitignore`) |

## 지켜야 할 것
- 저장은 `OPS.Store` 창구로만 한다. 화면 코드에서 Supabase를 직접 부르지 않는다.
- 새 JS 파일은 `index.html`의 `OPS_APP_SCRIPTS` 목록에 순서대로 넣는다.
- DB 구조를 바꾸기 전에는 `backups/`에 먼저 백업한다.
- 비밀 키(service_role)는 코드에 넣지 않는다. 서버 함수(Edge Function)의 비밀값으로만 둔다.
- `js/app.js`의 `[web]` 표시가 붙은 곳은 웹판에서 덧붙인 부서 고정 코드다.

## 이전 방식 기록
아티팩트를 원본으로 두고 `sync.ps1`로 합치던 마지막 상태는 태그 `artifact-v0.19-sync`에 남아 있습니다.
