/* 층 배치도 데이터.
   실제 배치(사진으로 만든 것)가 있으면 그것을 쓰고, 없으면 자동 배치(가운데 복도 + 양쪽 객실)를 만든다.
   실제 배치 형식(나중에 property.layouts에 저장):
     layouts[동id][층 또는 "기준"] = { w, h, rooms: { "01": {x,y,w,h}, ... }, features: [{type, x, y, w, h, label}] }
   rooms의 키는 호수 끝 두 자리라서 같은 배치를 쓰는 층에 그대로 적용된다.
   사진이 없을 때(간이): 가운데 엘리베이터 코어 + 좌우 객실. 같은 층 안의 동(A동 01~14, B동 15~18 등)은 옆에 이어 붙인다.
   동 구분 규칙: layouts[동id].wings = [{ name: "A동", from: 1, to: 14 }, { name: "B동", from: 15, to: 18 }] */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const suffix = no => String(no).slice(-2);
  const floorOf = no => (String(no).length > 2 ? String(no).slice(0, -2) : "0");

  const RW = 60, RH = 50, GAP = 6, COR = 30, CORE = 70, PAD = 12, LBL = 22;

  // 동(윙) 하나: 가운데 엘리베이터 코어, 좌우로 객실, 복도를 사이에 두고 위·아래 줄
  function wing(rooms, x0, label, withCore) {
    const list = rooms.slice().sort((a, b) => +suffix(a.no) - +suffix(b.no) || +a.no - +b.no);
    const n = list.length;
    const leftN = withCore ? Math.ceil(n / 2) : n, rightN = n - leftN;
    const lt = Math.ceil(leftN / 2), lb = leftN - lt, rt = Math.ceil(rightN / 2), rb = rightN - rt;
    const lCols = Math.max(lt, lb), rCols = Math.max(rt, rb);
    const yTop = PAD + LBL, yCor = yTop + RH + GAP, yBot = yCor + COR + GAP;
    const items = [], features = [];
    const leftW = lCols * (RW + GAP);
    const coreX = x0 + leftW;
    const rightX0 = withCore ? coreX + CORE + GAP : coreX;
    const place = (arr, cols, xs, y) => arr.forEach((r, i) => items.push({ no: r.no, x: xs + i * (RW + GAP), y, w: RW, h: RH }));
    place(list.slice(0, lt), lCols, x0, yTop);
    place(list.slice(lt, leftN), lCols, x0, yBot);
    if (withCore) {
      place(list.slice(leftN, leftN + rt), rCols, rightX0, yTop);
      place(list.slice(leftN + rt), rCols, rightX0, yBot);
    }
    const w = (withCore ? leftW + CORE + GAP + rCols * (RW + GAP) : leftW) - GAP;
    features.push({ type: "corridor", x: x0, y: yCor, w, h: COR, label: "" });
    if (withCore) features.push({ type: "core", x: coreX, y: yTop, w: CORE, h: yBot + RH - yTop, label: "EV" });
    if (label) features.push({ type: "label", x: x0, y: PAD, w, h: LBL - 6, label });
    return { items, features, w, h: yBot + RH + PAD };
  }

  // 한 층: 동(A·B 등)별로 윙을 만들어 가로로 잇는다. 가장 큰 동에만 가운데 코어를 둔다.
  function auto(rooms, groups) {
    const keys = Object.keys(groups);
    const big = keys.slice().sort((a, b) => groups[b].length - groups[a].length)[0];
    const order = [big].concat(keys.filter(k => k !== big).sort());
    let x = PAD, h = 0;
    const items = [], features = [];
    order.forEach((k, i) => {
      if (i > 0) { features.push({ type: "corridor", x: x - GAP - 18, y: PAD + LBL + RH + GAP, w: 18 + GAP * 2, h: COR, label: "" }); }
      const wg = wing(groups[k], x, keys.length > 1 ? k : "", k === big);
      items.push(...wg.items); features.push(...wg.features);
      x += wg.w + 18 + GAP * 2; h = Math.max(h, wg.h);
    });
    return { w: x - 18 - GAP * 2 + PAD, h, items, features, auto: true };
  }

  // 객실을 동별로 나눈다: 예약표의 동 표기(A·B) → 없으면 설정의 끝자리 규칙(wings) → 없으면 한 덩어리
  function groupsOf(rooms, rule) {
    const g = {};
    const nameOf = d => { const t = String(d || "").trim(); return t ? (/동$/.test(t) ? t : t + "동") : ""; };
    rooms.forEach(r => {
      let k = nameOf(r.dong);
      if (!k && rule) { const sfx = +suffix(r.no); const w = rule.find(x => sfx >= x.from && sfx <= x.to); if (w) k = w.name; }
      k = k || "";
      (g[k] = g[k] || []).push(r);
    });
    return g;
  }

  function fromTemplate(tpl, rooms) {
    const items = [];
    const missing = [];
    rooms.forEach(r => {
      const p = tpl.rooms && tpl.rooms[suffix(r.no)];
      if (p) items.push({ no: r.no, x: p.x, y: p.y, w: p.w, h: p.h });
      else missing.push(r);
    });
    // 배치에 없는 객실은 아래쪽 줄에 따로 놓는다(배치 수정 필요 표시)
    const y0 = (tpl.h || 0) + 18;
    missing.sort((a, b) => +a.no - +b.no).forEach((r, i) => items.push({ no: r.no, x: 12 + i * (RW + GAP), y: y0, w: RW, h: RH, stray: true }));
    const w = Math.max(tpl.w || 0, 12 + missing.length * (RW + GAP) + 12);
    const h = missing.length ? y0 + RH + 12 : tpl.h;
    return { w, h, items, features: tpl.features || [], auto: false, stray: missing.length };
  }

  OPS.Layout = {
    suffix, floorOf,
    // M: property(객실 기준 정보), b: 동 id, floor: 층 문자열
    get(M, b, floor) {
      const rooms = Object.values(M.rooms || {}).filter(r => r.b === b && floorOf(r.no) === floor);
      const L = M.layouts && M.layouts[b];
      const tpl = L && (L[floor] || L["기준"]);
      return tpl ? fromTemplate(tpl, rooms) : auto(rooms, groupsOf(rooms, L && L.wings));
    },
    floors(M, b) {
      return Array.from(new Set(Object.values(M.rooms || {}).filter(r => r.b === b).map(r => floorOf(r.no)))).sort((a, c) => +c - +a);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
