/* [web] 룸 믹스(건물 전체 객실 운영 현황) 엑셀 읽기.
   시트 이름 = 건물 이름(본관·신관). "도면" 시트는 건너뛴다.
   한 시트 모양: (동 줄) → 방향 줄 → 라인 머리 "1(G)" → 면적 줄 → "17F" 층 줄(호수, 운영 코드) … → 1F·B1~B5 시설 줄
                → "CODE" 표(우리 객실 타입) → 운영사 표(핸·지·강·케·위·기·타 …)
   운영 코드가 우리 타입 표에 있으면 우리 객실, 운영사 표에 있으면 타 운영사.
   셀 메모는 "장애인"만 읽는다(숫자 메모는 무엇인지 확실하지 않아 가져오지 않는다).
   결과는 저장소 property 모음의 "mix" 문서로 저장한다(공개 저장소에 넣지 않는다). */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const LINE_RE = /^(\d{1,2})\s*\(([A-Z][A-Z0-9]*)\)$/;
  const FLOOR_RE = /^(\d{1,2})F$/i;
  const FAC_RE = /^(1F|B\d)$/i;
  const txt = v => (v == null ? "" : String(v).trim());

  function sheetGrid(XLSX, ws) {
    const ref = ws["!ref"]; if (!ref) return null;
    const R = XLSX.utils.decode_range(ref);
    const cell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
    const val = (r, c) => { const x = cell(r, c); return x ? (x.w != null && typeof x.v !== "number" ? x.w : x.v) : null; };
    // 병합된 칸: 시작 칸 값을 병합 범위 전체에 펼친다(방향·동 줄)
    const spread = {};
    (ws["!merges"] || []).forEach(m => { const v = val(m.s.r, m.s.c); if (v == null) return; for (let c = m.s.c; c <= m.e.c; c++) spread[m.s.r + ":" + c] = v; });
    const at = (r, c) => { const v = val(r, c); return v != null ? v : spread[r + ":" + c]; };
    return { R, cell, val, at };
  }

  function parseSheet(XLSX, ws, name) {
    const g = sheetGrid(XLSX, ws); if (!g) return null;
    const { R, cell, val, at } = g;
    // 라인 머리 줄
    let hr = -1, lines = [];
    for (let r = R.s.r; r <= Math.min(R.e.r, R.s.r + 15) && hr < 0; r++) {
      const found = [];
      for (let c = R.s.c; c <= R.e.c; c++) { const m = LINE_RE.exec(txt(val(r, c))); if (m) found.push({ n: +m[1], type: m[2], col: c }); }
      if (found.length >= 4) { hr = r; lines = found; }
    }
    if (hr < 0) return null;
    lines.forEach(l => {
      const a = val(hr + 1, l.col); l.area = typeof a === "number" ? Math.round(a * 100) / 100 : null;
      const d = txt(at(hr - 1, l.col)); l.dir = /^[동서남북]{1,2}$/.test(d) ? d : "";
      const w = txt(at(hr - 2, l.col)); l.wing = /^[A-Z]동$/.test(w) ? w : "";
    });
    // 동(윙): 이어진 라인 범위
    const wings = [];
    lines.forEach(l => { if (!l.wing) return; const last = wings[wings.length - 1]; if (last && last.name === l.wing) last.to = l.n; else wings.push({ name: l.wing, from: l.n, to: l.n }); });
    // 아래쪽 표(CODE·운영사)부터 읽어야 객실을 나눌 수 있다
    const types = {}, ops = {};
    let codeRow = -1;
    for (let r = hr; r <= R.e.r; r++) if (txt(val(r, 1)).toUpperCase() === "CODE") { codeRow = r; break; }
    if (codeRow >= 0) {
      let r = codeRow + 1;
      for (; r <= R.e.r; r++) {
        const code = txt(val(r, 1)); if (!code) break;
        const rest = []; for (let c = 2; c <= Math.min(R.e.c, 14); c++) { const v = txt(val(r, c)); if (v) rest.push(v); }
        types[code] = { name: rest[0] || "", info: rest.slice(1).join(" · "), count: typeof val(r, 0) === "number" ? val(r, 0) : null };
      }
      for (; r <= R.e.r; r++) {
        const code = txt(val(r, 1)), nm = txt(val(r, 2));
        if (code && nm && /^[가-힣]{1,2}$/.test(code)) ops[code] = { name: nm, count: typeof val(r, 0) === "number" ? val(r, 0) : null };
      }
    }
    // 층 줄과 시설 줄
    const floors = [], facilities = [];
    for (let r = hr + 1; r <= (codeRow >= 0 ? codeRow : R.e.r); r++) {
      const a = txt(val(r, 0));
      const fm = FLOOR_RE.exec(a);
      if (fm && fm[1] !== "1") {
        const rooms = [];
        lines.forEach(l => {
          const no = val(r, l.col); if (typeof no !== "number" && !/^\d{3,4}$/.test(txt(no))) return;
          const code = txt(val(r, l.col + 1));
          const cc = cell(r, l.col + 1) || cell(r, l.col);
          const acc = !!(cc && cc.c && cc.c.some(x => /장애인/.test(x.t || "")));
          const own = types[code] ? "ours" : ops[code] ? "other" : "unknown";
          const x = { line: l.n, no: String(+no), code, own };
          if (acc) x.acc = true;
          rooms.push(x);
        });
        if (rooms.length) floors.push({ f: fm[1], rooms });
      } else if (FAC_RE.test(a)) {
        const t = txt(val(r, 1)); if (t) facilities.push({ f: a.toUpperCase(), text: t });
      }
    }
    floors.sort((x, y) => +y.f - +x.f);
    const count = { ours: 0, other: 0, unknown: 0 }, byOp = {};
    floors.forEach(f => f.rooms.forEach(x => { count[x.own]++; if (x.own === "other") byOp[x.code] = (byOp[x.code] || 0) + 1; }));
    return { name, wings, lines: lines.map(({ n, type, area, dir, wing }) => ({ n, type, area, dir, wing })), floors, facilities, types, ops, count, byOp };
  }

  async function readFile(file) {
    await OPS.Rooms.need("xlsx");
    const XLSX = G.XLSX;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const buildings = [];
    wb.SheetNames.forEach(n => { if (/도면/.test(n)) return; const b = parseSheet(XLSX, wb.Sheets[n], n.trim()); if (b && b.floors.length) buildings.push(b); });
    if (!buildings.length) throw new Error("룸 믹스 형식을 찾지 못했습니다. 시트에 \"1(G)\"처럼 라인 머리와 \"17F\" 층 줄이 있어야 합니다.");
    return { file: file.name, buildings };
  }

  // 객실 목록(예약표로 만든 것)과 대조: 엑셀의 우리 객실인데 목록에 없는 것 / 목록에 있는데 엑셀에서 타 운영사인 것
  function compare(mix, M) {
    const out = [];
    (mix.buildings || []).forEach(mb => {
      const b = (M.buildings || []).find(x => x.name === mb.name);
      if (!b) { out.push({ name: mb.name, missingBuilding: true }); return; }
      const ours = new Set(), all = new Map();
      mb.floors.forEach(f => f.rooms.forEach(x => { all.set(x.no, x); if (x.own === "ours") ours.add(x.no); }));
      const listed = Object.values(M.rooms || {}).filter(r => r.b === b.id).map(r => r.no);
      const notInList = Array.from(ours).filter(no => !listed.includes(no)).sort((a, c) => +a - +c);
      const notOurs = listed.filter(no => !ours.has(no)).sort((a, c) => +a - +c).map(no => ({ no, code: all.has(no) ? all.get(no).code : "" }));
      out.push({ name: mb.name, ours: ours.size, listed: listed.length, notInList, notOurs });
    });
    return out;
  }

  OPS.RoomMix = { readFile, parseSheet, compare };
})(typeof window !== "undefined" ? window : globalThis);
