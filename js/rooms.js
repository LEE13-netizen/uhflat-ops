/* 객실 기준 정보와 날짜별 객실 상태.
   서초 예약표 → 동·호수·타입(기준 정보) + 퇴실·입실·연박·청소 유형(그날 상태)
   서초 청소표 → 객실구분과 그날 실제 청소 유형(예약표 추정보다 우선)
   이름·연락처·예약번호·코멘트는 메모리에서만 쓰고 저장하지 않는다. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const CT = () => OPS.SeochoCT;
  const BNAME = { main: "본관", annex: "신관" };
  const LIB = {
    xlsx: ["XLSX", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"],
    jszip: ["JSZip", "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"],
    forge: ["forge", "https://cdnjs.cloudflare.com/ajax/libs/forge/1.4.0/forge.min.js"]
  };

  function loadScript(url) {
    return new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = url; s.onload = ok;
      s.onerror = () => no(new Error("엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주십시오."));
      document.head.appendChild(s);
    });
  }
  async function need(...names) {
    for (const n of names) if (!G[LIB[n][0]]) await loadScript(LIB[n][1]);
  }

  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const roomId = (b, no) => b + "-" + no;

  // 예약표의 본관·신관을 이미 등록된 같은 이름의 동에 연결한다(직접 만든 "본관"과 예약표 "본관"이 따로 생기지 않게)
  function bmapOf(prev) {
    const m = { main: "main", annex: "annex" };
    ((prev && prev.buildings) || []).forEach(x => { ["main", "annex"].forEach(k => { if (x.name === BNAME[k]) m[k] = x.id; }); });
    return m;
  }

  OPS.Rooms = {
    BNAME, roomId, addDays, need, bmapOf,

    // 파일 한 개를 읽어 종류를 판별한다. askPassword: 암호가 걸린 파일일 때 호출되는 함수(문자열 반환)
    async readFile(file, askPassword) {
      await need("xlsx");
      let bytes = new Uint8Array(await file.arrayBuffer());
      if (OPS.isEncryptedOfficeFile && OPS.isEncryptedOfficeFile(bytes)) {
        await need("forge");
        const pw = askPassword ? await askPassword(file.name) : "";
        if (!pw) throw new Error(file.name + ": 암호가 걸린 파일입니다. 암호를 입력해 주십시오.");
        try { bytes = OPS.decryptOfficeFile(bytes, pw); }
        catch (e) { throw new Error(file.name + ": " + (/WRONG_PASSWORD/.test(e.message) ? "암호가 맞지 않습니다." : e.message)); }
      }
      const X = G.XLSX;
      const names = X.read(bytes, { type: "array", bookSheets: true }).SheetNames.map(n => String(n).trim());
      const clean = names.filter(n => /^청소표\s*\(\s*(본관|신관)\s*\)$/.test(n));
      if (clean.length) {
        const wb = X.read(bytes, { type: "array", sheets: clean, cellNF: true });
        const L = CT().learnFromCleanSheet(wb);
        return { kind: "clean", fileName: file.name, learned: L };
      }
      const yr = names.filter(n => /^\d{4}\((본관|신관)\)$/.test(n));
      if (!yr.length) throw new Error(file.name + ": 예약표(2026(본관)·2026(신관) 시트)도 청소표(청소표(본관)·청소표(신관) 시트)도 아닙니다.");
      const wb = X.read(bytes, { type: "array", sheets: yr, cellNF: true });
      const stays = CT().readStays(wb);
      let borders = true;
      try { await need("jszip"); await CT().readMonthBorders(bytes, wb, stays); } catch (e) { borders = false; }
      return { kind: "reservation", fileName: file.name, stays, borders };
    },

    // 객실 기준 정보: 예약표의 호수 열 기준. 청소표의 객실구분이 있으면 타입으로 쓴다.
    masterFrom(stays, learnedMaster, prev) {
      const rooms = Object.assign({}, (prev && prev.rooms) || {});
      const buildings = ((prev && prev.buildings) || []).map(x => Object.assign({}, x));
      const bm = bmapOf(prev);
      ["main", "annex"].forEach(src => {
        const S = stays && stays[src];
        if (!S) return;
        const b = bm[src];
        if (!buildings.some(x => x.id === b)) buildings.push({ id: b, name: BNAME[src] });
        Object.entries(S.rooms).forEach(([no, R]) => {
          const lm = (learnedMaster && learnedMaster[src] && learnedMaster[src][no]) || {};
          const id = roomId(b, no);
          rooms[id] = {
            b, building: BNAME[src], no,
            dong: lm.dong || R.dong || "",
            type: lm.label || (rooms[id] && rooms[id].type) || R.label || "",
            sheetType: R.label || ""
          };
        });
      });
      return { buildings, rooms };
    },

    // 날짜 T의 객실 상태: 서초 청소표 생성 로직(generate)을 그대로 쓰고, 전날 밤 비어 있던 방은 입실·공실로 채운다.
    // [web] history: 올려 둔 과거 청소표 { 날짜: { main|annex: { 호수: "전체재실"|"재실청소"… } } } — 전체 청소 날짜의 기준점
    dayFrom(stays, T, learnedMaster, bm, history) {
      bm = bm || { main: "main", annex: "annex" };
      const g = CT().generate(stays, T, history || {}, learnedMaster || { main: {}, annex: {} }, {});
      const out = {};
      ["main", "annex"].forEach(src => {
        const b = bm[src];
        (g[src] || []).forEach(r => {
          const flags = (r.flags || []).concat(r.risk || []).filter(f => !/객실구분 미확인|청소표 없음/.test(f)).slice(0, 3);
          out[roomId(b, r.room)] = { stay: r.state || "연박", clean: r.kind || "", sameDayIn: r.today === "당일", flags };
          if (typeof r.day === "number") out[roomId(b, r.room)].day = r.day;   // [web] 체크인 후 며칠째(7일 점검용)
        });
        const S = stays && stays[src];
        if (!S) return;
        Object.entries(S.rooms).forEach(([no, R]) => {
          const id = roomId(b, no);
          if (out[id]) return;
          const c = R.cells[T];
          out[id] = c ? { stay: "입실", clean: "", flags: c.txt ? ["예약표 표기 " + c.txt] : [] } : { stay: "공실", clean: "", flags: [] };
        });
      });
      return out;
    },

    // 객실별 투숙 기간(입실일~퇴실일). 이름·채널·코멘트는 넣지 않는다.
    // 예약표 칸이 월초에 나뉘어 있어도 서초 규칙(stayStart/stayEnd)으로 한 숙박으로 잇는다.
    // from~to: 저장할 범위(퇴실일이 from 이후이고 입실일이 to 이전인 숙박만)
    spansFrom(stays, bm, from, to) {
      bm = bm || { main: "main", annex: "annex" };
      const out = {};
      ["main", "annex"].forEach(src => {
        const S = stays && stays[src];
        if (!S) return;
        Object.entries(S.rooms).forEach(([no, R]) => {
          const seen = new Set(), list = [];
          Object.values(R.cells || {}).sort((a, b) => a.s.localeCompare(b.s)).forEach(c => {
            const st0 = CT().stayStart(R, c), end = CT().stayEnd(R, c), co = this.addDays(end, 1);
            const k = st0 + "|" + co;
            if (seen.has(k) || co < from || st0 > to) return;
            seen.add(k);
            list.push(c.txt ? [st0, co, 1] : [st0, co]);   // 1 = 예약이 아니라 표기만 있는 칸(UHC·Miss 등)
          });
          // [web] 표기 칸(UHC·Miss 등)은 이어진 날마다 기간이 하나씩 생겨 겹친다(실데이터: 한 객실 188건) → 겹치거나 맞닿은 것을 하나로 합친다
          const res = list.filter(x => x.length === 2), mk = list.filter(x => x.length === 3).sort((a, c) => a[0].localeCompare(c[0]) || a[1].localeCompare(c[1]));
          const merged = [];
          mk.forEach(x => { const l = merged[merged.length - 1]; if (l && x[0] <= l[1]) { if (x[1] > l[1]) l[1] = x[1]; } else merged.push(x.slice()); });
          const all = res.concat(merged).sort((a, c) => a[0].localeCompare(c[0]));
          if (all.length) out[roomId(bm[src], no)] = all;
        });
      });
      return out;
    },

    // 청소표: 그날 실제 청소 유형
    cleanFrom(learned, bm) {
      bm = bm || { main: "main", annex: "annex" };
      const date = learned.date.main || learned.date.annex || "";
      const out = {};
      ["main", "annex"].forEach(src => Object.entries(learned.kinds[src] || {}).forEach(([no, k]) => { out[roomId(bm[src], no)] = k; }));
      // [web] 담당(룸메이드) — 청소표 담당 칸
      const assign = {};
      ["main", "annex"].forEach(src => Object.entries((learned.assign || {})[src] || {}).forEach(([no, n]) => { assign[roomId(bm[src], no)] = n; }));
      // [web] 재실 요청 시간 — 청소표 메모/비고
      const requests = {};
      ["main", "annex"].forEach(src => Object.entries((learned.requests || {})[src] || {}).forEach(([no, q]) => { requests[roomId(bm[src], no)] = q; }));
      return { date, kinds: out, assign, requests, master: learned.master };
    },

    // 업무의 객실 표기를 객실 기준 정보에 맞춘다. 번호가 두 동에 다 있으면 동을 알아야 한다.
    resolve(task, master) {
      if (!master || !master.rooms) return null;
      if (task.roomId && master.rooms[task.roomId]) return task.roomId;
      const no = String(task.room || "").replace(/호$/, "").trim();
      if (!/^\d{3,4}$/.test(no)) return null;
      const n = String(+no);
      if (task.building) { const id = roomId(task.building, n); return master.rooms[id] ? id : null; }
      const hits = Object.keys(master.rooms).filter(id => master.rooms[id].no === n);
      return hits.length === 1 ? hits[0] : null;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
