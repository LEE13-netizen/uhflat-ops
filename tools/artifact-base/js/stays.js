/* 직접 추가한 예약(새 예약건)을 예약표 상태 위에 덧입힌다.
   예약 하나 = { roomId, start: "YYYY-MM-DD"(입실일), nights }
   입실일 = 입실, 그 사이 날짜 = 연박(체크인 후 n일째, n%3==2면 전체재실 — 서초 청소표 주기), 입실일+박수 = 퇴실.
   예약표와 같은 날 퇴실·입실이 겹치면 퇴실·입실(당일 입실)로 본다. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const dayN = iso => Math.round(Date.parse(iso + "T00:00:00Z") / 864e5);
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const NIGHT = new Set(["입실", "연박", "퇴실·입실"]);   // 그날 밤 투숙 중
  const LEAVE = new Set(["퇴실", "퇴실·입실"]);           // 그날 아침 퇴실

  function overlay(base, list, date) {
    if (!list || !list.length) return base;
    const t = dayN(date);
    let arrive = null, stay = null, leave = false;
    list.forEach(m => {
      const s = dayN(m.start), e = s + (m.nights | 0);
      if (t === s) arrive = m;
      else if (t > s && t < e) stay = { m, d: t - s };
      else if (t === e) leave = true;
    });
    if (stay) return { stay: "연박", clean: stay.d % 3 === 2 ? "전체재실" : "재실청소", flags: [], manual: true };
    const bLeave = !!(base && LEAVE.has(base.stay)), bArrive = !!(base && (base.stay === "입실" || base.stay === "퇴실·입실"));
    const out = leave || bLeave, inn = !!arrive || bArrive;
    if (!arrive && !leave) return base;
    if (out && inn) return { stay: "퇴실·입실", clean: "객실청소", sameDayIn: true, flags: (base && base.flags) || [], manual: true };
    if (inn) return { stay: "입실", clean: "", flags: [], manual: true };
    return { stay: "퇴실", clean: "객실청소", flags: (base && base.flags) || [], manual: true };
  }

  // 새 예약이 이미 투숙 중인 밤과 겹치는지(예약표 + 다른 직접 추가 예약 기준). getState(date) = 그 객실의 그날 상태
  function conflicts(getState, start, nights) {
    const out = [];
    for (let i = 0; i < nights; i++) {
      const d = addDays(start, i);
      const s = getState(d);
      if (s && NIGHT.has(s.stay)) out.push(d);
    }
    return out;
  }

  const ARRIVE = new Set(["입실", "퇴실·입실"]);
  const span = m => ({ s: dayN(m.start), e: dayN(m.start) + (m.nights | 0) });

  // 새 예약을 넣기 전 중복 검사.
  // dup: 같은 객실에 이미 직접 추가한 예약과 기간이 겹침 / 예약표에 같은 날 입실이 이미 있음 → 막는다
  // nights: 예약표상 이미 투숙 중인 밤(조기퇴실 재판매 등 예외가 있을 수 있어 확인 후 허용)
  function check(baseOf, manualOfRoom, start, nights) {
    const s = dayN(start), e = s + nights;
    const same = manualOfRoom.find(m => { const x = span(m); return s < x.e && x.s < e; });
    if (same) return { dup: "manual", with: same };
    const b0 = baseOf(start);
    if (b0 && ARRIVE.has(b0.stay)) return { dup: "sheet" };
    return { nights: conflicts(baseOf, start, nights) };
  }

  // 예약표를 새로 올린 뒤, 직접 추가한 예약이 예약표에 들어왔는지 본다.
  // baseOf(roomId, date) = 예약표 상태(직접 추가분 제외). from~to = 예약표 반영 범위.
  // 결과: drop(예약표에 들어옴 → 지움, diff=박수 다름), keep(예약표에 없음), later(반영 범위 밖이라 판단 보류)
  function reconcile(list, baseOf, from, to) {
    const f = dayN(from), t = dayN(to), out = { drop: [], keep: [], later: [] };
    list.forEach(m => {
      const { s, e } = span(m);
      if (e < f) return;                              // 이미 끝난 예약
      if (s > t) { out.later.push(m); return; }
      if (s >= f) {                                   // 입실일이 범위 안: 같은 객실 같은 날 입실이 예약표에 있으면 같은 예약
        const b = baseOf(m.roomId, m.start);
        if (b && ARRIVE.has(b.stay)) {
          let n = 0; while (n < 60) { const x = baseOf(m.roomId, addDays(m.start, n + 1)); if (x && (x.stay === "연박")) n++; else break; }
          const sheetN = n + 1, sure = s + sheetN <= t;   // 퇴실이 범위 안이면 박수까지 확인 가능
          out.drop.push({ m, diff: sure && sheetN !== (m.nights | 0) ? sheetN : 0 });
        } else out.keep.push(m);
        return;
      }
      // 이미 입실한 예약: 남은 밤이 모두 예약표에서도 투숙 중이면 반영된 것으로 본다
      const rest = [];
      for (let d = f; d < Math.min(e, t + 1); d++) rest.push(addDays(from, d - f));
      if (rest.length && rest.every(d => { const x = baseOf(m.roomId, d); return x && NIGHT.has(x.stay); })) out.drop.push({ m, diff: 0 });
      else if (!rest.length) return;                  // 오늘 퇴실만 남음
      else out.keep.push(m);
    });
    return out;
  }

  OPS.Stays = { overlay, conflicts, check, reconcile, addDays, dayN };
})(typeof window !== "undefined" ? window : globalThis);
