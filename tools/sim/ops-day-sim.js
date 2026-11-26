/* 하루 운영 시뮬레이션 (실제 엔진 js/svc.js · js/desk.js · js/core.js를 그대로 불러 돌린다)
   가정: 만실 232실(본관 95 · 신관 137), 40% 금일 퇴실(전부 당일 입실), 나머지 재실(전체/일반 청소)
         프론트 7 · 키핑 25(룸메이드 20 · 인스펙터 3 · 하우스맨 2) · 시설 2
   각 직원 기기는 자기 화면 캐시를 갖고, 서버 반영·실시간 전달에 지연이 있다(휴대폰·와이파이).
   실행: node tools/sim/ops-day-sim.js [shared|assigned] [seed]
   결과는 JSON 한 덩어리로 출력한다. 화면(DOM)은 돌리지 않는다. */
process.env.TZ = "Asia/Seoul";
const vm = require("vm"), fs = require("fs"), path = require("path");
const MODE = process.argv[2] || "shared";           // shared: 지금처럼 모두가 같은 목록 / assigned: 룸메이드별 객실 배정
const SEED = +(process.argv[3] || 7);
const ROOT = path.join(__dirname, "..", "..");

// ---------- 난수 ----------
let rs = SEED >>> 0;
const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const norm = (m, sd) => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const logn = (med, p95) => med * Math.exp(Math.log(p95 / med) / 1.645 * norm(0, 1));
const MIN = 60000, T0 = Date.parse("2026-11-27T07:00:00+09:00");
const at = hm => { const [h, m] = hm.split(":").map(Number); return T0 + ((h - 7) * 60 + m) * MIN; };
const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

// ---------- 엔진 불러오기(가상 시계) ----------
let NOW = T0;
class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
const ctx = { console, Date: FakeDate, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise, Error, RegExp, parseInt, isNaN };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
["js/model.js", "js/core.js", "js/svc.js", "js/desk.js"].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f }));
const OPS = ctx.OPS;

// ---------- 서버 + 기기별 캐시 ----------
const server = {};           // col -> Map(id -> data)
const col = c => server[c] || (server[c] = new Map());
const queue = [];            // 시간순 이벤트 {t, fn}
const push = (t, fn) => { queue.push({ t, fn, k: queue.length }); };
const M = { writes: 0, byCol: {}, lost: [], lostRooms: new Set(), logCut: 0, deliveredEvents: 0, staleReads: 0 };
let CUR = null, INTENT = [];  // 지금 쓰는 사람, 이 동작이 일부러 지우는 칸
const clients = [];
function mkClient(id, dept, role, extra) {
  const c = Object.assign({ id, dept, role, name: id, uid: id, cache: {}, net: dept === "HK" ? 1.6 : 1, offUntil: 0, events: 0, peak: {}, actions: 0, busyMin: 0 }, extra || {});
  c.actor = { name: c.name, uid: c.uid, role: dept };
  clients.push(c); return c;
}
const cget = (c, cl) => (c.cache[cl] || (c.cache[cl] = new Map()));
function deliver(cl, id, data) {   // 실시간 전달: 기기마다 지연, 끊긴 기기는 다시 연결될 때 전체 다시 불러오기
  clients.forEach(c => {
    const d = logn(300 * c.net, 2500 * c.net);
    push(NOW + d, () => {
      if (NOW < c.offUntil) return;            // 끊김: 이 알림은 못 받음(재연결 때 load)
      cget(c, cl).set(id, JSON.parse(JSON.stringify(data)));
      c.events++; M.deliveredEvents++;
      const k = Math.floor((NOW - T0) / MIN); c.peak[k] = (c.peak[k] || 0) + 1;
    });
  });
}
function apply(cl, id, data, mode, intent, who) {
  const m = col(cl), old = m.get(id);
  let next;
  if (mode === "update") { if (!old) return; next = Object.assign({}, old, data); }
  else next = data;
  if (cl === "roomSvc" && old && mode === "set") {
    Object.keys(old).forEach(k => {
      if (k === "log" || k === "updatedAt") return;
      if (old[k] != null && (next[k] == null) && !intent.includes(k)) { M.lost.push({ t: hm(NOW), room: id.split("__")[1], field: k, by: who, hadBy: old[k] && old[k].by }); M.lostRooms.add(id); }
    });
  }
  m.set(id, JSON.parse(JSON.stringify(next)));
  M.writes++; M.byCol[cl] = (M.byCol[cl] || 0) + 1;
  deliver(cl, id, next);
}
let idn = 0;
ctx.OPS.Store = {
  async add(cl, data) {
    const id = "s" + (++idn), c = CUR, it = INTENT.slice();
    cget(c, cl).set(id, Object.assign({ id }, data));
    push(NOW + logn(150 * c.net, 1000 * c.net), () => apply(cl, id, Object.assign({ id }, data), "set", it, c.id));
    return id;
  },
  async set(cl, id, data) {
    const c = CUR, it = INTENT.slice();
    cget(c, cl).set(id, Object.assign({ id }, data));
    push(NOW + logn(150 * c.net, 1000 * c.net), () => apply(cl, id, Object.assign({ id }, data), "set", it, c.id));
  },
  async update(cl, id, patch) {
    const c = CUR, it = INTENT.slice();
    const cur = cget(c, cl).get(id); if (cur) cget(c, cl).set(id, Object.assign({}, cur, patch));
    push(NOW + logn(150 * c.net, 1000 * c.net), () => apply(cl, id, patch, "update", it, c.id));   // ops_patch: 서버에서 위쪽 키 병합
  }
};
async function act(c, fn, intent) { CUR = c; INTENT = intent || []; c.actions++; try { return await fn(); } catch (e) { (M.errors = M.errors || []).push(c.id + ": " + e.message); } finally { CUR = null; INTENT = []; } }
const svcOf = (c, id) => { const v = cget(c, "roomSvc").get(OPS.Svc.sid(DATE, id)); if (!v) return null; const o = Object.assign({}, v); delete o.id; return o; };
const truth = id => col("roomSvc").get(OPS.Svc.sid(DATE, id)) || {};

