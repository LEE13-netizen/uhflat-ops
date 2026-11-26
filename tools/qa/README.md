# 사용자 관점 검수 도구

실제 화면(현재 코드)을 로컬 1인 모드(로그인·공유 DB 없음, 브라우저 저장소)로 열고, 부서별로 사람이 누르는 순서대로 시나리오를 돌린다.
운영 DB에는 쓰지 않는다. 결과·검수 기록은 `docs/최종-검수보고서.md`.

| 파일 | 내용 |
|---|---|
| `resv2.py` | 예약표에서 읽어 둔 객실별 숙박 기간(stayIndex, 이름 없음)으로 점유·퇴실·숙박일수 분석 |
| `seed.py` | 그 실제 패턴(10/28 만실·퇴실 88)을 12/2로 옮겨 시험 데이터 생성 (**테스트 데이터**) |
| `ui-common.js`, `ui-scen.js` | Playwright 시나리오 A~E, 예외 X1~X8, 성능 P1 |

준비(작업 폴더 `$S` 아래):
1. `$S/data/stayIndex.json` — 운영 DB `ops_docs`(col=stayIndex, id=main)의 `data.rooms`. 날짜만 있고 개인정보 없음. 저장소에는 올리지 않는다
2. `python3 seed.py $S` → `$S/data/seed.json`
3. `$S/site/local.html` — `index.html`에서 `web/auth.js`·Supabase를 빼고 `js/*.js`를 직접 불러온 페이지(로컬 1인 모드). `body`의 `gated` 클래스를 빼고 `#gate`를 숨긴다. `js`, `web`은 저장소로 심볼릭 링크
4. `$S/site`에서 `python3 -m http.server 8765 --bind 127.0.0.1`
5. `S=$S node ui-scen.js` (일부만: `ONLY='^(A|B)'`)
