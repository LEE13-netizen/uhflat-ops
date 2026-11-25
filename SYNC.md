# 아티팩트 → 웹판 반영 방법

**원칙: 기능 개발은 claude.ai 아티팩트("통합 업무 시스템")에서 하고, 웹판은 그것을 받아 와서 PIN 로그인·Supabase만 덧입힌다.**

```
claude.ai 아티팩트 (원본, 계속 업데이트)
        │  ① 최신 파일 받기
        ▼
OPS/artifact/        ← 아티팩트 파일 그대로 (손으로 고치지 않음)
OPS/web/             ← 웹 전용 (PIN 로그인, Supabase 저장, 로그인 화면 스타일)
        │  ② sync.ps1 실행
        ▼
OPS/index.html, OPS/js/   ← 배포용 결과물 (자동 생성, 손으로 고치지 않음)
        │  ③ 확인 후 GitHub에 올림
        ▼
https://lee13-netizen.github.io/uhflat-ops/
```

## Claude Code에 요청하는 말
> 아티팩트 최신 버전으로 OPS 웹판 동기화해줘

Claude Code가 하는 일:
1. 아티팩트(https://claude.ai/artifact/Xyoi3xDnSBmPDBi1dHPMNw)의 최신 파일을 `artifact/`에 받는다.
2. `sync.ps1`을 실행해 `index.html`, `js/`를 다시 만든다.
3. 로컬에서 PIN 로그인·저장·실시간을 확인한다.
4. GitHub에 올린다 → 1~2분 뒤 웹 주소에 반영된다.

## 폴더별 역할
| 위치 | 내용 | 고치는 곳 |
|---|---|---|
| `artifact/` | 아티팩트 원본 그대로 | claude.ai 아티팩트에서 |
| `web/config.js` | Supabase 주소·공개 키·부서 계정 목록 | 여기서 |
| `web/auth.js` | PIN 로그인 화면, 잠금, 앱 불러오기 | 여기서 |
| `web/store-supabase.js` | 저장소를 Supabase로 바꾸는 부분 | 여기서 |
| `web/web.css` | PIN 화면 모양 | 여기서 |
| `sync.ps1` | 위 둘을 합쳐 사이트를 만드는 스크립트 | 여기서 |
| `index.html`, `js/` | 결과물 | 고치지 않음 (sync.ps1이 덮어씀) |

## sync.ps1이 아티팩트 코드에 덧입히는 것
`js/app.js`의 네 군데만 바꿉니다(부서 고정). 모두 `[web]` 또는 `canRole`로 찾을 수 있습니다.
1. 시작 부서: 로그인한 부서로 고정 (프로그램 관리자만 예외)
2. 메뉴의 부서 버튼: 허용된 부서만 표시
3. 부서 버튼 클릭: 다른 부서로 못 바꾸게 막음
4. 주소 끝 `#fo` 같은 부서 전환: 허용된 부서만
5. (선택) 머리 글자 "1인 시험판" → "웹"

아티팩트에서 이 부분의 코드가 바뀌면 sync.ps1이 **멈추고 어느 수정이 안 맞는지 알려 줍니다.**
그때는 sync.ps1의 기준 문장만 새 코드에 맞게 고치면 됩니다.

## 아티팩트를 고칠 때 지켜 주면 좋은 것 (claude.ai 쪽에 알려 줄 내용)
- 저장은 계속 `OPS.Store`(store.js) 창구로만 할 것. 웹판은 이 창구만 Supabase로 바꿉니다.
- 새 JS 파일을 만들면 `index.html`에 `<script src="js/새파일.js"></script>`로 넣을 것. sync가 순서 그대로 따라갑니다.
- `window.claude.use("db")` 외의 claude.ai 전용 기능(user, downloads 등)은 웹판에서 없을 수 있으니, 없을 때도 화면이 멈추지 않게 둘 것.
- 새 저장 모음(COL)을 추가해도 웹판은 따로 할 일이 없습니다(표 하나에 `col`로 나눠 담음).

## 반영 기록
| 날짜 | 아티팩트 버전 | 비고 |
|---|---|---|
| 2026-11-25 | v0.18 | 웹판 첫 배포 |
| 2026-11-25 | v0.19 | 구조 정리(artifact/ + web/ + sync.ps1) 후 동기화 |