// ---------- 객실·손님 ----------
const DATE = "2026-11-27";
const rooms = [];
for (const [b, n, floors] of [["main", 95, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]], ["annex", 137, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]]]) {
  for (let i = 0; i < n; i++) { const f = floors[i % floors.length], no = String(f) + String(Math.floor(i / floors.length) + 1).padStart(2, "0"); rooms.push({ id: b + "-" + no, b, no, floor: f }); }
}
// 섞어서 40% 퇴실
const shuffled = rooms.slice().sort(() => rnd() - .5);
const nOut = Math.round(rooms.length * 0.4);
const outRooms = shuffled.slice(0, nOut), stayRooms = shuffled.slice(nOut);
stayRooms.forEach((r, i) => { r.kind = i % 3 === 0 ? "전체재실" : "재실청소"; });

// ---------- 직원 ----------
const FO = [], HK = [], INS = [], HM = [], FM = [];
for (let i = 1; i <= 7; i++) FO.push(mkClient("FO" + i, "FO", "front", { from: i <= 5 ? at("07:00") : at("11:00") }));
for (let i = 1; i <= 20; i++) HK.push(mkClient("RA" + i, "HK", "attendant", { b: i <= 8 ? "main" : "annex", free: at("08:30"), lunch: at(i % 2 ? "12:00" : "12:45") }));
for (let i = 1; i <= 3; i++) INS.push(mkClient("IN" + i, "HK", "inspector", { b: i === 1 ? "main" : "annex", free: at("09:30") }));
for (let i = 1; i <= 2; i++) HM.push(mkClient("HM" + i, "HK", "houseman", { free: at("08:00") }));
for (let i = 1; i <= 2; i++) FM.push(mkClient("FM" + i, "FM", "facility", { free: at("08:00") }));
HK.forEach((c, i) => { if (i % 10 === 3) c.net = 4; });   // 지하·계단실 등 약한 와이파이 기기
// 배정 모드: 룸메이드별 담당 객실(층 단위)
if (MODE === "assigned") {
  ["main", "annex"].forEach(b => {
    const ras = HK.filter(c => c.b === b), rs2 = rooms.filter(r => r.b === b).sort((a, c) => a.floor - c.floor || a.no.localeCompare(c.no));
    rs2.forEach((r, i) => { r.ra = ras[Math.floor(i / Math.ceil(rs2.length / ras.length))].id; });
  });
}

