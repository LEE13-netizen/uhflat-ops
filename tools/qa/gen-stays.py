# 실제 예약표 숙박 기간 파일(stayIndex.json)이 없을 때 쓰는 가짜 숙박 기간(만실 10/28 · 퇴실·입실 약 40%). 테스트 데이터
import json, random, sys, datetime as dt
random.seed(7)
D = dt.date.fromisoformat
rooms = []
for b, floors, per in [("main", range(2, 13), 9), ("annex", range(2, 19), 8)]:
    for f in floors:
        for i in range(1, per + 1):
            rooms.append(f"{b}-{f}{i:02d}")
rooms = rooms[:95] + [r for r in rooms if r.startswith("annex")][:137]
FORCE_TURN = {"main-206", "main-305", "main-411", "main-413", "main-418", "main-504", "main-518", "main-606", "main-704", "main-710"}
FORCE_STAY = {"main-208", "main-209", "main-211", "main-214", "main-302"}
rooms = sorted(set(rooms) | FORCE_TURN | FORCE_STAY)
T = D("2026-10-28")
out = {}
for r in rooms:
    spans = []
    x = random.random()
    turn = r in FORCE_TURN or (r not in FORCE_STAY and x < 0.38)
    if not turn and r not in FORCE_STAY and x > 0.9:   # 전날(10/27) 퇴실 → 10/28 입실
        spans.append([(T - dt.timedelta(days=3)).isoformat(), (T - dt.timedelta(days=1)).isoformat()])
        spans.append([T.isoformat(), (T + dt.timedelta(days=2)).isoformat()])
    elif turn:
        a = T - dt.timedelta(days=random.randint(1, 4)); spans.append([a.isoformat(), T.isoformat()])
        spans.append([T.isoformat(), (T + dt.timedelta(days=random.randint(1, 4))).isoformat()])
    else:
        a = T - dt.timedelta(days=random.randint(1, 5)); b = T + dt.timedelta(days=random.randint(1, 6)); spans.append([a.isoformat(), b.isoformat()])
    out[r] = spans
json.dump(out, open(sys.argv[1], "w"))
print("synthetic stays", len(out), "rooms")
