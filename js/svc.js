/* 객실 청소 흐름(서초 청소표 분석 기반, 2026-11-25 사용자 확인 반영)
   재실(v0.19): 청소표의 재실 객실에 프론트가 "몇 시~몇 시 · 어떤 청소"만 적는다 → 키핑 확인 → 완료
         시간이 적힌 것 = 그 시간대 청소 요청(서초 청소표 기준, 사용자 확정). 안 적으면 청소하지 않는다.
         예전 기록(발송·무응답)은 읽기만 한다.
         청소 X여도 쓰레기·수건 같은 요청이 있으면 키핑 일로 남는다.
   퇴실: 프론트 "퇴실 완료" → 키핑 확인 → 완료(사용 수건 수). 비밀번호를 제공한 객실은 퇴실 완료 때 "비번 변경" 업무가 생긴다.
   "확인" = 키핑이 추가 내용(시간·요청·퇴실 완료)을 확인했다는 표시. 내용이 바뀌면 다시 확인 대상이 된다.
   저장: roomSvc 모음, 문서 id = 날짜__객실id (객실·날짜마다 한 문서라 동시 수정 충돌이 적다). */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const S = () => OPS.Store;

  const sid = (date, roomId) => date + "__" + roomId;
  const STAY_KINDS = new Set(["재실청소", "전체재실"]);

  function stateOf(day, id) {
    if (!day) return null;
    const r = (day.rooms || {})[id] || null;
    const ck = (day.cleanSheet || {})[id];
    if (!r && !ck) return null;
    return Object.assign({ stay: "", clean: "" }, r || {}, ck ? { clean: ck } : {});
  }

  // 재실 회신이 키핑 일감인지
  const stayWork = s => !!(s.reply && (s.reply.type === "time" || (s.reply.type === "refuse" && s.reply.items)));

  function status(row) {
    const s = row.s || {};
    if (row.type === "stay") {
      if (s.done) return "완료";
      if (!s.reply) return "요청 없음";
      if (s.reply.type === "time") return "시간 확정";
      if (s.reply.type === "refuse") return s.reply.items ? "쓰레기·수건만" : "청소 없음";
      if (s.reply.type === "none") return "무응답·청소 없음";
    }
    if (row.type === "out") {
      if (s.ext) return "연장·청소 없음";
      if (s.done) return "입실 가능";
      if (s.cleaned) return "점검 대기";
      if (s.start) return "청소 중";
      if (s.co) return "퇴실 완료·청소 대기";
      if (foNeeds(row)) return "손님 아직 있음";
      if (s.late) return "레이트 " + s.late.time;
      return "퇴실 전";
    }
    return "";
  }

  // 키핑이 "손님 아직 있음"을 알렸는데 프론트가 아직 답(레이트·연장·퇴실 완료)을 안 한 퇴실 객실
  function foNeeds(row) {
    const s = row.s || {};
    if (row.type !== "out" || !s.stillIn || s.co || s.ext || s.done) return false;
    return !(s.late && s.late.at > s.stillIn.at);
  }

  // 키핑이 아직 확인하지 않은 새 내용이 있는가(깜빡임 대상)
  function hkNeedsAck(row) {
    const s = row.s || {};
    if (s.done) return false;
    const ackAt = (s.hkAck && s.hkAck.at) || 0;
    if (row.type === "stay") return stayWork(s) && s.reply.at > ackAt;
    if (row.type === "out") return !s.ext && Math.max(s.co ? s.co.at : 0, s.co && s.memo ? s.memo.at : 0, s.prio ? s.prio.at : 0, s.late ? s.late.at : 0) > ackAt && (!!s.co || !!s.late || !!s.prio);
    return false;
  }

  // [web] 프론트가 아직 안 읽은 "입실 가능"(키핑 점검 완료). 기능을 넣기 전(2026-11-26 15:00)에 끝난 객실은 읽은 것으로 본다
  const FOACK_FROM = 1795672800000;
  function foNeedsAck(row) {
    const s = row.s || {};
    if (row.type !== "out" || !s.done || s.ext || !s.done.at || s.done.at < FOACK_FROM) return false;
    return !(s.foAck && s.foAck.at >= s.done.at);
  }

  // [web] 키핑이 직접 퇴실을 확인한 객실(프론트 퇴실 완료 전에 손님이 나감) → 프론트가 읽었는가
  function foCoNeedsAck(row) {
    const s = row.s || {};
    if (row.type !== "out" || !s.co || !s.co.role || s.co.role === "FO" || s.ext || s.done) return false;   // 프론트가 아닌 사람(키핑·관리자)이 퇴실을 기록
    return !(s.foCoAck && s.foCoAck.at >= s.co.at);
  }

  function hkTodo(row) {
    const s = row.s || {};
    if (s.done) return false;
    return row.type === "out" ? !!s.co && !s.ext : stayWork(s) || forceDue(row);
  }
  // [web] 장기 투숙 점검: 체크인 후 N일째마다(설정, 기본 7일) 요청이 없어도 전체 청소. 손님이 청소를 거절했으면 제외
  function forceDue(row) {
    const s = row.s || {}, n = +(OPS.CTX && OPS.CTX.forceDays) || 7;
    if (row.type !== "stay" || s.done || !(row.day >= n) || row.day % n !== 0) return false;
    return !(s.reply && s.reply.type === "refuse" && !s.reply.items);
  }

  // 재실 요청 종류. "정비"는 청소표에 적힌 종류(재실청소·전체재실)로 보인다
  const REQ_KINDS = ["정비", "쓰레기 수거", "수건 교체", "침구 교체", "비품 전달"];
  function reqText(row) {
    const r = (row.s || {}).reply; if (!r) return "";
    const k = (r.kinds || []).map(x => x === "정비" ? row.kind : x);
    return k.join(" + ") + (r.items ? (k.length ? " · " : "") + r.items : "");
  }
  const hhmm = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? String(+m[1]).padStart(2, "0") + ":" + m[2] : ""; };

  const windowStart = w => { const m = /(\d{1,2})(?::(\d{2}))?/.exec(String(w || "")); return m ? +m[1] * 60 + (m[2] ? +m[2] : 0) : 24 * 60; };

  // 키핑 작업 순서: 프론트가 입실 시각을 건 객실(시각 순) → 당일 입실 퇴실 객실 → 나머지 퇴실 완료(먼저 된 순) → 재실 시간 순 → 쓰레기·수건만
  function hkSort(rows) {
    const rank = r => r.type === "out" ? (r.s.prio ? -1 : r.sameDayIn ? 0 : 1) : (r.s.reply && r.s.reply.type === "time" ? 2 : 3);
    const key = r => r.type === "out" ? (r.s.prio ? windowStart(r.s.prio.time) : r.s.co ? r.s.co.at : 0) : windowStart(r.s.reply && r.s.reply.window);
    return rows.slice().sort((a, b) => rank(a) - rank(b) || key(a) - key(b) || (+a.r.no - +b.r.no));
  }

  // 날짜 T의 청소 대상 목록(예약표·청소표 상태 기준)
  // getState: (객실id) => 그날 상태. 예전 방식(그날 문서)도 받는다.
  function rows(M, getState, svcMap) {
    const out = [];
    const gs = typeof getState === "function" ? getState : (id => stateOf(getState, id));
    Object.keys(M.rooms || {}).forEach(id => {
      const st = gs(id);
      if (!st) return;
      const r = M.rooms[id];
      const s = (svcMap && svcMap[id]) || {};
      if (st.stay === "퇴실" || st.stay === "퇴실·입실") out.push({ id, r, type: "out", kind: "객실청소", sameDayIn: st.stay === "퇴실·입실" || !!st.sameDayIn, s });
      else if (STAY_KINDS.has(st.clean) || st.stay === "연박") {
        // [web] 직접 바꾼 종류가 있으면 그것, 점검일이면 전체 청소
        const n = +(OPS.CTX && OPS.CTX.forceDays) || 7, force = typeof st.day === "number" && st.day >= n && st.day % n === 0;
        const kind = s.kindSet && s.kindSet.kind ? s.kindSet.kind : force ? "전체재실" : STAY_KINDS.has(st.clean) ? st.clean : "재실청소";
        out.push({ id, r, type: "stay", kind, day: st.day, force, s });
      }
    });
    return out;
  }

  function summary(list) {
    const c = { stay: 0, sent: 0, time: 0, refuse: 0, none: 0, wait: 0, out: 0, co: 0, done: 0, ack: 0 };
    list.forEach(x => {
      const s = x.s || {};
      if (x.type === "stay") {
        c.stay++; if (s.sent) c.sent++;
        if (!s.reply) c.wait++; else c[s.reply.type === "time" ? "time" : s.reply.type === "refuse" ? "refuse" : "none"]++;
      } else { c.out++; if (s.co) c.co++; }
      if (s.done) c.done++;
      if (hkNeedsAck(x)) c.ack++;
    });
    return c;
  }

  // ---- 쓰기 ----
  const clean = (v, n) => OPS.mask(String(v == null ? "" : v).trim()).slice(0, n);
  async function write(date, roomId, cur, patch, actor, act) {
    const now = Date.now();
    const doc = Object.assign({}, cur || {}, patch, { date, roomId, propertyId: OPS.CTX.propertyId, updatedAt: now });
    delete doc.id;
    doc.log = [{ at: now, by: actor.name || "", uid: actor.uid || "", role: actor.role, act }].concat((cur && cur.log) || []).slice(0, 12);
    await S().set(OPS.COL.roomSvc, sid(date, roomId), doc);
    return doc;
  }
  const by = (actor, extra) => Object.assign({ at: Date.now(), by: actor.name || "", uid: actor.uid || "", role: actor.role }, extra || {});

  OPS.Svc = {
    sid, rows, status, REQ_KINDS, reqText, hhmm, foNeeds, hkNeedsAck, foNeedsAck, foCoNeedsAck, hkTodo, forceDue, hkSort, summary, windowStart, stayWork,
    send: (date, id, cur, actor, via) => write(date, id, cur, { sent: by(actor, { via: clean(via, 12) }) }, actor, "재실 안내 발송"),
    unsend: (date, id, cur, actor) => write(date, id, cur, { sent: null }, actor, "발송 취소"),
    replyTime: (date, id, cur, actor, window, items) => {
      const w = clean(window, 30);
      if (!w) throw new Error("청소 시간대를 적어 주십시오. 예: 11~13");
      return write(date, id, cur, { reply: by(actor, { type: "time", window: w, items: clean(items, 200) }), done: null }, actor, "회신: 시간 " + w);
    },
    // 재실 요청 입력(v0.19): 시작·끝 시각 + 요청 종류(1개 이상) + 짧은 메모(선택)
    request: (date, id, cur, actor, o) => {
      const from = hhmm(o && o.from), to = hhmm(o && o.to);
      if (!from || !to) throw new Error("요청 시간대의 시작과 끝을 골라 주십시오.");
      if (to <= from) throw new Error("끝 시각이 시작 시각보다 늦어야 합니다.");
      const kinds = REQ_KINDS.filter(k => ((o && o.kinds) || []).includes(k));
      if (!kinds.length) throw new Error("요청한 청소를 하나 이상 골라 주십시오.");
      const w = from + "~" + to, memo = clean(o && o.memo, 100);
      return write(date, id, cur, { reply: by(actor, { type: "time", window: w, from, to, kinds, items: memo }), done: null }, actor, "재실 요청 " + w + " " + kinds.join("·") + (memo ? " / " + memo : ""));
    },
    replyRefuse: (date, id, cur, actor, items) => write(date, id, cur, { reply: by(actor, { type: "refuse", window: "", items: clean(items, 200) }), done: null }, actor, items ? "회신: 청소 X, " + clean(items, 40) : "회신: 청소 X"),
    replyNone: (date, id, cur, actor) => write(date, id, cur, { reply: by(actor, { type: "none", window: "", items: "" }), done: null }, actor, "무응답(청소 없음)"),
    clearReply: (date, id, cur, actor) => write(date, id, cur, { reply: null }, actor, "회신 지움"),
    checkout: async (date, id, cur, actor, room) => {
      const doc = await write(date, id, cur, { co: by(actor) }, actor, "퇴실 완료");
      // 비밀번호를 제공한 객실은 퇴실 때 비번 변경 업무를 만든다
      // 퇴실 완료를 취소했다가 다시 눌러도 업무는 한 번만(문서에 업무 id를 남긴다)
      if (doc.pwGiven && !(cur && cur.co) && !doc.pwTask && OPS.Core) {
        const t = await OPS.Core.createTask({ kind: "pwchange", title: "비번 변경 (비밀번호 제공 객실 퇴실)", room: room.no, building: room.b, roomId: id, toDept: OPS.CTX.pwDept || "FM", priority: "주의" }, actor);
        return write(date, id, doc, { pwTask: t.id }, actor, "비번 변경 업무 등록");
      }
      return doc;
    },
    undoCheckout: (date, id, cur, actor) => write(date, id, cur, { co: null }, actor, "퇴실 완료 취소"),
    // [web] 키핑: 손님이 나간 것을 직접 확인(프론트 퇴실 완료 전). 퇴실 완료와 같게 기록하고(비번 변경 업무 포함), 키핑 확인·청소 시작까지
    hkCheckout: async (date, id, cur, actor, room, startNow) => {
      const doc = await OPS.Svc.checkout(date, id, cur, actor, room);
      const p = actor.role === "HK" ? { hkAck: by(actor) } : {}; if (startNow) p.start = by(actor);   // 관리자가 누르면 키핑에는 "새로 온 것"으로 남긴다
      const who = actor.role === "HK" ? "키핑" : "관리자";
      return write(date, id, doc, p, actor, startNow ? who + " 퇴실 확인·청소 시작" : who + " 퇴실 확인");
    },
    foCoAck: (date, id, cur, actor) => write(date, id, cur, { foCoAck: by(actor) }, actor, "프론트 확인(키핑 퇴실 확인)"),
    // 키핑: 청소하러 갔는데 아직 손님이 있음 → 프론트가 레이트·연장·퇴실 완료로 답한다
    // [web] 재실 청소 종류를 직접 바꾸기(객실 이동·손님 사정). 누가 바꿨는지 남는다
    setKind: (date, id, cur, actor, kind) => write(date, id, cur, { kindSet: kind ? by(actor, { kind }) : null }, actor, kind ? "청소 종류 → " + (kind === "전체재실" ? "전체 청소" : "일반 청소") : "청소 종류 자동으로"),
    stillIn: (date, id, cur, actor) => write(date, id, cur, { stillIn: by(actor) }, actor, "손님 아직 있음"),
    late: (date, id, cur, actor, time) => {
      if (!/^\d{1,2}:\d{2}$/.test(time || "")) throw new Error("레이트 체크아웃 시각을 골라 주십시오.");
      return write(date, id, cur, { late: by(actor, { time }) }, actor, "레이트 " + time);
    },
    ext: (date, id, cur, actor, on) => write(date, id, cur, { ext: on ? by(actor) : null }, actor, on ? "연장(오늘 청소 없음)" : "연장 취소"),
    // 프론트: 이 객실 먼저(입실 시각)
    prio: (date, id, cur, actor, time) => write(date, id, cur, { prio: time ? by(actor, { time }) : null }, actor, time ? "우선 준비 " + time : "우선 해제"),
    // 키핑: 퇴실 객실 진행 단계
    start: (date, id, cur, actor) => write(date, id, cur, { start: by(actor), hkAck: (cur && cur.hkAck) || by(actor) }, actor, "청소 시작"),
    cleaned: (date, id, cur, actor) => write(date, id, cur, { cleaned: by(actor) }, actor, "청소 끝·점검 대기"),
    setPwGiven: (date, id, cur, actor, on) => write(date, id, cur, { pwGiven: !!on }, actor, on ? "비번 제공 표시" : "비번 제공 해제"),
    setMemo: (date, id, cur, actor, text) => write(date, id, cur, { memo: text ? by(actor, { text: clean(text, 300) }) : null }, actor, "추가 내용"),
    ack: (date, id, cur, actor) => write(date, id, cur, { hkAck: by(actor) }, actor, "키핑 확인"),
    foAck: (date, id, cur, actor) => write(date, id, cur, { foAck: by(actor) }, actor, "프론트 확인(입실 가능)"),
    done: (date, id, cur, actor, small, large) => {
      const n = v => Math.max(0, Math.min(20, parseInt(v, 10) || 0));
      return write(date, id, cur, { done: by(actor, { small: n(small), large: n(large) }), hkAck: (cur && cur.hkAck) || by(actor) }, actor, "청소 완료" + (n(small) || n(large) ? ` (작${n(small)} 큰${n(large)})` : ""));
    },
    undoDone: (date, id, cur, actor) => write(date, id, cur, { done: null }, actor, "완료 취소")
  };
})(typeof window !== "undefined" ? window : globalThis);
