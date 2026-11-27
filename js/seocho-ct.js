/* 서초 예약표·청소표 해석 모듈 (UHC NIGHT AUDIT SEOCHO 관리자용 V0.61의 CT 모듈을 그대로 복사).
   원본: artifact 90f25fc5-966f-44ee-b5a5-9aa04ba54229, 버전 1795402629-1978. 원본은 수정하지 않는다.
   여기서는 객실 기준 정보와 그날의 퇴실·입실·연박·청소 유형만 꺼내 쓴다. 이름·연락처·예약번호는 저장하지 않는다. */
(function (G) {
const OPS = G.OPS = G.OPS || {};
OPS.SeochoCT = function() {
const EPOCH = Date.UTC(1899, 11, 30);
const isoOfSerial = n => new Date(EPOCH + Math.round(n) * 864e5).toISOString().slice(0, 10);
const s = v => (v === null || v === undefined ? "" : String(v)).trim();
const addDays = (iso, n) => {
const d = new Date(iso + "T00:00:00Z");
d.setUTCDate(d.getUTCDate() + n);
return d.toISOString().slice(0, 10);
};
const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const CH_RE = /(아고다|고다|트립|씨트립|익스|부킹|야놀자|여기어때|스테이션|디다|다트래블|웹베즈|현장결제|에어비앤비|비엔비|네이버|트래블로카|올마이투어|직접결제|B2B)/;
const chOf = cm => {
const m = s(cm).match(CH_RE);
if (!m) return "";
const k = m[1];
return /고다/.test(k) ? "아고다" : /트립/.test(k) ? "트립" : /다트래블|디다/.test(k) ? "디다" : /비엔비|에어비앤비/.test(k) ? "에어비앤비" : k;
};
const OCC_TXT = /^(VIP|UHC|마케팅|본사|CELL|하자발생|무료숙박권|Miss)(?![A-Za-z0-9가-힣])/i;
const txtKey = t => (String(t || "").match(OCC_TXT) || [ "" ])[0].toUpperCase();
const BLDG = {
main: "본관",
annex: "신관"
};
const fnv = t => {
let h = 2166136261;
for (let i = 0; i < t.length; i++) {
h ^= t.charCodeAt(i);
h = Math.imul(h, 16777619) >>> 0;
}
return h.toString(36);
};
const kdate = t => {
const m = String(t || "").match(/(20\d{2})\s*[년.\/-]\s*(\d{1,2})\s*[월.\/-]\s*(\d{1,2})/);
return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};
const NAME_LB = /^(투숙객\s*이름|예약자\s*명|예약자\s*이름|예약자|투숙자\s*명|투숙자\s*이름|고객\s*명|고객\s*이름|이용자\s*성함|성함|이름|guest\s*name\(?s?\)?|guest\s*names|lead\s*guest|guest)$/i;
const NM_STOP = /^(예약번호|예약자명|예약자|예약정보|예약상태|예약내역|예약일|체크인|체크아웃|투숙객|투숙기간|고객|고객명|이름|성함|국적|요청사항|결제|입금|현장|숙박|예약확정|미확인|인쇄|도보|차량|확정|예약|객실|연박|연장|성인|아동|대한민국|미국|일본|중국|대만|확정된예약|연락처정보|없음|정보|요청|문의|조식|주차|none|na|ok|confirmed|booking|number|status|hotel|name|names|guest|guests|room|adult|adults|children|child|type|date|dates|double|twin|suite|studio|deluxe|standard|family|main|building|new|wings|only|free|wifi|expedia|agoda|trip|collect|bed|city|seoul|korea|address|hotel)$/i;
const MSG_LB = /^(왓츠앱|와츠앱|whats\s*app|카톡|카카오톡|카카오|위챗|wechat|라인|line)\s*[:：]?\s*(\S.{2,40})$/i;
function nameKey(v) {
v = String(v || "").trim();
if (!v || /\*|\d|@/.test(v)) return "";
v = v.split(/[,;]|\s+and\s+|&/i)[0].trim();
if (/[가-힣]/.test(v)) {
const n = v.replace(/[^가-힣]/g, "");
return n.length >= 2 && n.length <= 5 && !NM_STOP.test(n) ? n : "";
}
const t = v.toLowerCase().split(/[^a-z]+/).filter(x => x && !/^(mr|mrs|ms|miss|dr|mstr)$/.test(x));
if (t.length < 2 || t.length > 4 || t.some(x => NM_STOP.test(x)) || t.join("").length < 4) return "";
return t.sort().join(" ");
}
function idKeys(cm) {
const out = {
ids: [],
ci: "",
co: ""
};
if (!cm) return out;
const L = String(cm).split(/\r?\n/).map(x => x.trim());
const add = k => {
if (out.ids.indexOf(k) < 0 && out.ids.length < 24) out.ids.push(k);
};
const next = i => {
let j = i + 1;
while (j < L.length && !L[j]) j++;
return L[j] || "";
};
const addName = (v, strong) => {
v = String(v || "");
const parts = v.split(/[,;]/).slice(0, 3);
parts.forEach(p => {
const k = nameKey(p);
if (k) add((strong ? "n" : "q") + fnv(k));
});
};
let first = "", last = "";
L.forEach((l, i) => {
if (!l) return;
if (NAME_LB.test(l.replace(/\s*[:：]$/, ""))) addName(next(i), true);
const il = l.match(/^(투숙객\s*이름|예약자\s*명|예약자\s*이름|예약자|투숙자\s*명|고객\s*명|이용자\s*성함|성함|이름|guest\s*name\(?s?\)?)\s*[:：]\s*(.+)$/i);
if (il) addName(il[2], true);
const tb = l.split("\t").map(x => x.trim()).filter(Boolean);
if (tb.length > 1) tb.forEach((t, j) => {
if (j + 1 < tb.length && /^(guest\s*name\(?s?\)?|lead\s*guest|투숙객\s*이름|예약자\s*명)$/i.test(t)) addName(tb[j + 1], true);
if (j + 1 < tb.length && /^customer\s*first\s*name$/i.test(t)) first = tb[j + 1];
if (j + 1 < tb.length && /^customer\s*last\s*name$/i.test(t)) last = tb[j + 1];
});
const ms = l.match(MSG_LB);
if (ms) {
const id = ms[2].toLowerCase().replace(/\s+/g, "").replace(/^[:：]/, "");
if (id.length >= 3) add("m" + fnv(id));
}
if (/^예약\s*번호\s*:?$/.test(l)) {
const v = next(i).replace(/\D/g, "");
if (v.length >= 5) add("b" + fnv(v));
}
if (l === "체크인" && !out.ci) out.ci = kdate(next(i));
if (l === "체크아웃" && !out.co) out.co = kdate(next(i));
const rg = l.match(/(20\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})\s*[-~∼]\s*(20\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})/);
if (rg && !out.ci) {
out.ci = kdate(rg[1]);
out.co = kdate(rg[2]);
}
if (!out.ci && /\[(Main Building|New Wings|본관|신관)\]/i.test(l)) {
const ds = l.match(/20\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g);
if (ds && ds.length >= 2) {
const x = kdate(ds[0]), y = kdate(ds[1]), n = Math.round((Date.parse(y) - Date.parse(x)) / 864e5);
if (n >= 1 && n <= 90) {
out.ci = x;
out.co = y;
}
}
}
const p = l.match(/(?:^|[^\d])(01[016789])[\s-]?(\d{3,4})[\s-]?(\d{4})(?!\d)/);
if (p) add("p" + fnv((p[2] + p[3]).slice(-8)));
if (/^(?:\d{4}[ -]\d{4,6}[ -]\d{4,5}|\d{13,19})/.test(l)) return;
if (/20\d{2}\s*[-\/.년]\s*\d{1,2}|\d{1,2}:\d{2}/.test(l)) return;
(l.match(/(?<![\d-])\d{8,16}(?![\d-])/g) || []).forEach(x => {
if (!/^01[016789]/.test(x) && !/^20\d{6}$/.test(x)) add("b" + fnv(x));
});
});
if (first && last) addName(first + " " + last, true);
const ci = L.findIndex(l => / - /.test(l) && CH_RE.test(l) && l.length <= 30);
if (ci >= 0) {
const nx = L.slice(ci + 1).filter(Boolean).slice(0, 2);
for (const v of nx) {
const k = nameKey(v.replace(/\t.*/, ""));
if (k) {
add("q" + fnv(k));
break;
}
}
}
if (!out.ci) {
const DO = /^(20\d{2})\s*[년.\/-]\s*(\d{1,2})\s*[월.\/-]\s*(\d{1,2})\s*일?$/;
const D = L.filter(Boolean);
for (let i = 0; i + 1 < D.length; i++) {
if (!DO.test(D[i]) || !DO.test(D[i + 1])) continue;
const a = kdate(D[i]), c = kdate(D[i + 1]);
const n = Math.round((Date.parse(c) - Date.parse(a)) / 864e5);
const nx = D.slice(i + 2, i + 5);
const nl = nx.map(x => x.match(/^(\d{1,3})\s*박$/)).find(Boolean);
const ok = nl ? +nl[1] === n : nx.some(x => /^\[(본관|신관)\]|^\d{1,2}\s*객실$/.test(x));
if (n >= 1 && n <= 90 && ok) {
out.ci = a;
out.co = c;
break;
}
}
}
return out;
}
const ID_KIND = {
n: "이름",
q: "이름",
m: "메신저",
p: "전화",
b: "예약번호"
};
const pkey = x => (x[0] === "q" ? "n" : x[0]) + x.slice(1);
function sameIds(a, b, only) {
if (!a || !b || !a.ids || !b.ids) return [];
const bs = b.ids.map(pkey), k = {};
a.ids.forEach(x => {
if (only && only.indexOf(x[0]) < 0) return;
if (bs.indexOf(pkey(x)) >= 0) k[ID_KIND[x[0]]] = 1;
});
return Object.keys(k);
}
const samePerson = (a, b) => sameIds(a, b, "nqmp");
const sameBooking = (a, b) => sameIds(a, b, "b").length > 0;
function namesDiffer(a, b) {
if (!a || !b || !a.ids || !b.ids) return false;
const na = a.ids.filter(x => x[0] === "n" || x[0] === "q").map(pkey), nb = b.ids.filter(x => x[0] === "n" || x[0] === "q").map(pkey);
return na.length > 0 && nb.length > 0 && !na.some(x => nb.indexOf(x) >= 0);
}
const md = iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
function readStays(wb) {
const out = {
main: null,
annex: null
};
wb.SheetNames.forEach(n => {
const m = String(n).trim().match(/^(\d{4})\((본관|신관)\)$/);
if (!m || !wb.Sheets[n]) return;
const b = m[2] === "본관" ? "main" : "annex";
const r = readSheet(wb.Sheets[n]);
if (!r) return;
if (!out[b]) out[b] = {
rooms: {}
};
Object.entries(r).forEach(([room, x]) => {
const o = out[b].rooms[room] || (out[b].rooms[room] = {
dong: x.dong,
label: x.label,
cells: {}
});
if (!o.dong) o.dong = x.dong;
if (!o.label) o.label = x.label;
Object.assign(o.cells, x.cells);
});
});
const seen = {};
[ "main", "annex" ].forEach(b => out[b] && Object.entries(out[b].rooms).forEach(([room, R]) => Object.values(R.cells).forEach(x => (x.ids || []).forEach(k => {
const kk = pkey(k), mk = kk[0] === "b" ? kk : kk + "|" + x.s.slice(0, 7);
(seen[mk] = seen[mk] || {})[b + room] = 1;
}))));
const common = {};
Object.keys(seen).forEach(k => {
if (Object.keys(seen[k]).length >= (k[0] === "b" ? 4 : 15)) common[k.split("|")[0]] = 1;
});
[ "main", "annex" ].forEach(b => out[b] && Object.values(out[b].rooms).forEach(R => Object.values(R.cells).forEach(x => {
if (x.ids) x.ids = x.ids.filter(k => !common[pkey(k)]);
})));
return out;
}
function readSheet(ws) {
const R = XLSX.utils.decode_range(ws["!ref"]);
const g = (r, c) => ws[XLSX.utils.encode_cell({
r: r,
c: c
})];
let dateRow = -1, best = 0;
for (let r = 0; r <= Math.min(R.e.r, 12); r++) {
let n = 0;
for (let c = 0; c <= R.e.c; c += 7) {
const x = g(r, c);
if (x && x.t === "n" && x.v > 4e4 && x.v < 6e4) n++;
}
if (n > best) {
best = n;
dateRow = r;
}
}
if (dateRow < 0) return null;
const dc = {};
for (let c = 0; c <= R.e.c; c++) {
const x = g(dateRow, c);
if (x && x.t === "n" && x.v > 4e4 && x.v < 6e4) dc[c] = isoOfSerial(x.v);
}
let roomCol = -1, nameCol = -1, dongCol = -1;
for (let r = Math.max(0, dateRow - 2); r <= dateRow + 1; r++) for (let c = 0; c < 20; c++) {
const v = s((g(r, c) || {}).v);
if (v === "호수") roomCol = c;
if (v === "객실명") nameCol = c;
if (v === "동") dongCol = c;
}
if (roomCol < 0) return null;
const typeByRow = {};
(ws["!merges"] || []).forEach(m => {
if (nameCol >= 0 && m.s.c === nameCol && m.e.c === nameCol) {
const v = (g(m.s.r, nameCol) || {}).v;
for (let r = m.s.r; r <= m.e.r; r++) typeByRow[r] = v;
}
});
const span = {};
(ws["!merges"] || []).forEach(m => {
if (m.s.r === m.e.r && dc[m.s.c] !== undefined) span[m.s.r + "|" + m.s.c] = m.e.c;
});
const covered = {};
Object.keys(span).forEach(k => {
const [r, c] = k.split("|").map(Number);
for (let cc = c + 1; cc <= span[k]; cc++) covered[r + "|" + cc] = 1;
});
const out = {};
for (let r = dateRow + 1; r <= R.e.r; r++) {
const rv = s((g(r, roomCol) || {}).v);
if (!/^\d{3,4}$/.test(rv)) continue;
const cells = {};
Object.keys(dc).forEach(cs => {
const c = +cs;
if (covered[r + "|" + c]) return;
const x = g(r, c);
if (!x) return;
const end = span[r + "|" + c] !== undefined ? span[r + "|" + c] : c;
const occ = x.t === "n" || OCC_TXT.test(s(x.v));
if (!occ) return;
const cm = (x.c || []).map(k => k.t || "").join("\n");
let last = dc[c];
for (let cc = c; cc <= end; cc++) if (dc[cc]) last = dc[cc];
const ik = idKeys(cm);
cells[dc[c]] = {
s: dc[c],
e: last,
ch: chOf(cm),
ext: /연장/.test(cm),
txt: x.t === "n" ? "" : s(x.v),
z: x.t === "n" && x.v === 0,
a: x.t === "n" ? x.v : null,
cci: ik.ci,
cco: ik.co,
ids: ik.ids,
rc: [ r, c, end ]
};
});
out[String(+rv)] = {
dong: dongCol >= 0 ? s((g(r, dongCol) || {}).v) : "",
label: s(typeByRow[r] !== undefined ? typeByRow[r] : (g(r, nameCol) || {}).v),
cells: cells
};
}
return out;
}
function cellAt(room, d) {
for (const k in room.cells) {
const x = room.cells[k];
if (x.s <= d && d <= x.e) return x;
}
return null;
}
function monthSplitApart(a, b) {
if (sameIds(a, b).length) return false;
if (a.cco && a.cco > b.s || b.cci && b.cci < b.s) return false;
return a.cco === b.s && b.cci === b.s;
}
function isLinked(a, b) {
if (b.ext) return true;
if (a.txt && b.txt && txtKey(a.txt) === txtKey(b.txt)) return true;
return b.s.slice(8) === "01" && (!b.ch || !a.ch || b.ch === a.ch) && !monthSplitApart(a, b);
}
function stayStart(room, cell) {
let cur = cell, hops = 0;
while (cur && hops < 40) {
const prev = cellAt(room, addDays(cur.s, -1));
if (!prev) break;
const linked = isLinked(prev, cur);
if (!linked) break;
cur = prev;
hops++;
}
return cur.s;
}
function stayEnd(room, cell) {
let cur = cell, hops = 0;
while (cur && hops < 40) {
const nx = cellAt(room, addDays(cur.e, 1));
if (!nx) break;
const linked = isLinked(cur, nx);
if (!linked) break;
cur = nx;
hops++;
}
return cur.e;
}
function generate(stays, T, history, master, hdone) {
history = history || {};
hdone = hdone || {};
master = master || {
main: {},
annex: {}
};
const Y = addDays(T, -1);
const res = {
date: T,
main: [],
annex: [],
stats: {}
};
const dupIx = {};
[ "main", "annex" ].forEach(b => stays[b] && Object.entries(stays[b].rooms).forEach(([room, R]) => {
const c = cellAt(R, Y);
if (!c || !c.ids) return;
c.ids.forEach(k => {
if (k[0] === "b") (dupIx[k] = dupIx[k] || []).push({
b: b,
room: room,
z: c.z,
a: c.a,
s: c.s,
e: c.e
});
});
}));
const inIx = {};
[ "main", "annex" ].forEach(b => stays[b] && Object.entries(stays[b].rooms).forEach(([room, R]) => {
const c = cellAt(R, T);
if (!c || c.s !== T || !c.ids) return;
c.ids.forEach(k => {
if (/[nqmp]/.test(k[0])) (inIx[pkey(k)] = inIx[pkey(k)] || []).push({
b: b,
room: room
});
});
}));
const hasIds = [ "main", "annex" ].some(b => stays[b] && Object.values(stays[b].rooms).some(R => Object.values(R.cells).some(x => x.ids)));
res.idCheck = hasIds;
[ "main", "annex" ].forEach(b => {
const S = stays[b];
if (!S) return;
Object.entries(S.rooms).forEach(([room, R]) => {
const last = cellAt(R, Y);
if (!last) return;
const ms = (master[b] || {})[room] || {};
const row = {
b: b,
room: room,
dong: ms.dong || R.dong || "",
label: ms.label || "",
c: ms.c,
u: ms.u,
sheetLabel: R.label,
kind: "",
day: null,
checkin: null,
checkout: null,
today: "",
flags: []
};
const end = stayEnd(R, last);
const startCell = cellAt(R, T);
if (end === Y) {
row.kind = "객실청소";
row.today = "당일";
if (!startCell) row.info = [ "오늘 들어올 예약 없음(예약표 기준)" ];
if (startCell && startCell.s === T) {
if (startCell.ch && last.ch && startCell.ch === last.ch && !startCell.txt && !last.txt) row.sameCh = true;
}
if (last.txt || startCell && startCell.txt) row.flags.push(`예약표 표기 "${startCell && startCell.txt || last.txt}" — 퇴실/재실 확인`);
row.risk = [];
if (last.txt && txtKey(last.txt) !== "UHC") row.risk.push(`예약표 ${last.txt} 표기 — 정말 퇴실인지`);
row.state = startCell && startCell.s === T ? "퇴실·입실" : "퇴실";
if (startCell && startCell.s === T && !last.txt && !startCell.txt) {
const ps = stayStart(R, last), p0 = last.cci && last.cci < ps ? last.cci : ps;
const pn = diff(p0, T), ne = startCell.cco && startCell.cci === startCell.s ? startCell.cco : addDays(stayEnd(R, startCell), 1), nn = diff(T, ne);
if (pn >= 5 && nn >= 5) row.risk.push(`${pn}박 장기 투숙 퇴실 날 같은 방에 ${nn}박 예약 체크인(${last.ch || "?"}→${startCell.ch || "?"}) — 같은 손님 재예약(연박)인지`);
}
if (last.ids) {
const mv = {};
last.ids.forEach(k => {
if (!/[nqmp]/.test(k[0]) || !inIx[pkey(k)]) return;
inIx[pkey(k)].forEach(o => {
if (o.b === b && o.room === room) return;
mv[BLDG[o.b] + o.room] = 1;
});
});
const ml = Object.keys(mv);
if (ml.length && ml.length <= 2) row.risk.push(`어제 손님과 같은 이름·연락처로 오늘 ${ml.join("·")} 체크인 — 방 이동(연박)인지`);
}
if (startCell && startCell.s === T && T.slice(8) === "01" && (!startCell.ch || !last.ch || startCell.ch === last.ch) && !startCell.ext) row.info = (row.info || []).concat([ `월경계 — 예약 상세상 어제 손님 ${md(T)} 퇴실·오늘 손님 ${md(T)} 체크인(다른 예약)` ]);
if (startCell && startCell.s === T && T.slice(8) === "01" && last.bl === "R" && startCell.bf === "R") row.risk.push(`빨간 테두리로 월 분할(같은 숙박) 표시인데 예약 상세상 다른 예약 — 퇴실인지 연박인지`);
if (startCell && startCell.s === T) {
const sm = sameIds(last, startCell);
if (sm.length) row.risk.push(`어제 손님과 오늘 손님의 ${sm.join("·")} 같음 — 퇴실 아니고 연박인지`);
if (startCell.cci && startCell.cci < T && startCell.cci >= addDays(T, -60)) row.risk.push(`오늘 예약 상세상 체크인 ${md(startCell.cci)} — 어제부터 묵던 손님인지`);
}
if (last.cco && last.cco > T && last.cco <= addDays(T, 120)) row.risk.push(`어제 손님 예약 상세상 ${md(last.cco)} 퇴실 — 예약표는 오늘 퇴실(조기퇴실·칸 나뉨 확인)`);
} else {
const ci = stayStart(R, last);
row.checkin = ci;
row.checkout = addDays(end, 1);
const d = diff(ci, T);
row.day = d;
let anchor = null, lastF = null;
for (let k = 1; k <= Math.min(d - 1, 31); k++) {
const dd = addDays(T, -k);
if (dd < ci) break;
const h = history[dd] && history[dd][b];
const dn = hdone[dd] && hdone[dd][b];
const marked = !!(dn && dn.full && dn.full[room]);
if (h && h[room] === "전체재실" || marked) {
lastF = dd;
if (!marked && dn && !dn.low && !dn.rooms[room]) break;
anchor = dd;
if (marked) row.marked = dd;
break;
}
}
if (!anchor && !lastF) {
const yd = hdone[Y] && hdone[Y][b];
const tg = yd && yd.tag && yd.tag[room];
if (tg && tg >= ci && tg < T) {
anchor = tg;
row.fromTag = tg;
}
}
const CY = (typeof OPS !== "undefined" && OPS.CTX && +OPS.CTX.stayCycle) || 3;   // [web] 전체 청소 주기(설정, 기본 3일)
const base = d % CY === CY - 1;
const lastTxt = txtKey(last.txt);
if (lastTxt === "UHC") {
row.kind = "전체재실";
row.info = [ "UHC 객실 — 매일 전체재실" ];
} else if (lastF && !anchor) {
row.kind = "전체재실";
row.carry = lastF;
row.info = [ `전체재실 이월 — ${lastF.slice(5)} 정비 안 됨` ];
} else if (anchor) {
const da = diff(anchor, T);
const byAnchor = da % CY === 0;
row.kind = byAnchor ? "전체재실" : "재실청소";
const ad = diff(ci, anchor);
if (ad % CY !== CY - 1) {
row.flags.push(`사이클 변경 — ${anchor.slice(5)} 전체재실 기준(원래 주기면 ${base ? "전체재실" : "재실청소"})`);
row.anchor = anchor;
}
} else {
row.kind = base ? "전체재실" : "재실청소";
}
if (d >= 3 && !row.carry && lastTxt !== "UHC") {
const a0 = row.anchor || anchor;
let due = null;
for (let k = 1; k <= Math.min(d - 1, 31); k++) {
const dd = addDays(T, -k);
if (dd <= ci) break;
const isDue = a0 ? diff(a0, dd) % CY === 0 && dd > a0 : diff(ci, dd) % CY === CY - 1;
if (isDue) {
due = dd;
break;
}
}
if (due && history[due] && history[due][b] && history[due][b][room] && history[due][b][room] !== "전체재실" && row.kind !== "전체재실" && !(hdone[due] && hdone[due][b] && hdone[due][b].full && hdone[due][b].full[room])) {
row.kind = "전체재실";
row.overdue = due;
row.info = (row.info || []).concat([ `전체재실 예정일 ${due.slice(5)}에 ${history[due][b][room]}로 적혀 오늘 전체재실(이월)` ]);
} else if (due && !(history[due] && history[due][b])) row.flags.push(`직전 전체재실 예정일 ${due.slice(5)} 청소표 없음 — 그날 실제로 했는지 확인`); else if (due && history[due][b][room] && history[due][b][room] !== "전체재실") row.flags.push(`${due.slice(5)} 전체재실 예정이었는데 ${history[due][b][room]}로 적힘 — 사이클 확인`);
}
const yh = history[Y] && history[Y][b] && history[Y][b][room];
if (yh === "전체재실" && row.kind === "전체재실" && !row.carry && lastTxt !== "UHC") row.flags.push("어제도 전체재실");
if (lastTxt === "MISS" || txtKey(startCell && startCell.txt) === "MISS") row.flags.push("예약표 Miss 표기 — 실제 투숙·빈방 확인");
if (yh === "객실청소" && ci < Y) row.flags.push("어제는 객실청소(퇴실)로 적힘 — 예약 연결 확인");
row.risk = [];
if (lastTxt === "MISS" || txtKey(startCell && startCell.txt) === "MISS") row.risk.push("예약표 Miss — 실제 투숙인지");
else if (last.txt && lastTxt !== "UHC") row.risk.push(`예약표 ${last.txt} 표기 — 실제 투숙인지`);
if (yh === "객실청소" && ci < Y) row.risk.push("어제 청소표엔 퇴실 — 계속 묵는지");
if (startCell && startCell.s === T && startCell.ext && startCell.ch && last.ch && startCell.ch !== last.ch && !samePerson(last, startCell).length) row.risk.push(`예약표 연장 표시인데 채널이 바뀜(${last.ch}→${startCell.ch}) — 같은 손님인지`);
const sg = hdone[Y] && hdone[Y][b] && hdone[Y][b].sig && hdone[Y][b].sig[room];
if (sg) row.risk.push(`어제 메모 '${sg}' — 계속 묵는지`);
row.state = "연박";
if (startCell && startCell !== last && startCell.s === T) {
const sp = samePerson(last, startCell);
if (sp.length && !sameBooking(last, startCell)) row.risk.push(`어제·오늘 칸이 다른 예약인데 손님 ${sp.join("·")} 같음(${last.ch || "?"}→${startCell.ch || "?"}) — 연박(연장) 맞는지`);
}
if (startCell && startCell !== last && startCell.s === T && T.slice(8) === "01" && !startCell.ext && !(last.txt && startCell.txt)) {
const known = S.borders && last.bl !== undefined && startCell.bf !== undefined;
const redAny = known && (last.bl || startCell.bf);
const evid = sameIds(last, startCell).length || last.cco && last.cco > T || startCell.cci && startCell.cci < T;
if (known && !redAny) row.risk.push(`월초 칸 나뉨인데 빨간 테두리로 묶여 있지 않음 — 같은 숙박(월 분할)인지 확인`); else if (!known && !evid) row.risk.push(`월이 바뀌며 예약표 칸이 나뉨 — 같은 예약인지(예약 상세로 확인 안 됨)`);
}
if (startCell && startCell !== last && startCell.s === T && namesDiffer(last, startCell) && !sameBooking(last, startCell)) row.risk.push(`연박으로 이어졌지만 앞뒤 예약 성함이 다름(${last.ch || "?"}→${startCell.ch || "?"}) — 예약자만 다른 연박인지, 실제 퇴실인지`);
if (last.cco && last.e >= T && last.cco <= T && last.cco >= addDays(last.s, 1)) row.risk.push(`예약 상세상 ${md(last.cco)} 퇴실 — 예약표 칸이 더 길게 칠해짐(오늘 퇴실인지)`);
const endCell = cellAt(R, end);
if (endCell && endCell.cco && endCell.cco !== row.checkout && endCell.cco > T && endCell.cco <= addDays(T, 120) && !endCell.ext) row.flags.push(`예약 상세 퇴실일 ${md(endCell.cco)} ≠ 예약표 ${md(row.checkout)} — 퇴실일 확인`);
row.lastFull = lastTxt === "UHC" ? null : anchor || null;
}
if (last.ids) {
const same = {}, other = {};
last.ids.forEach(k => {
if (k[0] !== "b" || !dupIx[k]) return;
dupIx[k].forEach(o => {
if (o.b === b && o.room === room) return;
if (o.z || last.z) return;
if (o.a !== null && o.a === last.a && o.s === last.s && o.e === last.e) same[BLDG[o.b] + o.room] = 1; else other[BLDG[o.b] + o.room] = 1;
});
});
const sl = Object.keys(same), dl = Object.keys(other).filter(k => !same[k]);
if (sl.length && sl.length <= 3) row.risk.push(`같은 예약번호·같은 금액·같은 날짜가 ${sl.join("·")}에도 적힘 — 중복 기입인지(실제 투숙 방 확인)`);
if (dl.length && dl.length <= 3 && last.s === Y) row.flags.push(`같은 예약번호가 ${dl.join("·")}에도 있음(금액·날짜 다름) — 여러 객실 예약이면 정상`);
}
if (!row.label) {
row.flags.push("객실구분 미확인(청소표 기록 없음)");
}
res[b].push(row);
});
const KO = {
"재실청소": 0,
"전체재실": 1,
"객실청소": 2
};
const KA = {
"객실청소": 0,
"재실청소": 1,
"전체재실": 2
};
res[b].sort((p, q) => b === "main" ? KO[p.kind] - KO[q.kind] || (p.u || 999) - (q.u || 999) || +p.room - +q.room : KA[p.kind] - KA[q.kind] || (p.u || 999) - (q.u || 999) || +p.room - +q.room);
const st = {
"객실청소": 0,
"재실청소": 0,
"전체재실": 0,
"당일": 0,
flags: 0
};
res[b].forEach(x => {
st[x.kind]++;
if (x.today) st.당일++;
if (x.flags.length) st.flags++;
});
res.stats[b] = st;
});
return res;
}
// [web] 메모에서 재실 요청 시간 읽기. 날짜(11/24)·호수(1512호)·※확인 줄은 먼저 지운다. 6~22시만, 끝이 없으면 시작+2시간
function reqTimeOf(memo) {
const t = String(memo || "").replace(/※확인[^\n]*/g, " ").replace(/\(\s*전체[^)]*\)/g, " ").replace(/\d{1,2}\s*\/\s*\d{1,2}/g, " ").replace(/\d{3,4}\s*호/g, " ").replace(/오후\s*(\d{1,2})/g, (x, h) => String(+h < 12 ? +h + 12 : +h)).replace(/오전\s*(\d{1,2})/g, "$1");
const hh = (h, m) => { h = +h; m = m === undefined ? 0 : +m; return h >= 6 && h <= 22 && m >= 0 && m < 60 ? String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") : ""; };
const plus2 = v => { const h = Math.min(23, +v.slice(0, 2) + 2); return String(h).padStart(2, "0") + v.slice(2); };
let m = t.match(/(?:^|[^\d:])(\d{1,2})(?::(\d{2}))?\s*시?\s*[~∼～\-]\s*(?:(\d{1,2})(?::(\d{2}))?\s*시?)?/);
if (m) { const f = hh(m[1], m[2]); if (f) { let to = m[3] !== undefined ? hh(m[3], m[4]) : ""; if (!to || to <= f) to = plus2(f); return { from: f, to: to }; } }
m = t.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/) || t.match(/(?:^|[^\d])(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
if (m) { const f = hh(m[1], m[2]); if (f) return { from: f, to: plus2(f) }; }
return null;
}
function learnFromCleanSheet(wb) {
const out = {
date: {},
master: {
main: {},
annex: {}
},
kinds: {
main: {},
annex: {}
},
memos: {
main: {},
annex: {}
},
done: {
main: { rooms: {}, low: false, full: {}, tag: {}, sig: {} },
annex: { rooms: {}, low: false, full: {}, tag: {}, sig: {} }
},
order: {
main: [],
annex: []
},
cols: {
main: {},
annex: {}
},
contact: {
main: {},
annex: {}
},
contactCols: {
main: null,
annex: null
},
assign: {
main: {},
annex: {}
},
requests: {
main: {},
annex: {}
}
};
[ [ "청소표(본관)", "main" ], [ "청소표(신관)", "annex" ] ].forEach(([sn, b]) => {
const ws = wb.Sheets[sn];
if (!ws) return;
const R = XLSX.utils.decode_range(ws["!ref"]);
const g = (r, c) => ws[XLSX.utils.encode_cell({
r: r,
c: c
})];
let hr = -1, col = {};
for (let r = 0; r <= Math.min(R.e.r, 20) && hr < 0; r++) {
const m = {};
for (let c = 0; c <= Math.min(R.e.c, 30); c++) {
const v = s((g(r, c) || {}).v);
if (v) m[v] = c;
}
if (m["호수"] !== undefined && m["청소"] !== undefined) {
hr = r;
col = m;
}
}
if (hr < 0) return;
for (let r = 0; r < hr; r++) for (let c = 0; c < 6; c++) {
const x = g(r, c);
if (x && x.t === "n" && x.v > 4e4 && x.v < 6e4) {
out.date[b] = isoOfSerial(x.v);
r = hr;
break;
}
}
const kc = col["청소"], memoC = b === "main" ? kc + 1 : col["비고"] !== undefined ? col["비고"] : kc + 1;
const L = c => XLSX.utils.encode_col(c);
let nK = 0, nDone = 0;
const cI = col["연락처"], cT = col["연락수단"], cS = col["발송확인"];
if (cI !== undefined && cT === cI + 1) out.contactCols[b] = {
id: L(cI),
type: L(cT),
sent: cS === cI + 2 ? L(cS) : null
};
out.cols[b] = {
first: hr + 2,
B: "B",
kind: L(kc),
memo: L(memoC),
done: L(memoC + 1),
last: L(memoC + 3)
};
for (let r = hr + 1; r <= R.e.r; r++) {
const rm = s((g(r, col["호수"]) || {}).v);
if (!/^\d{3,4}$/.test(rm)) continue;
const room = String(+rm);
out.order[b].push(room);
const num = c => {
if (c === undefined) return undefined;
const x = g(r, c);
return x && x.t === "n" ? x.v : x && /^\d+$/.test(s(x.v)) ? +s(x.v) : undefined;
};
const m = {
label: s((g(r, col["객실구분"]) || {}).v) || undefined,
u: num(col["UH기준"])
};
if (b === "main") {
m.c = num(col["청소기준"]);
m.dong = s((g(r, col["동"]) || {}).v) || undefined;
}
out.master[b][room] = m;
if (out.contactCols[b]) {
const ci = s((g(r, cI) || {}).v), ct = s((g(r, cT) || {}).v), cs = out.contactCols[b].sent ? s((g(r, cS) || {}).v) : "";
if (ci || ct || cs) out.contact[b][room] = {
id: ci,
type: ct,
sent: cs
};
}
const k = s((g(r, kc) || {}).v);
if (k) out.kinds[b][room] = k;
// [web] 담당(룸메이드 이름): 머리글 "담당" 열, 없으면 메모/비고 오른쪽 두 번째 칸(완료·담당·확인 순). 직원 이름만, 숫자·시간은 버린다
const ac = col["담당"] !== undefined ? col["담당"] : memoC + 2;
const who = s((g(r, ac) || {}).v).replace(/\s+/g, " ");
if (who && /[가-힣A-Za-z]/.test(who) && !/^\d/.test(who) && who.length <= 20) out.assign[b][room] = who;
const memo = s((g(r, memoC) || {}).v);
const tm = memo.match(/\(\s*전체\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\)/);
if (tm && out.date[b]) {
let yy = +out.date[b].slice(0, 4);
const mo = +tm[1], dy = +tm[2], cm = +out.date[b].slice(5, 7);
if (mo > cm + 1) yy--;
if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) out.done[b].tag[room] = `${yy}-${String(mo).padStart(2, "0")}-${String(dy).padStart(2, "0")}`;
}
if (/^(재실청소|전체재실)$/.test(k)) {
// [web] 재실 요청 시간: 메모/비고에 적힌 시간(11~13 · 13:00 · 13시 · 12~) = 그 시간에 정비해 달라는 요청(야간 검수 청소 정산 기준과 같음)
const rq = reqTimeOf(memo);
if (rq) out.requests[b][room] = rq;
const sm = memo.replace(/※확인[^\n]*/g, "").match(/조기\s*퇴실|퇴실\s*완|퇴실\s*함|퇴실\s*했|체크\s*아웃\s*(?:완|함|했)|미\s*체크인|노\s*쇼|입실\s*예정|방\s*이동|객실\s*이동|룸\s*무브|룸\s*체인지/);
if (sm) out.done[b].sig[room] = sm[0].replace(/\s+/g, "");
}
if (/^(객실청소|재실청소|전체재실)$/.test(k)) {
nK++;
const side = [ 1, 2, 3 ].map(o => s((g(r, memoC + o) || {}).v));
if (/완료/.test(side[0])) nDone++;
if (side.some(v => /전체/.test(v))) out.done[b].full[room] = 1;
if (k === "전체재실") {
const extra = side.some(v => /^추가(건|청소|정비|요청)?$/.test(v));
let ok = extra;
try {
ok = ok || CL.serviceJudge("전체", memo).status === "count";
} catch (e) {}
if (ok) out.done[b].rooms[room] = 1;
}
}
const fx = fixedBlock(memo);
if (fx) out.memos[b][room] = fx;
}
out.done[b].low = nK >= 20 && nDone / nK < .3;
});
return out;
}
const FIXED_MARK = /★\s*고정|고정\s*메모|고정\s*★|\[\s*고정\s*\]|<\s*고정\s*>/;
function fixedBlock(memo) {
const L = String(memo || "").split(/\r?\n/);
const i = L.findIndex(l => FIXED_MARK.test(l));
if (i < 0) return "";
const keep = [ L[i].trim() ];
L.slice(i + 1).forEach(l => {
const t = l.trim();
if (t) keep.push(t);
});
return keep.join("\n");
}
function fixedSusp(block) {
return String(block || "").split("\n").slice(1).map(t => t.trim()).filter(t => t && (/^\d{1,2}\s*[\/.월]\s*\d{1,2}/.test(t) || /^[\d\s:~∼\-시분()]+$/.test(t) || /오늘|금일|내일|미체크인|노쇼/.test(t) || /^\d{1,2}\s*(:\d{2})?\s*시?\s*[~∼\-]/.test(t) && !/매일|고정|항상|요일|월수금|화목/.test(t)));
}
const cellTxt = v => {
const t = v === undefined || v === null ? "" : String(v);
return /[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};
function tsv(rows, b, part, memos) {
memos = memos || {};
return rows.map(x => {
const memo = memos[x.room] || "";
if (b === "main") return [ x.today, x.c, x.u, x.dong, +x.room, x.label, x.kind, memo ].map(cellTxt).join("\t");
if (part === 1) return [ x.today, x.u, x.room ].map(cellTxt).join("\t");
return [ x.label, x.kind, memo ].map(cellTxt).join("\t");
}).join("\n");
}
async function readMonthBorders(bytes, wb, stays) {
if (typeof JSZip === "undefined" || !bytes || !stays) return false;
const zip = await JSZip.loadAsync(bytes);
const txt = async p => {
const f = zip.file(p);
return f ? await f.async("string") : "";
};
const wbx = await txt("xl/workbook.xml"), rels = await txt("xl/_rels/workbook.xml.rels"), sty = await txt("xl/styles.xml");
if (!wbx || !sty) return false;
const relT = {};
rels.replace(/<Relationship\b[^>]*>/g, t => {
const id = (t.match(/Id="([^"]+)"/) || [])[1], tg = (t.match(/Target="([^"]+)"/) || [])[1];
if (id && tg) relT[id] = tg.replace(/^\/?xl\//, "").replace(/^\//, "");
return t;
});
const bsec = (sty.match(/<borders[^>]*>([\s\S]*?)<\/borders>/) || [])[1] || "";
const borders = bsec.match(/<border\b[^>]*?(?:\/>|>[\s\S]*?<\/border>)/g) || [];
const isRed = (b, side) => {
const m = b.match(new RegExp("<" + side + "\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/" + side + ">)"));
if (!m || !/style="/.test(m[1] || "")) return false;
const c = (m[2] || "").match(/rgb="([0-9A-Fa-f]{6,8})"/);
return !!c && /FF0000$/i.test(c[1]);
};
const bMark = borders.map(b => {
const t = isRed(b, "top"), bo = isRed(b, "bottom");
return t && bo ? "R" : t || bo ? "r" : "";
});
const xsec = (sty.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || "";
const xfs = xsec.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
const xMark = xfs.map(x => bMark[+((x.match(/borderId="(\d+)"/) || [])[1] || 0)] || "");
let any = false;
for (const [n, b] of [ [ "본관", "main" ], [ "신관", "annex" ] ]) {
const S = stays[b];
if (!S) continue;
const sm = wbx.match(new RegExp('<sheet\\b[^>]*name="[^"]*\\(' + n + '\\)"[^>]*>'));
if (!sm) continue;
const rid = (sm[0].match(/r:id="([^"]+)"/) || [])[1];
const path = rid && relT[rid] ? "xl/" + relT[rid] : "";
if (!path) continue;
const want = {}, cols = new Set();
Object.values(S.rooms).forEach(R => Object.values(R.cells).forEach(x => {
if (!x.rc) return;
if (/-01$/.test(x.s)) {
want[x.rc[0] + "|" + x.rc[1]] = [ x, "bf" ];
cols.add(x.rc[1]);
}
if (addDays(x.e, 1).slice(8) === "01") {
want[x.rc[0] + "|" + x.rc[2]] = [ x, "bl" ];
cols.add(x.rc[2]);
}
}));
if (!cols.size) continue;
const colL = {};
cols.forEach(c => colL[XLSX.utils.encode_col(c)] = c);
const xml = await txt(path);
const re = /<c r="([A-Z]+)(\d+)"([^>]*)>/g;
let m;
while (m = re.exec(xml)) {
const c = colL[m[1]];
if (c === undefined) continue;
const w = want[(+m[2] - 1) + "|" + c];
if (!w) continue;
const si = (m[3].match(/\ss="(\d+)"/) || [])[1];
w[0][w[1]] = si ? xMark[+si] || "" : "";
}
Object.values(want).forEach(([x, k]) => {
if (x[k] === undefined) x[k] = "";
});
S.borders = true;
any = true;
}
return any;
}
return {
stayStart: stayStart,
stayEnd: stayEnd,
readMonthBorders: readMonthBorders,
readStays: readStays,
generate: generate,
learnFromCleanSheet: learnFromCleanSheet,
fixedSusp: fixedSusp,
tsv: tsv,
BLDG: BLDG,
addDays: addDays
};
}();
})(typeof window !== "undefined" ? window : globalThis);
