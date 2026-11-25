/* 현장 요청(서초 키핑·시설 톡방 11/2~11/25 분석 반영)
   1) 불출 요청: 프론트 → 키핑. 톡방에서 가장 많은 요청(수건·생수·휴지·베개…)이고,
      키핑의 "완료" 답장에 객실 번호가 거의 없어 어느 요청이 끝났는지 다시 묻는 일이 잦았다.
      → 요청 한 건 = 한 문서. 키핑이 그 요청에서 "완료"를 누른다. 프론트 확인 단계는 두지 않는다(건수가 많음).
      야간 키핑과 영어로 소통하는 경우가 많아 품목·방법은 한/영 함께 보인다.
   2) 수건 재고: 매일 "수건 수량 알려 주세요"를 묻던 것을 키핑이 숫자로 남기고 모두가 본다.
   3) 분실물: 객실·날짜·물건·보관 위치·상태. 고객 이름은 적지 않는다.
   저장: deliveries / stock(문서 id = 날짜__동id) / lostFound */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const S = () => OPS.Store, C = () => OPS.COL;

  const ITEMS = [
    { id: "big", ko: "큰수건", en: "large towel" },
    { id: "small", ko: "작은수건", en: "small towel" },
    { id: "water", ko: "생수", en: "water" },
    { id: "roll", ko: "롤휴지", en: "toilet paper" },
    { id: "tissue", ko: "각티슈", en: "tissue box" },
    { id: "pillow", ko: "베개", en: "pillow" },
    { id: "blanket", ko: "이불", en: "duvet" },
    { id: "topper", ko: "토퍼", en: "topper" },
    { id: "detergent", ko: "세제", en: "detergent" },
    { id: "bag", ko: "쓰레기봉투", en: "trash bag" },
    { id: "hanger", ko: "옷걸이", en: "hanger" },
    { id: "iron", ko: "스팀다리미", en: "steam iron" }
  ];
  // 수량이 아니라 할 일인 것
  const TASKS = [
    { id: "trash", ko: "쓰레기 수거", en: "collect trash" },
    { id: "swap", ko: "수건 교체", en: "replace towels" },
    { id: "collect", ko: "사용 수건 수거", en: "collect used towels" }
  ];
  const METHODS = [
    { id: "hang", ko: "문고리", en: "door handle" },
    { id: "hangbell", ko: "문고리+벨링", en: "door handle + ring bell" },
    { id: "hand", ko: "직접 전달(벨링)", en: "ring bell, hand to guest" },
    { id: "enter", ko: "부재중 입실", en: "guest out, enter room" },
    { id: "front", ko: "프론트로", en: "bring to front desk" }
  ];
  const itemName = (id, en) => { const x = ITEMS.concat(TASKS).find(i => i.id === id); return x ? (en ? x.en : x.ko) : id; };
  const methodName = (id, en) => { const x = METHODS.find(m => m.id === id); return x ? (en ? x.en : x.ko) : ""; };

  const clean = (v, n) => OPS.mask(String(v == null ? "" : v).trim()).slice(0, n);
  const by = (actor, extra) => Object.assign({ at: Date.now(), by: actor.name || "", uid: actor.uid || "", role: actor.role }, extra || {});
  const qty = v => Math.max(0, Math.min(99, parseInt(v, 10) || 0));
  const cnt = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));   // 린넨실 재고는 수백 장

  // 요청 내용을 한 줄로: "큰수건 2 · 생수 4 · 쓰레기 수거"
  function line(d, en) {
    const parts = [];
    ITEMS.forEach(i => { const n = (d.items || {})[i.id]; if (n) parts.push((en ? i.en : i.ko) + " " + n); });
    TASKS.forEach(t => { if ((d.tasks || {})[t.id]) parts.push(en ? t.en : t.ko); });
    if (d.other) parts.push(d.other);
    return parts.join(" · ");
  }

  function status(d) {
    if (d.cancel) return "취소";
    if (d.done) return d.done.partial ? "일부 완료" : "완료";
    if (d.fail) return "불가";
    if (d.go) return "가는 중";
    return "요청";
  }
  const isOpen = d => !d.cancel && !d.done && !d.fail;

  // 같은 객실의 아직 안 끝난 요청(중복 요청 확인용)
  const openFor = (list, roomId) => list.filter(d => d.roomId === roomId && isOpen(d));

  function sortOpen(list) {
    const due = d => (d.due && /^\d{1,2}:\d{2}$/.test(d.due)) ? +d.due.slice(0, 2) * 60 + +d.due.slice(3) : 24 * 60;
    return list.slice().sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || due(a) - due(b) || a.at - b.at);
  }

  async function request(input, actor) {
    const items = {}; let n = 0;
    ITEMS.forEach(i => { const v = qty((input.items || {})[i.id]); if (v) { items[i.id] = v; n++; } });
    const tasks = {}; TASKS.forEach(t => { if ((input.tasks || {})[t.id]) { tasks[t.id] = true; n++; } });
    const other = clean(input.other, 80);
    if (!n && !other) throw new Error("품목이나 할 일을 하나 이상 골라 주십시오.");
    if (!input.roomId) throw new Error("객실을 골라 주십시오.");
    const due = /^\d{1,2}:\d{2}$/.test(input.due || "") ? input.due : "";
    const doc = {
      propertyId: OPS.CTX.propertyId, date: OPS.ymd(Date.now()),
      roomId: input.roomId, b: input.b || "", building: clean(input.building, 20), no: clean(input.no, 8),
      items, tasks, other, method: METHODS.some(m => m.id === input.method) ? input.method : "hang",
      guestIn: !!input.guestIn, urgent: !!input.urgent, due,
      at: Date.now(), by: actor.name || "", uid: actor.uid || "", role: actor.role
    };
    const id = await S().add(C().deliveries, doc);
    return Object.assign({ id }, doc);
  }
  const patch = (d, p) => S().update(C().deliveries, d.id, Object.assign({ updatedAt: Date.now() }, p));
  const go = (d, actor) => patch(d, { go: by(actor) });
  const done = (d, actor, note) => patch(d, { done: by(actor, { partial: !!note, note: clean(note, 80) }) });
  const fail = (d, actor, why) => { const w = clean(why, 80); if (!w) throw new Error("못 하는 이유를 적어 주십시오. 예: 큰수건 재고 없음"); return patch(d, { fail: by(actor, { why: w }) }); };
  const reopen = (d, actor) => patch(d, { done: null, fail: null, go: null, reopened: by(actor) });
  const cancel = (d, actor) => patch(d, { cancel: by(actor) });

  // 수건 재고: 동마다 하루 한 문서, 마지막 값만 의미가 있다
  async function setStock(date, b, input, actor, cur) {
    const big = cnt(input.big), small = cnt(input.small), dry = clean(input.dry, 40);
    const doc = Object.assign({}, cur || {}, { date, b, propertyId: OPS.CTX.propertyId, big, small, dry, at: Date.now(), by: actor.name || "", uid: actor.uid || "", role: actor.role });
    delete doc.id;
    doc.hist = [{ at: doc.at, big, small }].concat((cur && cur.hist) || []).slice(0, 8);
    await S().set(C().stock, date + "__" + b, doc);
    return doc;
  }

  // 분실물
  const PLACES = ["린넨실 분실물 카트", "본관 프론트", "신관 프론트", "객실 냉장고", "기타"];
  const LOST_ST = ["보관", "고객 전달", "폐기"];
  async function addLost(input, actor) {
    const item = clean(input.item, 80);
    if (!item) throw new Error("물건을 적어 주십시오. 예: 검정 충전기");
    if (!input.roomId) throw new Error("객실을 골라 주십시오.");
    const doc = {
      propertyId: OPS.CTX.propertyId, date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : OPS.ymd(Date.now()),
      roomId: input.roomId, b: input.b || "", building: clean(input.building, 20), no: clean(input.no, 8),
      item, place: PLACES.includes(input.place) ? input.place : "기타", photo: !!input.photo, status: "보관",
      at: Date.now(), by: actor.name || "", uid: actor.uid || "", role: actor.role, log: []
    };
    const id = await S().add(C().lostFound, doc);
    return Object.assign({ id }, doc);
  }
  function setLost(d, st, actor) {
    if (!LOST_ST.includes(st)) throw new Error("상태가 올바르지 않습니다.");
    return S().update(C().lostFound, d.id, { status: st, updatedAt: Date.now(), log: [by(actor, { to: st })].concat(d.log || []).slice(0, 8) });
  }

  OPS.Desk = { ITEMS, TASKS, METHODS, PLACES, LOST_ST, itemName, methodName, line, status, isOpen, openFor, sortOpen,
    request, go, done, fail, reopen, cancel, setStock, addLost, setLost };
})(typeof window !== "undefined" ? window : globalThis);
