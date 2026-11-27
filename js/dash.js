/* v0.10 현황 숫자 계산(화면과 분리해 검사할 수 있게 순수 함수로 둔다)
   원칙: 숫자 하나마다 "누르면 무엇을 하러 가는가"가 있어야 한다. 그 행동이 없는 지표는 넣지 않는다.
   - 입실 준비: 당일 퇴실 후 같은 날 입실하는 객실이 입실 가능까지 몇 단계에 있는가
   - 부서 부하: 받은 부서 기준 열린 업무
   - 오래 열린 업무: 가장 오래 열린 것부터
   - 응답 시간: 등록 → 시작(최근 7일, 청소·점검 제외), 표본이 적으면 숨김
   - 반복: 최근 30일 이슈·수리의 객실·분류 순위, 표본이 적으면 숨김 */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const DAY = 864e5;

  // 당일 퇴실 후 입실 객실(연장 제외)의 단계별 수
  function ready(rows) {
    const c = { total: 0, ready: 0, clean: 0, wait: 0, pre: 0, ext: 0, ids: { ready: [], clean: [], wait: [], pre: [] } };
    (rows || []).forEach(x => {
      if (x.type !== "out" || !x.sameDayIn) return;
      const s = x.s || {};
      if (s.ext) { c.ext++; return; }
      c.total++;
      const k = s.done && !(s.vip && !s.vipOk) ? "ready" : (s.done || s.start || s.cleaned) ? "clean" : s.co ? "wait" : "pre";   // [web] VIP 인스펙 대기는 아직 준비 중
      c[k]++; c.ids[k].push(x.id);
    });
    return c;
  }

  // 그날 입실 객실 수: 빈 방 입실 + 퇴실 후 입실
  function arrivals(ids, getState) {
    let inn = 0, empty = 0;
    ids.forEach(id => {
      const s = getState(id);
      if (!s) return;
      if (s.stay === "입실") { inn++; empty++; }
      else if (s.stay === "퇴실·입실") inn++;
    });
    return { inn, empty };
  }

  // 예약표 기준 시각. 오늘을 어제 올린 예약표의 "내일 예정"으로만 계산했으면 stale
  function freshness(day, date, now) {
    const r = day && day.src && day.src.reservation;
    if (!r) return { at: null, stale: !!day, cleanAt: day && day.src && day.src.clean ? day.src.clean.at : null };
    const today = OPS.ymd(now);
    return { at: r.at, file: r.file || "", stale: date <= today && OPS.ymd(r.at) < date, cleanAt: day.src.clean ? day.src.clean.at : null };
  }

  // 받은 부서별 열린 업무
  function deptLoad(tasks, now) {
    const out = {};
    OPS.DEPTS.filter(d => d.id !== "MG").forEach(d => { out[d.id] = { open: 0, wait: 0, doing: 0, confirm: 0, hold: 0, hot: 0, late: 0 }; });
    (tasks || []).forEach(t => {
      if (!OPS.OPEN.has(t.status)) return;
      const o = out[t.toDept]; if (!o) return;
      o.open++;
      if (t.status === "보류") o.hold++;
      else if (t.status === "완료 대기") o.confirm++;
      else if (t.status === "진행 중") o.doing++;
      else o.wait++;
      if (t.priority === "긴급" && t.status !== "보류") o.hot++;
      if (OPS.Core.isOverdue(t, now)) o.late++;
    });
    return out;
  }

  function totals(tasks, now) {
    const c = { open: 0, hot: 0, late: 0, confirm: 0, hold: 0, doneToday: 0 };
    const today = OPS.ymd(now);
    (tasks || []).forEach(t => {
      if (OPS.OPEN.has(t.status)) {
        c.open++;
        if (t.priority === "긴급" && t.status !== "보류") c.hot++;
        if (OPS.Core.isOverdue(t, now)) c.late++;
        if (t.status === "완료 대기") c.confirm++;
        if (t.status === "보류") c.hold++;
      } else if (t.status === "완료" && t.doneAt && OPS.ymd(t.doneAt) === today) c.doneToday++;
    });
    return c;
  }

  // 가장 오래 열린 업무(보류 제외). 긴급이 같은 나이면 먼저
  function oldest(tasks, n) {
    return (tasks || []).filter(t => OPS.OPEN.has(t.status) && t.status !== "보류")
      .sort((a, b) => (a.createdAt - b.createdAt) || (OPS.PRIORITY_RANK[a.priority] - OPS.PRIORITY_RANK[b.priority]))
      .slice(0, n || 5);
  }

  const median = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  // 등록 → 시작 걸린 분(받은 부서가 직접 등록한 업무와 청소·점검은 뺀다: 기다림이 없다)
  function response(tasks, now, days, minN) {
    const from = now - (days || 7) * DAY, out = {};
    OPS.DEPTS.filter(d => d.id !== "MG").forEach(d => { out[d.id] = []; });
    (tasks || []).forEach(t => {
      if (!t.startedAt || t.createdAt < from || !out[t.toDept]) return;
      if (OPS.ROUTINE.has(t.kind) || t.fromDept === t.toDept) return;
      out[t.toDept].push(Math.max(0, (t.startedAt - t.createdAt) / 60000));
    });
    const res = {};
    Object.keys(out).forEach(k => { const a = out[k]; res[k] = { n: a.length, median: a.length >= (minN || 5) ? Math.round(median(a)) : null }; });
    return res;
  }

  // 최근 days일 이슈·수리의 반복 객실·분류. 표본이 minN 미만이면 enough=false
  function repeats(tasks, now, master, days, minN) {
    const from = now - (days || 30) * DAY;
    const pool = (tasks || []).filter(t => t.createdAt >= from && t.status !== "취소" && (t.kind === "issue" || t.kind === "repair"));
    const rooms = new Map(), cats = new Map();
    pool.forEach(t => {
      const id = master && OPS.Rooms ? OPS.Rooms.resolve(t, master) : null;
      if (id) {
        const r = master.rooms[id];
        const key = id;
        if (!rooms.has(key)) rooms.set(key, { id, label: ((master.buildings || []).length > 1 ? (r.building || "") + " " : "") + r.no, n: 0 });
        rooms.get(key).n++;
      }
      const c = t.category || (t.kind === "repair" ? "수리(분류 없음)" : "분류 없음");
      cats.set(c, (cats.get(c) || 0) + 1);
    });
    const byN = (a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label));
    const roomTop = Array.from(rooms.values()).filter(x => x.n >= 2).sort(byN).slice(0, 5);   // 한 번뿐인 객실은 반복이 아님
    const catTop = Array.from(cats.entries()).map(([label, n]) => ({ label, n })).sort(byN).slice(0, 5);
    return { n: pool.length, enough: pool.length >= (minN || 10), rooms: roomTop, cats: catTop };
  }

  // 분을 "n분 / n시간 m분"으로
  function dur(min) {
    if (min == null) return "";
    if (min < 60) return min + "분";
    const h = Math.floor(min / 60), m = min % 60;
    return h + "시간" + (m ? " " + m + "분" : "");
  }

  OPS.Dash = { ready, arrivals, freshness, deptLoad, totals, oldest, response, repeats, median, dur };
})(typeof window !== "undefined" ? window : globalThis);
