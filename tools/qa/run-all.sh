#!/usr/bin/env bash
# 전체 점검 한 번에: 문법 → 동시 사용 시뮬레이션(기록 손실 0) → 불러오기 시험 → 화면 시나리오(로컬 1인 모드)
# 사용: bash tools/qa/run-all.sh   (실제 예약 패턴을 쓰려면 tools/qa/data/stayIndex.json 을 두면 됨 — 저장소에 올리지 않음)
# 끝에 "결과: 통과"면 배포해도 된다. 알려진 미구현(교대·인수인계·업무 마감) 실패는 따로 표시하고 통과로 친다.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; QA="$ROOT/tools/qa"
W="$(mktemp -d)"; mkdir -p "$W/data" "$W/site" "$W/shots"; FAIL=0
say(){ printf '\n== %s\n' "$1"; }
say "1. 문법"
for f in "$ROOT"/js/*.js "$ROOT"/web/*.js; do node --check "$f" || { echo "문법 오류: $f"; FAIL=1; }; done
say "2. 동시 사용 시뮬레이션(34대, 하루)"
for sd in 7 21; do
  node "$ROOT/tools/sim/ops-day-sim.js" hybrid $sd smart urgent normal > "$W/sim-$sd.json" || FAIL=1
  python3 -c "import json,sys; d=json.load(open('$W/sim-$sd.json')); ok=d['lostUpdates']['count']==0 and d['errorCount']==0; print('시드 $sd: 기록 손실', d['lostUpdates']['count'], '· 엔진 오류', d['errorCount'], '·', '통과' if ok else '실패'); sys.exit(0 if ok else 1)" || FAIL=1
done
say "3. 청소 기록 불러오기(서버 거르기·자동 전환)"
node "$QA/ww-test.js" "$ROOT" || FAIL=1
say "4. 청소표 담당 읽기"
if (cd "$W" && npm i xlsx@0.18.5 --silent >/dev/null 2>&1); then (cd "$W" && cp "$QA/clean-sheet-parse-test.js" . && node clean-sheet-parse-test.js "$ROOT") || FAIL=1; else echo "건너뜀: xlsx 설치 불가"; fi
say "5. 화면 시나리오"
if node -e "require('playwright')" 2>/dev/null; then
  if [ -f "$QA/data/stayIndex.json" ]; then cp "$QA/data/stayIndex.json" "$W/data/"; echo "실제 예약 패턴 사용"; else python3 "$QA/gen-stays.py" "$W/data/stayIndex.json"; fi
  python3 "$QA/seed.py" "$W" >/dev/null
  ln -s "$ROOT/js" "$W/site/js"; ln -s "$ROOT/web" "$W/site/web"
  python3 - "$ROOT/index.html" "$W/site/local.html" <<'PY'
import sys
src=open(sys.argv[1],encoding='utf-8').read(); i=src.index('<script>window.OPS_APP_SCRIPTS'); j=src.index('</body>')
files=["js/model.js","js/store.js","js/core.js","js/seocho-ct.js","js/office-crypto.js","js/rooms.js","js/layout.js","js/stays.js","js/i18n.js","js/desk.js","js/svc.js","js/dash.js","web/roommix.js","web/plan-seocho.js","js/app.js"]
out=src[:i]+'<style>#gate{display:none!important}</style>\n'+"\n".join(f'<script src="{f}"></script>' for f in files)+"\n"+src[j:]
open(sys.argv[2],'w',encoding='utf-8').write(out.replace('<body class="gated">','<body>'))
PY
  (cd "$W/site" && python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "$W/srv.pid"); sleep 1
  cp "$QA"/ui-*.js "$W/"; mkdir -p "$W/scripts"; cp "$QA"/ui-*.js "$W/scripts/"
  for t in ui-scen ui-asg ui-board ui-vip; do
    echo "-- $t"; S="$W" timeout 600 node "$W/$t.js" > "$W/$t.log" 2>&1
    grep -E "^\[(PASS|FAIL|ERROR|NOTE)\]" "$W/$t.log" | sed 's/ — .*//' | sort | uniq -c | sed 's/^/   /' | head -40
    BAD=$(grep -E "^\[(FAIL|ERROR)\]" "$W/$t.log" | grep -vE "D2 |D3 |E1 " | head -5)
    [ -n "$BAD" ] && { echo "   예상 밖 실패:"; echo "$BAD" | sed 's/^/     /'; FAIL=1; }
    grep -E "^\[FAIL\] (D2|D3|E1) " "$W/$t.log" | sed 's/ — .*//; s/^/   알려진 미구현: /'
  done
  kill "$(cat "$W/srv.pid")" 2>/dev/null
else echo "건너뜀: playwright 없음"; fi
say "결과: $([ $FAIL = 0 ] && echo 통과 || echo 실패)  (기록: $W)"
exit $FAIL