// ---------- 시나리오 ----------
const room = id => rooms.find(r => r.id === id);
const roomObj = r => ({ b: r.b, no: r.no, building: r.b === "main" ? "본관" : "신관" });
const foOn = () => FO.filter(c => NOW >= c.from);
const foPick = () => { const on = foOn(); on.sort((a, b) => a.busyUntil - b.busyUntil || 0); return on.find(c => !(c.busyUntil > NOW)) || on[0]; };
FO.forEach(c => { c.busyUntil = 0; });
const foWork = (c, sec) => { c.busyMin += sec / 60; c.busyUntil = Math.max(c.busyUntil || 0, NOW) + sec * 1000; };
const ST = { stillIn: 0, late: 0, prio: 0, express: 0, defects: 0, repairOverlap: [], dupStart: [], dupDeliv: 0, wastedWalkMin: 0, ackByOther: 0, hkBlinkSeen: 0, readyAt: {}, inspWait: [], foReqSec: 0, foStayReqN: 0, delivN: 0, delivWait: [] };

// 1) 퇴실: 07:30~11:30, 10시~11시 몰림. 10% 레이트, 15%는 프론트 거치지 않고 나감(키핑이 확인)
outRooms.forEach(r => {
  const late = rnd() < 0.10, express = !late && rnd() < 0.15;
  r.leave = late ? at(pick(["12:00", "12:30", "13:00", "14:00"])) : at("07:30") + Math.max(0, Math.min(240, norm(170, 45))) * MIN;
  r.late = late; r.express = express;
  if (late) push(at("08:00") + rnd() * 120 * MIN, async () => { const c = foPick(); await act(c, () => OPS.Svc.late(DATE, r.id, svcOf(c, r.id), c.actor, hm(r.leave))); foWork(c, 20); ST.late++; });
  if (!express) push(r.leave + rnd() * 3 * MIN, async () => { const c = foPick(); await act(c, () => OPS.Svc.checkout(DATE, r.id, svcOf(c, r.id), c.actor, roomObj(r))); foWork(c, 45); });
});
// 우선 준비: 당일 입실 중 12실은 이른 입실(12~14시) 요청 → 프론트가 08~10시에 건다
outRooms.slice(0, 12).forEach(r => { r.prio = at(pick(["12:00", "13:00", "14:00"])); push(at("08:00") + rnd() * 120 * MIN, async () => { const c = foPick(); await act(c, () => OPS.Svc.prio(DATE, r.id, svcOf(c, r.id), c.actor, hm(r.prio))); foWork(c, 20); ST.prio++; }); });
// 2) 재실 요청: 손님 전화·메신저 08:00~11:30. 85% 청소 요청(시간대·종류), 15% 청소 X
stayRooms.forEach(r => {
  const t = at("08:00") + rnd() * 210 * MIN;
  r.refuse = rnd() < 0.15;
  const from = Math.max(10, Math.min(15, Math.round(norm(12, 1.5))));
  r.win = [String(from).padStart(2, "0") + ":00", String(from + 2).padStart(2, "0") + ":00"];
  push(t, async () => {
    const c = foPick();
    if (r.refuse) await act(c, () => OPS.Svc.replyRefuse(DATE, r.id, svcOf(c, r.id), c.actor, ""), ["done"]);
    else await act(c, () => OPS.Svc.request(DATE, r.id, svcOf(c, r.id), c.actor, { from: r.win[0], to: r.win[1], kinds: ["정비"], memo: rnd() < .2 ? "생수 2" : "" }), ["done"]);
    foWork(c, 40); ST.foReqSec += 40; ST.foStayReqN++;
  });
});
// 3) 불출: 07~18시 60건(오전·오후 몰림). 하우스맨 + 쉬는 룸메이드가 "가는 중"
for (let i = 0; i < 60; i++) {
  const r = pick(stayRooms.concat(outRooms)), t = at("07:00") + (rnd() < .5 ? norm(150, 60) : norm(540, 80)) * MIN;
  push(Math.max(at("07:00"), t), async () => { const c = foPick(); const d = await act(c, () => OPS.Desk.request({ roomId: r.id, b: r.b, building: roomObj(r).building, no: r.no, items: { big: 2, water: rnd() < .5 ? 2 : 0 }, method: "hang" }, c.actor)); foWork(c, 30); ST.delivN++; if (d) d.reqAt = NOW; });
}

// ---------- 키핑 행동 ----------
const inspQ = [];
function hkNext(c) {   // 룸메이드가 다음에 할 객실을 자기 화면(캐시) 기준으로 고른다
  const svc = id => { const v = cget(c, "roomSvc").get(OPS.Svc.sid(DATE, id)); return v || {}; };
  const mine = MODE === "assigned" ? rooms.filter(r => r.ra === c.id) : rooms.filter(r => r.b === c.b);
  const cand = [];
  mine.forEach(r => {
    const s = svc(r.id);
    if (r.mine === c.id || (c.skip && c.skip.has(r.id))) return;   // 이미 한 방, 가 보니 다른 사람이 하던 방
    if (outRooms.includes(r)) { if ((s.co) && !s.start && !s.done && !s.cleaned) cand.push({ r, rank: s.prio ? 0 : 1, key: s.prio ? s.prio.at : s.co.at }); }
    else if (s.reply && s.reply.type === "time" && !s.done && !s.start2) {
      const w = OPS.Svc.windowStart(s.reply.window); if (NOW >= T0 + (w - 7 * 60) * MIN) cand.push({ r, rank: 2, key: w });
    }
  });
  // 퇴실 전 객실 중 손님이 이미 나간 곳(키핑이 문 두드려 확인): 할 일이 없을 때
  if (!cand.length) mine.forEach(r => { const s = svc(r.id); if (outRooms.includes(r) && !s.co && !r.checkedByHk && r.express && NOW > r.leave) cand.push({ r, rank: 3, key: 0, express: true }); });
  if (!cand.length) mine.forEach(r => { const s = svc(r.id); if (outRooms.includes(r) && !s.co && !r.checkedByHk && !r.late && NOW > at("10:30")) cand.push({ r, rank: 4, key: 0, knock: true }); });
  cand.sort((a, b) => a.rank - b.rank || a.key - b.key);
  return cand[0];
}
async function hkLoop(c) {
  if (NOW >= at("17:30")) return;
  if (c.lunch && NOW >= c.lunch && !c.ate) { c.ate = true; push(NOW + 45 * MIN, () => hkLoop(c)); return; }
  if (rnd() < 0.03) { c.offUntil = NOW + (30 + rnd() * 90) * 1000; push(c.offUntil, () => reload(c)); }   // 엘리베이터·계단: 잠깐 끊김
  const n = hkNext(c);
  if (!n) { push(NOW + 4 * MIN, () => hkLoop(c)); return; }
  const r = n.r, walk = 2 + rnd() * 3;
  if (n.knock || n.express) {
    r.checkedByHk = true;
    push(NOW + walk * MIN, async () => {
      if (NOW >= r.leave) { ST.express += n.express ? 1 : 0; await act(c, () => OPS.Svc.hkCheckout(DATE, r.id, svcOf(c, r.id), c.actor, roomObj(r), false)); }
      else { ST.stillIn++; await act(c, () => OPS.Svc.stillIn(DATE, r.id, svcOf(c, r.id), c.actor)); r.checkedByHk = false; }
      hkLoop(c);
    });
    return;
  }
  // 도착해서 시작 누름 — 같은 방을 다른 사람이 먼저 시작했는지(서버 기준) 확인
  push(NOW + walk * MIN, async () => {
    const s = truth(r.id), isOut = outRooms.includes(r);
    const startedBy = isOut ? s.start && s.start.uid : r.stayBy;
    if (startedBy && startedBy !== c.id) { ST.dupStart.push({ t: hm(NOW), room: r.no, a: startedBy, b: c.id }); ST.wastedWalkMin += walk + 2; (c.skip = c.skip || new Set()).add(r.id); hkLoop(c); return; }
    if (isOut) await act(c, () => OPS.Svc.start(DATE, r.id, svcOf(c, r.id), c.actor)); else { r.stayBy = c.id; if (OPS.Svc.hkNeedsAck({ type: "stay", s: svcOf(c, r.id) || {} })) await act(c, () => OPS.Svc.ack(DATE, r.id, svcOf(c, r.id), c.actor)); }
    r.mine = c.id;
    const dur = isOut ? Math.max(22, norm(35, 7)) : r.kind === "전체재실" ? Math.max(15, norm(26, 5)) : Math.max(6, norm(12, 3));
    push(NOW + dur * MIN, async () => {
      if (isOut) {
        if (rnd() < 0.08) {   // 결함 발견 → 시설 업무
          ST.defects++;
          const t = await act(c, () => OPS.Core.createTask({ kind: "repair", title: pick(["욕실 배수 막힘", "에어컨 안 켜짐", "전등 나감", "도어락 배터리"]), room: r.no, building: r.b, roomId: r.id, toDept: "FM", priority: "주의" }, c.actor));
          if (t) { r.repair = { id: t.id, at: NOW }; FMQ.push(r); }
        }
        await act(c, () => OPS.Svc.cleaned(DATE, r.id, svcOf(c, r.id), c.actor));
        inspQ.push({ r, at: NOW });
      } else await act(c, () => OPS.Svc.done(DATE, r.id, svcOf(c, r.id), c.actor, 2, 2));
      hkLoop(c);
    });
  });
}
async function reload(c) { // 다시 연결되면 모음 전체를 다시 불러온다(store-supabase의 SUBSCRIBED → load)
  Object.keys(server).forEach(cl => { const m = new Map(); col(cl).forEach((v, k) => m.set(k, JSON.parse(JSON.stringify(v)))); c.cache[cl] = m; });
}
async function inspLoop(c) {
  if (NOW >= at("18:00")) return;
  const i = inspQ.findIndex(q => q.r.b === c.b) >= 0 ? inspQ.findIndex(q => q.r.b === c.b) : inspQ.findIndex(() => true);
  if (i < 0) { push(NOW + 3 * MIN, () => inspLoop(c)); return; }
  const q = inspQ.splice(i, 1)[0];
  ST.inspWait.push((NOW - q.at) / MIN);
  push(NOW + (2 + rnd() * 3 + Math.max(3, norm(6, 2))) * MIN, async () => {
    if (q.r.repair && !q.r.repair.fixed) ST.repairOverlap.push(q.r.no);   // 시스템이 막지 않는다: 수리 중인데 입실 가능
    await act(c, () => OPS.Svc.done(DATE, q.r.id, svcOf(c, q.r.id), c.actor, 2, 2));
    ST.readyAt[q.r.id] = NOW;
    inspLoop(c);
  });
}
// 하우스맨·불출: 열린 요청을 자기 화면 기준으로 잡는다
async function hmLoop(c) {
  if (NOW >= at("18:00")) return;
  const open = Array.from(cget(c, "deliveries").values()).filter(d => !d.go && !d.done && !d.cancel).sort((a, b) => a.at - b.at);
  if (!open.length) { push(NOW + 2 * MIN, () => hmLoop(c)); return; }
  const d = open[0];
  await act(c, () => OPS.Desk.go(d, c.actor));
  const sv = col("deliveries").get(d.id) || {};
  if (sv.go && sv.go.uid !== c.id) ST.dupDeliv++;
  push(NOW + Math.max(4, norm(10, 3)) * MIN, async () => {
    const srv = col("deliveries").get(d.id) || {};
    if (srv.done) { ST.dupDeliv++; ST.wastedWalkMin += 8; } else { await act(c, () => OPS.Desk.done(d, c.actor)); ST.delivWait.push((NOW - d.at) / MIN); }
    hmLoop(c);
  });
}
// 시설
const FMQ = [];
async function fmLoop(c) {
  if (NOW >= at("18:00")) return;
  const r = FMQ.shift();
  if (!r) { push(NOW + 5 * MIN, () => fmLoop(c)); return; }
  push(NOW + Math.max(15, norm(35, 12)) * MIN, async () => { r.repair.fixed = NOW; const t = cget(c, "tasks").get(r.repair.id); if (t) await act(c, () => OPS.Core.move(Object.assign({ id: r.repair.id }, t), "진행 중", c.actor)); fmLoop(c); });
}
// 프론트: 입실 가능 확인(깜빡임 끄기), 키핑 "손님 아직 있음"에 답
async function foLoop() {
  if (NOW >= at("18:00")) return;
  const c = foPick();
  for (const r of outRooms) {
    const s = svcOf(c, r.id); if (!s) continue;
    const row = { type: "out", s };
    if (OPS.Svc.foNeedsAck(row)) { await act(c, () => OPS.Svc.foAck(DATE, r.id, s, c.actor)); foWork(c, 5); }
    else if (OPS.Svc.foNeeds(row) && !r.answered) { r.answered = true; await act(c, () => OPS.Svc.late(DATE, r.id, s, c.actor, hm(Math.max(r.leave, NOW + 30 * MIN)))); foWork(c, 60); }
  }
  push(NOW + 3 * MIN, foLoop);
}
// 키핑 깜빡임: 다른 룸메이드가 "확인"을 누르면 모두의 깜빡임이 꺼진다(확인이 공용)
function blinkAudit() {
  HK.forEach(c => { rooms.forEach(r => { const s = svcOf(c, r.id); if (s && OPS.Svc.hkNeedsAck({ type: outRooms.includes(r) ? "out" : "stay", s })) ST.hkBlinkSeen++; }); });
  if (NOW < at("17:00")) push(NOW + 10 * MIN, blinkAudit);
}

HK.forEach(c => push(c.free, () => hkLoop(c)));
INS.forEach(c => push(c.free, () => inspLoop(c)));
HM.forEach(c => push(c.free, () => hmLoop(c)));
FM.forEach(c => push(c.free, () => fmLoop(c)));
push(at("09:00"), foLoop);
push(at("09:00"), blinkAudit);

// ---------- 돌리기 ----------
(async () => {
  while (queue.length) {
    queue.sort((a, b) => a.t - b.t || a.k - b.k);
    const e = queue.shift();
    if (e.t > at("19:00")) break;
    NOW = Math.max(NOW, e.t);
    await e.fn();
  }
  // ---------- 결과 ----------
  const ready = outRooms.map(r => ST.readyAt[r.id]).filter(Boolean).sort((a, b) => a - b);
  const notReady15 = outRooms.filter(r => !(ST.readyAt[r.id] <= at("15:00"))).length;
  const prioMiss = outRooms.filter(r => r.prio && !(ST.readyAt[r.id] <= r.prio)).length;
  const stayDone = stayRooms.filter(r => (truth(r.id).done)).length, stayWant = stayRooms.filter(r => !r.refuse).length;
  const stayLate = stayRooms.filter(r => !r.refuse && truth(r.id).done && truth(r.id).done.at > at(r.win[1])).length;
  const logFull = Array.from(col("roomSvc").values()).filter(d => (d.log || []).length >= 12).length;
  const peakPerClient = Math.max(...clients.map(c => Math.max(0, ...Object.values(c.peak))));
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
  const p90 = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return +s[Math.floor(s.length * .9)].toFixed(1); };
  const lostBy = {}; M.lost.forEach(l => { lostBy[l.field] = (lostBy[l.field] || 0) + 1; });
  const out = {
    mode: MODE, seed: SEED, rooms: rooms.length, checkout: outRooms.length, stay: stayRooms.length,
    staff: { FO: FO.length, RA: HK.length, INS: INS.length, HM: HM.length, FM: FM.length },
    readiness: { firstReady: ready.length ? hm(ready[0]) : "-", lastReady: ready.length ? hm(ready[ready.length - 1]) : "-", readyBy15: outRooms.length - notReady15, notReadyBy15: notReady15, prioRooms: 12, prioMissed: prioMiss, inspWaitAvgMin: avg(ST.inspWait), inspWaitP90Min: p90(ST.inspWait) },
    stays: { wanted: stayWant, refused: stayRooms.length - stayWant, done: stayDone, doneAfterWindow: stayLate },
    front: { stayRequestsTyped: ST.foStayReqN, stayRequestTypingMin: Math.round(ST.foReqSec / 60), busyMinPerPerson: FO.map(c => Math.round(c.busyMin)), lateSet: ST.late, prioSet: ST.prio, deliveriesAsked: ST.delivN },
    housekeeping: { duplicateStarts: ST.dupStart.length, dupExamples: ST.dupStart.slice(0, 5), wastedWalkMin: Math.round(ST.wastedWalkMin), stillInVisits: ST.stillIn, hkConfirmedCheckout: ST.express, blinkRowViews: ST.hkBlinkSeen },
    deliveries: { requests: ST.delivN, doubleHandled: ST.dupDeliv, waitAvgMin: avg(ST.delivWait), waitP90Min: p90(ST.delivWait) },
    facility: { defects: ST.defects, readyWhileRepairOpen: ST.repairOverlap.length, rooms: ST.repairOverlap },
    data: { writes: M.writes, byCol: M.byCol, realtimeDeliveries: M.deliveredEvents, realtimePerDayPer34: M.deliveredEvents, peakEventsPerClientPerMin: peakPerClient, roomDocsLogAtCap12: logFull },
    lostUpdates: { count: M.lost.length, rooms: M.lostRooms.size, byField: lostBy, examples: M.lost.slice(0, 8) },
    errors: (M.errors || []).slice(0, 5), errorCount: (M.errors || []).length
  };
  console.log(JSON.stringify(out, null, 1));
})();
