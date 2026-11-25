/* 화면: 역할 전환, 업무 목록, 등록, 상세, 이력, 이후 단계 자리 */
{
  const OPS = window.OPS, Core = OPS.Core, Store = OPS.Store, COL = OPS.COL;
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mem = {
    get(k, d) { try { const v = localStorage.getItem("opsFrameUi:" + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("opsFrameUi:" + k, v); } catch (e) {} }
  };

  const TABS = [
    { id: "board", name: "현황판" },
    { id: "svc", name: "청소·재실" },
    { id: "desk", name: "불출·분실물" },
    { id: "work", name: "할 일" },
    { id: "shift", name: "교대·인수인계", later: "3단계" },
    { id: "check", name: "체크리스트", later: "4단계" },
    { id: "rooms", name: "이슈 목록" },
    { id: "log", name: "이력" },
    { id: "dash", name: "통계", mg: true },
    { id: "settings", name: "설정" }
  ];
  const LATER = {
    shift: ["근무 파트 열기·마감", "마감 때 미완료 업무와 미체크 항목 자동 수집", "다음 근무자 확인 기록", "마감 후 잠금(월 마감 구조 변형)"],
    check: ["부서·파트별 당일 체크 틀", "근무 파트별 체크 실행", "미체크 항목을 '체크 미완료' 업무로 승격"]
  };

  const st = {
    role: (location.hash.slice(1).toUpperCase() || mem.get("role", "FO")),
    tab: "board", bf: "", me: null, names: {},
    filter: "open",
    tasks: [], events: [],
    formTo: null, formPri: "일반", formKind: "issue",
    openId: null,
    master: null, days: {}, settings: null, staff: [], setMsg: "",
    svc: {}, svcDate: null, svcUnsub: null, svcEdit: null,
    stayIdx: null, stayAll: false, lgOpen: typeof innerWidth === "number" ? innerWidth > 900 : true,
    deliv: [], stock: {}, lost: [], dMsg: "", dForce: null, lMsg: "", sMsg: "", lq: "", dDone: false, keep: null, manual: [], forceAdd: null, addPrefill: null, addMsg: "",
    bMode: "grid", pb: null, pFloor: {}, zoom: null, drag: null,
    notes: {}, openRoomId: null, backRoom: null, noteEdit: null, prefill: null, bNeed: false,
    rdate: OPS.ymd(Date.now()), rq: "", rb: "all", rOnly: true, rHide: true, rMsg: ""
  };
  if (!OPS.DEPTS.some(d => d.id === st.role)) st.role = "FO";
  // 현황판(객실 판)이 모든 부서의 첫 화면. 통계는 관리자만
  const fitTab = () => { if (st.role !== "MG" && st.tab === "dash") st.tab = "board"; st.bf = ""; };
  { const t0 = mem.get("tab", ""); if (t0 && TABS.some(t => t.id === t0)) st.tab = t0; mem.set("tab", ""); }
  fitTab();
  st.bMode = mem.get("bmode", "grid") === "plan" ? "plan" : "grid";

  // 작성자 = 로그인한 사람(claude.ai 계정) + 지금 부서. 저장은 계정 id만, 이름은 화면에 그릴 때마다 계정에서 읽는다.
  // 로그인 정보를 못 받으면(공개 링크로 들어온 사람 등) 이름 칸에 적은 이름을 쓴다.
  const actor = () => ({ role: st.role, uid: st.me ? st.me.id : "", name: $("myName").value.trim() || (st.me ? "" : OPS.deptName(st.role) + " 근무자"), part: $("myPart").value });
  let UAPI = null, nameT = null; const nameQ = new Set();
  function nameOf(uid, fallback) {
    if (uid && UAPI) {
      if (Object.prototype.hasOwnProperty.call(st.names, uid)) return st.names[uid] || fallback || "(이름 없음)";
      nameQ.add(uid);
      if (!nameT) nameT = setTimeout(async () => {
        const ids = Array.from(nameQ); nameQ.clear();
        try { const ps = await UAPI.profiles(ids); ids.forEach(i => { st.names[i] = (ps && ps[i] && ps[i].name) || ""; }); }
        catch (e) { ids.forEach(i => { st.names[i] = ""; }); }
        nameT = null; render(); if ($("dlg").open && st.openId) openTask(st.openId, true); else if ($("dlg").open && st.openRoomId) openRoom(st.openRoomId, true);
      }, 60);
    }
    return fallback || "";
  }
  // "누가 · 부서 · 언제" 한 줄. o: {uid, by, role, at}
  const whoLine = (o, opts) => {
    if (!o) return "";
    const nm = nameOf(o.uid, o.by && o.by !== "(이름 없음)" ? o.by : "") || "(이름 없음)";
    const parts = [nm, OPS.deptName(o.role || "")];
    if (o.at && !(opts && opts.noTime)) parts.push((opts && opts.short) ? hm(o.at).split(" ")[1] : hm(o.at));
    return parts.filter(Boolean).join(" · ");
  };

  const ago = ms => {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "방금";
    if (m < 60) return m + "분 전";
    if (m < 60 * 24) return Math.floor(m / 60) + "시간 전";
    const d = new Date(ms); return (d.getMonth() + 1) + "/" + d.getDate();
  };
  const hm = ms => { const d = new Date(ms); return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

  // ---------- 머리 ----------
  function renderNames() {
    const dl = $("nameList");
    if (!dl) return;
    dl.innerHTML = st.staff.filter(x => x.active && x.dept === st.role).map(x => `<option value="${esc(x.name)}">`).join("");
  }
  // 야간 모드: 자동이면 야간 파트 시간(설정의 야간 시작~주간 시작)에 어둡게. 주간/야간으로 고정할 수도 있다.
  const THEME_NEXT = { auto: "day", day: "night", night: "auto" };
  const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`;
  const MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>`;
  function applyLang() {
    const en = mem.get("lang", "ko") === "en", b = $("langBtn");
    if (b) { b.textContent = en ? "한국어" : "EN"; b.setAttribute("aria-pressed", String(en)); }
  }
  function applyTheme() {
    const mode = mem.get("theme", "auto");
    const dark = mode === "night" || (mode === "auto" && OPS.guessPart() === "night");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const b = $("themeBtn");
    if (b) {
      b.innerHTML = (dark ? MOON : SUN) + `<span>${mode === "auto" ? (dark ? "야간 자동" : "주간 자동") : dark ? "야간" : "주간"}</span>`;
      b.setAttribute("aria-pressed", String(mode !== "auto"));
      b.setAttribute("aria-label", "화면 밝기, 지금 " + (mode === "auto" ? "자동" : dark ? "야간 고정" : "주간 고정") + ". 누르면 바뀜");
    }
    const big = mem.get("size", "") === "lg";
    document.documentElement.dataset.size = big ? "lg" : "";
    if ($("sizeBtn")) { $("sizeBtn").setAttribute("aria-pressed", String(big)); $("sizeBtn").textContent = big ? "가-" : "가+"; $("sizeBtn").title = big ? "글자 보통" : "글자 크게"; }
  }

  function renderHead() {
    applyTheme();
    renderNames();
    const mk = document.querySelector(".mark small");
    if (mk) mk.textContent = (OPS.CTX.propertyName ? OPS.CTX.propertyName + " · " : "") + "통합 업무 시스템 · " + OPS.VERSION + " · 1인 시험판";
    $("roles").innerHTML = OPS.DEPTS.map(d => {
      const n = st.tasks.filter(t => Core.needsAck(t, d.id)).length + (d.id === "HK" && st.master ? svcRows().filter(OPS.Svc.hkNeedsAck).length : 0);
      return `<button type="button" data-role="${d.id}" aria-pressed="${d.id === st.role}" aria-label="${esc(d.en + " " + d.name)}${n ? ", 확인 필요 " + n + "건" : ""}"><span class="rc">${esc(d.code)}</span><span class="rl"><span class="re">${esc(d.en)}</span><span class="rk">${esc(d.name)}</span></span>${n ? `<span class="n">${n}</span>` : ""}</button>`;
    }).join("");
    const me = OPS.DEPTS.find(d => d.id === st.role) || {};
    const wb = $("whoBtn"); if (wb) { wb.dataset.who = st.role; wb.innerHTML = `<span class="rc">${esc(me.code || "")}</span><span class="rk2">${esc(me.name || "")}${st.me ? " · " + esc(nameOf(st.me.id, $("myName").value.trim()) || "로그인") : ""}</span>`; }
    // 탭 숫자: 키핑은 아직 출발 안 한 불출, 프론트는 키핑이 "못 함"으로 돌려보낸 오늘 요청
    const badge = id => {
      if (id !== "desk") return 0;
      if (st.role === "HK") return st.deliv.filter(d => OPS.Desk.isOpen(d) && !d.go).length;
      if (st.role === "FO") return st.deliv.filter(d => d.fail && !d.cancel).length;
      return 0;
    };
    // 메뉴 버튼 숫자 = 지금 부서가 볼 것(확인 필요 + 탭 숫자)
    const myN = st.tasks.filter(t => Core.needsAck(t, st.role)).length + (st.role === "HK" && st.master ? svcRows().filter(OPS.Svc.hkNeedsAck).length : 0) + TABS.reduce((a, t) => a + badge(t.id), 0);
    const mb = $("menuBadge"); if (mb) { mb.hidden = !myN; mb.textContent = myN; }
    // 쓰는 메뉴와 아직 준비 중인 메뉴(교대·체크리스트)를 나눠 그린다
    const tabBtn = t => { const n = badge(t.id); return `<button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === st.tab}">${esc(t.name)}${n ? `<span class="tbadge">${n}</span>` : ""}${t.later ? `<span class="later">${esc(t.later)}</span>` : ""}</button>`; };
    const shown = TABS.filter(t => !t.mg || st.role === "MG");
    $("tabs").innerHTML = shown.filter(t => !t.later).map(tabBtn).join("");
    if ($("laterTabs")) $("laterTabs").innerHTML = shown.filter(t => t.later).map(tabBtn).join("");
  }

  // ---------- 업무 한 줄 ----------
  function taskRow(t, role) {
    const acts = Core.actions(t, role);
    const late = Core.isOverdue(t);
    const go = acts[0] ? `<button type="button" class="btn ${acts[0].to === "진행 중" || acts[0].to === "완료" || acts[0].to === "완료 대기" ? "main" : ""} go" data-act="${esc(acts[0].to)}" data-id="${esc(t.id)}">${esc(acts[0].label)}</button>` : "";
    return `<div class="task ${t.priority === "긴급" && Core.isOpen(t) ? "hot" : ""}" tabindex="0" data-open="${esc(t.id)}">
      <span class="room ${t.room ? "" : "none"}">${t.room ? (bTag(t) ? `<small>${esc(bTag(t))}</small>` : "") + esc(t.room) : "위치<br>없음"}</span>
      <span class="t"><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</span>
      ${go}
      <span class="meta">${esc(OPS.kindName(t.kind))} · ${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · <span class="st">${esc(t.status)}</span> · ${esc(nameOf(t.createdUid, t.createdBy !== "(이름 없음)" ? t.createdBy : "") || "(이름 없음)")} ${esc(ago(t.createdAt))}${late ? ` · <span class="late">기한 초과</span>` : ""}</span>
    </div>`;
  }
  const multiB = () => !!(st.master && st.master.buildings && st.master.buildings.length > 1);
  const bTag = t => (multiB() && t.building ? ((st.master.buildings.find(b => b.id === t.building) || {}).name || "") : "");
  const listHtml = (arr, role, empty) => arr.length ? `<div class="list">${Core.sort(arr).map(t => taskRow(t, role)).join("")}</div>` : `<div class="empty">${esc(empty)}</div>`;

  // ---------- 할 일 ----------
  function filterGroup(t) {
    if (st.filter === "open") return Core.isOpen(t) && t.status !== "보류";
    if (st.filter === "hold") return t.status === "보류";
    if (st.filter === "done") return !Core.isOpen(t) && t.updatedAt > Date.now() - 864e5;
    return true;
  }

  function workView() {
    if (st.role === "MG") return managerView();
    const r = st.role;
    const inbox = st.tasks.filter(t => t.toDept === r && t.status !== "완료 대기" && filterGroup(t));
    const confirm = st.tasks.filter(t => t.fromDept === r && t.toDept !== r && t.status === "완료 대기");
    const sent = st.tasks.filter(t => t.fromDept === r && t.toDept !== r && Core.isOpen(t) && t.status !== "완료 대기");
    const chips = [["open", "처리할 것"], ["hold", "보류"], ["done", "최근 24시간 완료"]];
    return `<div class="cols"><div>
      ${confirm.length ? `<section class="card"><h2>확인할 것 <span class="c">${confirm.length}</span></h2><p class="sub">다른 부서가 처리를 마쳤습니다. 확인하면 완료됩니다.</p>${listHtml(confirm, r, "")}</section>` : ""}
      <section class="card"><h2>받은 업무 <span class="c">${inbox.length}</span></h2>
        <p class="sub">${esc(OPS.deptName(r))}로 온 업무. 긴급 먼저, 오래된 것 먼저.</p>
        <div class="chips" id="chips">${chips.map(([k, n]) => `<button type="button" data-filter="${k}" aria-pressed="${st.filter === k}">${n}</button>`).join("")}</div>
        ${listHtml(inbox, r, st.filter === "open" ? "처리할 업무가 없습니다." : "해당하는 업무가 없습니다.")}
      </section></div><div>
      ${formHtml()}
      <section class="card"><h2>보낸 업무 <span class="c">${sent.length}</span></h2><p class="sub">다른 부서에서 처리 중인 업무.</p>${listHtml(sent, r, "다른 부서로 보낸 진행 중 업무가 없습니다.")}</section>
    </div></div>`;
  }

  function managerView() {
    const open = st.tasks.filter(t => Core.isOpen(t));
    const depts = OPS.DEPTS.filter(d => d.id !== "MG");
    const cnt = (d, f) => open.filter(t => t.toDept === d && f(t)).length;
    const rows = depts.map(d => `<tr><td>${esc(d.name)}</td>
      <td class="num">${cnt(d.id, t => OPS.GROUP[t.status] === "대기")}</td>
      <td class="num">${cnt(d.id, t => OPS.GROUP[t.status] === "진행")}</td>
      <td class="num">${cnt(d.id, t => t.status === "보류")}</td>
      <td class="num">${cnt(d.id, t => t.priority === "긴급")}</td>
      <td class="num">${cnt(d.id, t => Core.isOverdue(t))}</td></tr>`).join("");
    return `<div class="cols"><div>
      <section class="card"><h2>부서별 미처리</h2><p class="sub">열린 업무를 받는 부서 기준으로 셉니다.</p>
        <div class="scroll"><table><thead><tr><th>부서</th><th class="num">대기</th><th class="num">진행</th><th class="num">보류</th><th class="num">긴급</th><th class="num">기한 초과</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section class="card"><h2>열린 업무 전체 <span class="c">${open.length}</span></h2>${listHtml(open, "MG", "열린 업무가 없습니다.")}</section>
    </div><div>${formHtml()}</div></div>`;
  }

  function formHtml() {
    const kind = st.formKind;
    const to = st.formTo || OPS.defaultTo(kind);
    return `<section class="card"><h2>업무 등록</h2><p class="sub">제목만 적고 등록해도 됩니다. 나머지는 종류에 따라 자동으로 채워집니다.</p>
    <form class="new" id="newForm" autocomplete="off">
      <div class="row2">
        <label class="f">종류<select id="fKind">${OPS.KINDS.filter(k => k.id !== "check").map(k => `<option value="${k.id}" ${k.id === kind ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></label>
        <label class="f">보낼 부서<select id="fTo">${OPS.DEPTS.map(d => `<option value="${d.id}" ${d.id === to ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
      </div>
      <div class="row2">
        <label class="f">객실·위치<span class="pair">${multiB() ? `<select id="fBld" aria-label="동"><option value="">동</option>${st.master.buildings.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("")}</select>` : ""}<input id="fRoom" placeholder="예: 1203, 로비" maxlength="20" list="roomList"></span></label>
        <label class="f" ${kind === "issue" ? "" : "hidden"}>분류<select id="fCat"><option value="">선택 안 함</option>${OPS.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
      </div>
      <label class="f">제목<input id="fTitle" required maxlength="120" placeholder="예: 샤워기 누수, 수건 2장 추가"></label>
      <div class="seg" id="fPri" role="group" aria-label="우선순위">${OPS.PRIORITY.map(p => `<button type="button" class="${p}" data-pri="${p}" aria-pressed="${p === st.formPri}">${p}</button>`).join("")}</div>
      <details><summary class="sub" style="cursor:pointer;margin:0">상세 내용</summary><label class="f" style="margin-top:8px">내용<textarea id="fDetail" maxlength="2000" placeholder="카드번호·객실 비밀번호는 자동으로 가려집니다."></textarea></label></details>
      <button class="btn main" type="submit">등록</button>
      <div class="msg" id="fMsg" aria-live="polite"></div>
      <datalist id="roomList">${roomOptions()}</datalist>
    </form></section>`;
  }

  function roomOptions() {
    if (!st.master || !st.master.rooms) return "";
    const b = $("fBld") ? $("fBld").value : "";
    const seen = new Set();
    return Object.values(st.master.rooms).filter(r => !b || r.b === b).map(r => r.no).filter(n => !seen.has(n) && seen.add(n)).sort((a, c) => +a - +c).map(n => `<option value="${esc(n)}">`).join("");
  }

  // ---------- 객실 현황 ----------
  const STAY_CLS = { "퇴실": "out", "퇴실·입실": "out", "입실": "in", "연박": "stay", "공실": "free" };
  function dayDoc(date) { return st.days[date] || null; }
  function baseState(id, date) {
    const d = dayDoc(date);
    if (!d) return null;
    const r = (d.rooms || {})[id] || null;
    const ck = (d.cleanSheet || {})[id];
    if (!r && !ck) return null;
    return Object.assign({ stay: "", clean: "", flags: [] }, r || {}, ck ? { clean: ck, cleanFromSheet: true } : {});
  }
  // 예약표 상태 위에 직접 추가한 예약을 덧입힌다
  function roomState(id, date) {
    const mine = st.manual.filter(m => m.roomId === id);
    return OPS.Stays.overlay(baseState(id, date), mine, date);
  }
  const manualOn = date => st.manual.some(m => { const t = OPS.Stays.dayN(date), s = OPS.Stays.dayN(m.start); return t >= s && t <= s + (m.nights | 0); });
  function urgencyKey(list) {
    const now = Date.now();
    return [list.some(t => t.priority === "긴급") ? 0 : 1, list.some(t => Core.isOverdue(t, now)) ? 0 : 1, Math.min(...list.map(t => t.createdAt))];
  }
  function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }

  function roomsView() {
    const M = st.master;
    const open = st.tasks.filter(t => Core.isOpen(t) && !(st.rHide && OPS.ROUTINE.has(t.kind)));
    const byRoom = new Map(), loose = new Map();
    open.forEach(t => {
      const id = M ? OPS.Rooms.resolve(t, M) : null;
      if (id) { if (!byRoom.has(id)) byRoom.set(id, []); byRoom.get(id).push(t); }
      else { const k = (t.room || "").trim() || "위치 없음"; if (!loose.has(k)) loose.set(k, []); loose.get(k).push(t); }
    });
    const q = st.rq.replace(/호$/, "").trim();
    const dates = Object.keys(st.days).sort();
    const dateChips = weekChips();
    const d = dayDoc(st.rdate);
    let ids = M ? Object.keys(M.rooms) : [];
    if (st.rb !== "all") ids = ids.filter(id => M.rooms[id].b === st.rb);
    if (q) ids = ids.filter(id => M.rooms[id].no.startsWith(q));
    else if (st.rOnly) ids = ids.filter(id => byRoom.has(id));
    ids.sort((a, b) => {
      const ta = byRoom.get(a), tb = byRoom.get(b);
      if (ta && !tb) return -1; if (tb && !ta) return 1;
      if (ta && tb) { const c = cmpKey(urgencyKey(ta), urgencyKey(tb)); if (c) return c; }
      const ra = M.rooms[a], rb = M.rooms[b];
      return ra.b === rb.b ? +ra.no - +rb.no : (ra.b === "main" ? -1 : 1);
    });
    const total = {};
    if (M && d) Object.keys(M.rooms).filter(id => st.rb === "all" || M.rooms[id].b === st.rb).forEach(id => { const s = roomState(id, st.rdate); const k = s && s.stay || "미확인"; total[k] = (total[k] || 0) + 1; });
    const sum = M && d ? OPS.STAY.filter(k => total[k]).map(k => `<span class="sum ${STAY_CLS[k]}">${esc(k)} <b>${total[k]}</b></span>`).join("") : "";
    const card = id => {
      const r = M.rooms[id], s = roomState(id, st.rdate), ts = Core.sort(byRoom.get(id) || []);
      const hot = ts.some(t => t.priority === "긴급");
      return `<div class="rc ${hot ? "hot" : ""}">
        <div class="rh"><span class="rn">${multiB() ? `<small>${esc(r.building)}</small>` : ""}${esc(r.no)}</span><span class="rt">${esc(r.type || "")}${r.dong ? " · " + esc(r.dong) + "동" : ""}</span></div>
        <div class="rs">${s && s.stay ? `<span class="chip ${STAY_CLS[s.stay] || ""}">${esc(s.stay)}</span>` : `<span class="chip">상태 없음</span>`}${s && s.clean ? `<span class="chip k">${esc(s.clean)}${s.cleanFromSheet ? "" : " 예상"}</span>` : ""}${s && s.flags && s.flags.length ? `<span class="chip warn" title="${esc(s.flags.join(" / "))}">확인 ${s.flags.length}</span>` : ""}</div>
        ${ts.length ? `<ul class="rtasks">${ts.slice(0, 3).map(t => `<li><a href="#${esc(st.role.toLowerCase())}" data-open="${esc(t.id)}"><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</a><span class="w">${esc(OPS.deptName(t.toDept))} · ${esc(t.status)}${Core.isOverdue(t) ? " · 기한 초과" : ""}</span></li>`).join("")}${ts.length > 3 ? `<li class="w">외 ${ts.length - 3}건</li>` : ""}</ul>` : `<div class="w">열린 업무 없음</div>`}
      </div>`;
    };
    const looseCard = ([k, ts]) => `<div class="rc loose ${ts.some(t => t.priority === "긴급") ? "hot" : ""}"><div class="rh"><span class="rn sm">${esc(k)}</span><span class="rt">${M ? "공용 구역·객실 미확인" : ""}</span></div><ul class="rtasks">${Core.sort(ts).map(t => `<li><a href="#${esc(st.role.toLowerCase())}" data-open="${esc(t.id)}"><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</a><span class="w">${esc(OPS.deptName(t.toDept))} · ${esc(t.status)}</span></li>`).join("")}</ul></div>`;
    const looseArr = Array.from(loose.entries()).filter(([k]) => !q || k.startsWith(q)).sort((a, b) => cmpKey(urgencyKey(a[1]), urgencyKey(b[1])));
    const src = d && d.src ? [d.src.reservation ? `예약표 ${hm(d.src.reservation.at)}` : "", d.src.clean ? `청소표 ${hm(d.src.clean.at)}` : ""].filter(Boolean).join(" · ") : "";
    return `<section class="card">
      <h2>객실 현황</h2>
      <p class="sub">열린 업무를 객실별로 묶었습니다. 긴급·기한 초과·오래된 순. 보기 전용이며 처리는 각 부서 화면에서 합니다.</p>
      <div class="rbar">
        <input id="rq" type="search" inputmode="numeric" placeholder="호수 검색" value="${esc(st.rq)}" aria-label="호수 검색">
        <div class="chips dates">${dateChips.map(x => `<button type="button" data-rdate="${esc(x)}" aria-pressed="${x === st.rdate}">${esc(x.slice(5).replace("-", "/"))}${x === OPS.ymd(Date.now()) ? " 오늘" : ""}</button>`).join("")}</div>
        ${multiB() ? `<div class="chips">${[{ id: "all", name: "전체" }].concat(M.buildings).map(b => `<button type="button" data-rb="${esc(b.id)}" aria-pressed="${b.id === st.rb}">${esc(b.name)}</button>`).join("")}</div>` : ""}
      </div>
      <div class="rbar">
        <label class="tg"><input type="checkbox" id="rOnly" ${st.rOnly ? "checked" : ""}> 업무 있는 객실만</label>
        <label class="tg"><input type="checkbox" id="rHide" ${st.rHide ? "checked" : ""}> 청소·점검 업무 숨김</label>
        ${sum ? `<span class="sums">${sum}</span>` : ""}
      </div>
      ${src ? `<p class="sub">${esc(st.rdate)} 상태 출처: ${esc(src)}. 청소 유형 옆 "예상"은 예약표로 계산한 값이고, 청소표를 올리면 실제 값으로 바뀝니다.</p>` : M ? `<p class="sub">${esc(st.rdate)} 상태가 없습니다. 그날 기준 예약표나 청소표를 올려 주십시오.</p>` : ""}
      ${!M ? `<div class="empty">아직 객실 목록이 없습니다. 관리자 역할의 설정 탭에서 예약표를 올리거나 객실을 직접 등록하면 만들어집니다. 그 전에는 업무를 적힌 객실 표기대로 묶습니다.</div>` : ""}
      <div class="rgrid">${looseArr.map(looseCard).join("")}${M ? ids.map(card).join("") : ""}</div>
      ${M && !ids.length && !looseArr.length ? `<div class="empty">${q ? "해당 호수가 없습니다." : "열린 업무가 있는 객실이 없습니다."}</div>` : ""}
    </section>
`;
  }

  // 암호 입력 창(브라우저 기본 prompt는 막혀 있어 직접 만든다)
  function askPassword(name) {
    return new Promise(res => {
      const dlg = $("dlg");
      st.openId = null;
      $("dlgBody").innerHTML = `<h3>암호가 걸린 파일</h3><p class="meta">${esc(name)}</p><form id="pwForm" class="cmt"><input id="pwIn" type="password" autocomplete="off" placeholder="파일 암호" aria-label="파일 암호"><button class="btn main" type="submit">열기</button></form><button type="button" class="btn" id="pwCancel">취소</button>`;
      const done = v => { dlg.close(); res(v); };
      $("pwForm").addEventListener("submit", e => { e.preventDefault(); e.stopPropagation(); done($("pwIn").value); });
      $("pwCancel").addEventListener("click", () => done(""));
      if (!dlg.open) dlg.showModal();
      $("pwIn").focus();
    });
  }

  async function importFiles(files, onlyResv) {
    const say = t => { st.rMsg = t; const m = $("rMsg"); if (m) m.textContent = t; };
    const msgs = [];
    let resv = null; const cleans = [];
    for (const f of files) {
      say(f.name + " 읽는 중… 큰 예약표는 수십 초 걸릴 수 있습니다.");
      await new Promise(r => setTimeout(r, 30));
      try {
        const r = await OPS.Rooms.readFile(f, askPassword);
        if (r.kind === "reservation") resv = r;
        else if (onlyResv) msgs.push(`${f.name}: 청소표로 보입니다. 여기에는 예약표를 올려 주십시오.`);
        else cleans.push(r);
      } catch (e) { msgs.push(e.message || String(e)); }
    }
    const now = Date.now();
    try {
      // 청소표의 객실구분을 먼저 모은다
      const bm = OPS.Rooms.bmapOf(st.master);
      const cl = cleans.map(c => Object.assign({ fileName: c.fileName }, OPS.Rooms.cleanFrom(c.learned, bm)));
      const lm = { main: {}, annex: {} };
      cl.forEach(c => ["main", "annex"].forEach(b => Object.assign(lm[b], (c.master || {})[b] || {})));
      let M = st.master ? JSON.parse(JSON.stringify(st.master)) : null;
      if (resv) {
        const before = new Set(Object.keys((M && M.rooms) || {}));
        const m = OPS.Rooms.masterFrom(resv.stays, lm, M);
        const addedN = Object.keys(m.rooms).filter(id => !before.has(id)).length;
        M = Object.assign({}, M || {}, m, { src: Object.assign({}, (M && M.src) || {}, { reservation: { file: resv.fileName, at: now } }), updatedAt: now });
        const today = OPS.ymd(now);
        for (let i = 0; i < 2; i++) {   // 당일 기준 + 내일(예정)
          const T = OPS.Rooms.addDays(today, i);
          const prev = st.days[T] || {};
          const doc = Object.assign({}, prev, { date: T, rooms: OPS.Rooms.dayFrom(resv.stays, T, lm, bm), src: Object.assign({}, prev.src || {}, { reservation: { file: resv.fileName, at: now } }) });
          delete doc.id;
          await Store.set(COL.roomDays, T, doc);
          st.days[T] = doc;
        }
        // 객실별 투숙 기간(지난 30일 ~ 앞으로 90일). 방을 눌렀을 때 "며칠~며칠" 표시용
        const sFrom = OPS.Rooms.addDays(today, -30), sTo = OPS.Rooms.addDays(today, 90);
        await Store.set(COL.stayIndex, "main", { from: sFrom, to: sTo, at: now, file: resv.fileName, borders: !!resv.borders, rooms: OPS.Rooms.spansFrom(resv.stays, bm, sFrom, sTo) });
        // 직접 추가한 예약 중 예약표에 들어온 것은 지운다(중복 방지)
        const rc = OPS.Stays.reconcile(st.manual, (rid, d) => baseState(rid, d), today, OPS.Rooms.addDays(today, 1));
        for (const x of rc.drop) { try { await Store.remove(COL.manualStays, x.m.id); } catch (e) {} }
        const dropIds = new Set(rc.drop.map(x => x.m.id)); st.manual = st.manual.filter(m => !dropIds.has(m.id));
        const diffs = rc.drop.filter(x => x.diff).map(x => `${x.m.no}호 ${x.m.nights}박→${x.diff}박`);
        const rcMsg = rc.drop.length ? ` 직접 추가 예약 ${rc.drop.length}건은 예약표에 들어와 정리했습니다${diffs.length ? `(박수 다름, 예약표 기준: ${diffs.join(", ")})` : ""}.` : "";
        const keepMsg = rc.keep.length ? ` 예약표에 없는 직접 추가 예약 ${rc.keep.length}건(${rc.keep.map(m => m.no + "호").join(", ")})은 그대로 둡니다.` : "";
        const td = st.days[today].rooms || {}, inH = Object.values(td).filter(x => x.stay === "연박" || x.stay === "퇴실" || x.stay === "퇴실·입실").length;
        msgs.push(`예약표 ${resv.fileName}: 오늘 기준 반영(내일은 예정). 어젯밤 투숙 ${inH}실 전부 포함(입실일과 무관).${rcMsg}${keepMsg} 객실 목록은 기존 ${before.size}실 유지${addedN ? `, 예약표에만 있던 ${addedN}실 추가` : ""}${resv.borders ? "" : " (월 경계 표시를 읽지 못해 월말·월초 연박 판정이 덜 정확할 수 있음)"}`);
      } else if (M && cl.length) {
        const inv = {}; Object.keys(bm).forEach(k => { inv[bm[k]] = k; });
        Object.keys(M.rooms).forEach(id => { const r = M.rooms[id]; const x = (lm[inv[r.b] || r.b] || {})[r.no]; if (x && x.label) r.type = x.label; });
      }
      for (const c of cl) {
        if (!c.date) { msgs.push(`${c.fileName}: 청소표 날짜를 찾지 못했습니다.`); continue; }
        const prev = st.days[c.date] || {};
        const doc = Object.assign({}, prev, { date: c.date, cleanSheet: c.kinds, src: Object.assign({}, prev.src || {}, { clean: { file: c.fileName, at: now } }) });
        delete doc.id;
        await Store.set(COL.roomDays, c.date, doc);
        st.days[c.date] = doc;
        msgs.push(`청소표 ${c.fileName}: ${c.date} ${Object.keys(c.kinds).length}실 청소 유형`);
        if (!st.days[st.rdate]) st.rdate = c.date;
      }
      if (M && (resv || cl.length)) { const save = Object.assign({}, M); delete save.id; await Store.set(COL.property, "main", save); st.master = M; }
    } catch (e) { msgs.push("저장 실패: " + (e.message || e)); }
    say(msgs.join(" / ") || "읽은 파일이 없습니다.");
    if (!$("rMsg")) st.dropMsg = { text: st.rMsg, at: Date.now() };
    render();
  }

  // ---------- 끌어다 놓기(v0.17) ----------
  // 화면 어디에 놓아도 예약표가 반영된다. 올릴 수 있는 사람은 버튼과 같다(프론트·관리자). 설정 화면에서는 청소표도 받는다.
  const canDrop = () => st.role === "FO" || st.role === "MG";
  const XL = /\.(xlsx|xlsm)$/i;
  let dragDepth = 0;
  const hasFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files"));
  function dropShow(on) {
    const d = $("dropzone"); if (!d) return;
    if (!on) { d.hidden = true; return; }
    const ok = canDrop(), all = st.tab === "settings" && st.role === "MG";
    d.className = "dropzone " + (ok ? "ok" : "no");
    d.innerHTML = ok
      ? `<div><b>여기에 놓으면 ${all ? "예약표·청소표" : "예약표"}가 반영됩니다</b><span>.xlsx · 여러 개 가능 · 오늘 기준(내일은 예정)으로 계산 · ${st.store === "db" ? "모든 기기에 바로 공유됩니다" : "지금은 공유 DB에 연결되지 않아 이 기기에만 저장됩니다"}</span></div>`
      : `<div><b>예약표는 프론트·관리자만 올릴 수 있습니다</b><span>지금 부서: ${esc(OPS.deptName(st.role))}. 놓아도 반영되지 않습니다.</span></div>`;
    d.hidden = false;
  }
  window.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dropShow(true); });
  window.addEventListener("dragover", e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = canDrop() ? "copy" : "none"; });
  window.addEventListener("dragleave", e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropShow(false); });
  window.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; dropShow(false);   // 브라우저가 파일을 새 창으로 여는 것을 막는다
    if (!canDrop()) { st.dropMsg = { text: "예약표는 프론트·관리자 부서에서만 올릴 수 있습니다. 메뉴에서 부서를 바꾼 뒤 다시 놓아 주십시오.", at: Date.now(), err: true }; render(); return; }
    const files = Array.from(e.dataTransfer.files || []);
    const xl = files.filter(f => XL.test(f.name)), other = files.filter(f => !XL.test(f.name));
    if (!xl.length) { st.dropMsg = { text: `엑셀 파일(.xlsx)이 아닙니다: ${other.map(f => f.name).join(", ")}`, at: Date.now(), err: true }; render(); return; }
    if (other.length) st.dropSkip = other.map(f => f.name).join(", ");
    importFiles(xl, !(st.tab === "settings" && st.role === "MG")).then(() => {
      if (st.dropSkip) { const t = ` / 엑셀이 아니라 건너뜀: ${st.dropSkip}`; st.dropSkip = ""; if (st.dropMsg) st.dropMsg.text += t; else { st.rMsg += t; const m = $("rMsg"); if (m) m.textContent = st.rMsg; } render(); }
    });
  });
  function dropMsgHtml() {
    const m = st.dropMsg; if (!m) return "";
    return `<div class="dropmsg ${m.err ? "err" : ""}" role="status"><span>${m.err ? "" : "파일 반영 결과 · " + esc(hm(m.at).split(" ")[1]) + " · "}${esc(m.text)}</span><button type="button" class="x" id="dropMsgX" aria-label="닫기">×</button></div>`;
  }

  // 날짜 칩: 오늘(당일 기준) + 내일(예정) + 지금 고른 날짜
  function weekChips() {
    const t = OPS.ymd(Date.now());
    const list = [t, OPS.Rooms.addDays(t, 1)];
    if (!list.includes(st.rdate)) list.unshift(st.rdate);
    return list;
  }

  // ---------- 객실판(메인) ----------
  // 객실 목록이 아직 없을 때 보여 주는 예시 객실(저장하지 않음)
  const DEMO = (() => {
    const rooms = {};
    ["3", "4", "5"].forEach(f => { for (let i = 1; i <= 18; i++) { const no = f + String(i).padStart(2, "0"); rooms["demo-" + no] = { b: "demo", building: "예시동", no, dong: i <= 14 ? "A" : "B", type: "" }; } });
    return { buildings: [{ id: "demo", name: "예시동" }], rooms, demo: true };
  })();
  const boardM = () => (st.master && st.master.rooms && Object.keys(st.master.rooms).length ? st.master : DEMO);
  const STAY_SHORT = { "퇴실": "퇴실", "퇴실·입실": "퇴·입", "입실": "입실", "연박": "연박", "공실": "공실" };
  const NOTE_DEPTS = ["FO", "HK", "FM"];
  const floorOf = no => (no.length > 2 ? no.slice(0, -2) : "0");
  function roomTasks(M) {
    const by = new Map();
    st.tasks.forEach(t => {
      if (!Core.isOpen(t)) return;
      const id = OPS.Rooms.resolve(t, M);
      if (!id) return;
      if (!by.has(id)) by.set(id, []);
      by.get(id).push(t);
    });
    return by;
  }
  function hasNote(id) { const n = st.notes[id]; return !!(n && NOTE_DEPTS.some(d => n[d] && n[d].text)); }

  const SV_SHORT = { "입실 가능": "입실 가능", "점검 대기": "점검 대기", "청소 중": "청소 중", "퇴실완·청소 대기": "청소 대기", "키핑: 아직 재실": "아직 재실", "연장·청소 없음": "연장", "퇴실 전": "", "발송 전": "", "회신 대기": "", "요청 없음": "", "시간 확정": "재실 청소", "쓰레기·수건만": "요청만", "청소 없음": "청소 X", "무응답·청소 없음": "무응답", "완료": "청소 완료" };
  // 반영 상태: 실시간 연결인지, 마지막으로 바뀐 내용을 언제 받았는지, 저장 중인지
  function liveLine() {
    const db = Store.backend && st.store === "db";
    const f = dayDoc(st.rdate), r = f && f.src && f.src.reservation;
    const recv = st.lastRecv ? hm(st.lastRecv).split(" ")[1] : "";
    return `<p class="live ${db ? "on" : "off"}"><i aria-hidden="true"></i>${db ? `${st.readOnly ? "보기 전용(저장 안 됨) · " : ""}실시간 반영 중${recv ? ` · 마지막 변경 ${esc(recv)}` : ""}` : "이 기기에만 저장(다른 기기와 공유 안 됨)"}${st.saving ? " · 저장 중…" : st.lastSaved ? ` · 내 저장 ${esc(hm(st.lastSaved).split(" ")[1])}` : ""}${st.saveErr ? ` · <span class="warnt">저장 실패: ${esc(st.saveErr)}</span>` : ""}${r ? ` · 숙박 상태는 예약표 ${esc(hm(r.at))} 기준` : ""}</p>`;
  }

  // 공유 DB 연결 상태 안내(v0.18). 왜 안 열렸는지 기기 상황별로 말하고, 할 일을 순서대로 보인다
  const SHARE_URL = "https://claude.ai/artifact/Xyoi3xDnSBmPDBi1dHPMNw";
  const inApp = () => {
    const ua = navigator.userAgent || "";
    if (/KAKAOTALK/i.test(ua)) return "카카오톡";
    if (/NAVER\(inapp/i.test(ua)) return "네이버 앱";
    if (/\bLine\//i.test(ua)) return "라인";
    if (/Instagram/i.test(ua)) return "인스타그램";
    if (/FBAN|FBAV/i.test(ua)) return "페이스북";
    if (/BAND\//i.test(ua)) return "밴드";
    if (/DaumApps/i.test(ua)) return "다음 앱";
    return "";
  };
  const copyBox = () => `<div class="copyrow"><input type="text" id="connUrl" readonly value="${SHARE_URL}" aria-label="이 시스템 링크"><button type="button" class="btn" id="connCopy">링크 복사</button></div>`;
  function connBanner() {
    const c = $("conn"); if (!c) return;
    if (st.store === "db" && !st.readOnly) { c.hidden = true; c.innerHTML = ""; return; }
    c.hidden = false;
    if (!st.store) { c.className = "conn wait"; c.innerHTML = `<b>공유 DB에 연결하는 중…</b><span>최대 10초 걸립니다. 연결되면 다른 기기에서 올린 예약표와 기록이 그대로 나옵니다.</span>`; return; }
    if (st.store === "db" && st.readOnly) {
      const who = st.me ? (st.names[st.me.id] || "이 계정") : "이 계정";
      c.className = "conn local ro";
      c.innerHTML = `<b>보기 전용으로 연결되었습니다 — 여기서 누른 내용은 저장되지 않습니다</b>
        <span>공유 DB는 열렸지만 ${esc(who)}에게 기록 권한이 없습니다. 다른 사람이 올린 내용은 실시간으로 보입니다.</span>
        <ul><li>시스템 소유자에게 이 계정을 공유 메뉴에서 <b>편집자(이메일 초대)</b> 또는 <b>참여자</b>로 추가해 달라고 요청해 주십시오.</li>
        <li>추가된 뒤 다시 연결을 누르면 기록할 수 있습니다.</li></ul>
        <button type="button" class="btn main" id="connRetry">다시 연결</button>`;
      return;
    }
    c.className = "conn local";
    const app = inApp(), signedOut = !st.me;
    const steps = app
      ? `<li><b>${esc(app)} 안의 브라우저로 열려 있습니다.</b> 이 안에서는 claude.ai 로그인이 유지되지 않습니다.</li>
         <li>오른쪽 아래(또는 위) <b>⋯ / 공유 버튼 → "다른 브라우저로 열기"(아이폰은 "Safari로 열기")</b>를 눌러 주십시오.</li>
         <li>열린 브라우저에서 claude.ai에 로그인한 뒤 이 링크를 다시 열어 주십시오. 메뉴가 없으면 아래 링크를 복사해 Safari·Chrome 주소창에 붙여 넣습니다.</li>`
      : signedOut
      ? `<li><b>claude.ai에 로그인되어 있지 않습니다.</b> 화면 위쪽(또는 아래 안내 창)의 <b>로그인</b>을 눌러 로그인해 주십시오.</li>
         <li>로그인 후 자동으로 연결되지 않으면 다시 연결을 눌러 주십시오.</li>
         <li>계정이 없으면 claude.ai에서 무료로 만들 수 있습니다. 이메일 주소를 소유자에게 알려 주어야 기록 권한을 받을 수 있습니다.</li>`
      : `<li>로그인은 되어 있으나 공유 DB가 열리지 않았습니다. 인터넷 연결을 확인한 뒤 다시 연결을 눌러 주십시오.</li>
         <li>계속 안 되면 claude.ai 화면(브라우저 또는 Claude 앱)에서 링크를 열어 주십시오.</li>`;
    c.innerHTML = `<b>공유 DB에 연결되지 않았습니다 — 이 화면은 다른 기기와 연동되지 않습니다</b>
      <span>다른 기기에서 올린 예약표·기록이 보이지 않고, 여기서 저장한 내용도 이 브라우저에만 남습니다.</span>
      <ul>${steps}</ul>${app ? copyBox() : ""}
      <button type="button" class="btn main" id="connRetry">다시 연결</button>`;
  }
  function connCard(name) {
    if (!st.store) return `<section class="card later-box"><h2>${esc(name)}</h2><p class="sub">공유 DB에서 객실 목록을 불러오는 중입니다.</p></section>`;
    return `<section class="card later-box"><h2>${esc(name)}</h2><p class="sub">공유 DB에 연결되지 않아 객실 목록을 불러오지 못했습니다. 위 안내를 확인해 주십시오. 예시 객실은 연결된 뒤에도 객실이 하나도 없을 때만 보입니다.</p></section>`;
  }

  function boardView() {
    if (boardM() === DEMO && st.store !== "db") return connCard("현황판");
    const M = boardM(), demo = M === DEMO;
    const by = roomTasks(M);
    const q = st.rq.replace(/호$/, "").trim();
    const dates = Object.keys(st.days).sort();
    const today = OPS.ymd(Date.now());
    const dateChips = weekChips();
    const needIds = new Set(), hotIds = new Set();
    by.forEach((ts, id) => {
      if (ts.some(t => Core.needsAck(t, st.role))) needIds.add(id);
      if (ts.some(t => t.priority === "긴급")) hotIds.add(id);
    });
    if (st.role === "HK" && !demo) svcRows().forEach(x => { if (OPS.Svc.hkNeedsAck(x)) needIds.add(x.id); });
    const K = demo ? null : kpiSets(M, by, needIds, hotIds);
    const fset = st.bf && K ? (K.sets[st.bf] || new Set()) : null;
    const mode = fset ? "grid" : st.bMode;   // 숫자를 눌러 거를 때는 블록으로 본다
    const blds = M.buildings.filter(b => st.rb === "all" || b.id === st.rb);
    // 현황판 한 칸 = 객실 하나의 모든 부서 상황: 숙박 상태 · 청소 단계 · 부서별 열린 업무 · 불출 · 긴급/미확인
    const svcBy = new Map(); if (!demo) svcRows().forEach(x => svcBy.set(x.id, x));
    const dBy = new Map(); if (st.rdate === today) st.deliv.filter(OPS.Desk.isOpen).forEach(d => dBy.set(d.roomId, (dBy.get(d.roomId) || 0) + 1));
    const tile = r => {
      const id = OPS.Rooms.roomId(r.b, r.no), s = roomState(id, st.rdate), ts = by.get(id) || [];
      const hot = hotIds.has(id), need = needIds.has(id), x = svcBy.get(id), stage = x ? SV_SHORT[OPS.Svc.status(x)] : "";
      const dc = { FO: 0, HK: 0, FM: 0 }; ts.forEach(t => { if (dc[t.toDept] != null) dc[t.toDept]++; });
      const late = x && x.s && x.s.late && !x.s.co ? x.s.late.time : "";
      const stTxt = [s && s.stay ? (STAY_SHORT[s.stay] || s.stay) : "", late ? "레이트 " + late : stage].filter(Boolean).join(" · ");
      const cls = ["rt", s && s.stay ? "st-" + (STAY_CLS[s.stay] || "") : "", hot ? "hot" : "", need ? "need" : "", x && x.s && x.s.done && x.type === "out" ? "ready" : ""].join(" ");
      const badges = ["FO", "HK", "FM"].filter(k => dc[k]).map(k => `<span class="dct dc-${k}">${esc((OPS.DEPTS.find(d => d.id === k) || {}).code || k)} ${dc[k]}</span>`).join("")
        + (dBy.get(id) ? `<span class="dct dv">불출 ${dBy.get(id)}</span>` : "") + (hasNote(id) ? `<span class="dct nt">비고</span>` : "");
      return `<button type="button" class="${cls}" data-room="${esc(id)}" aria-label="${esc(r.building)} ${esc(r.no)}호${stTxt ? ", " + esc(stTxt) : ""}${hot ? ", 긴급" : ""}${need ? ", 확인 필요" : ""}${ts.length ? ", 열린 업무 " + ts.length + "건" : ""}">
        <span class="rtop"><span class="tn">${esc(r.no)}</span>${hot ? `<span class="tf hot">긴급</span>` : need ? `<span class="tf need">미확인</span>` : ""}</span>
        <span class="ts">${esc(stTxt)}</span>
        ${badges ? `<span class="tds">${badges}</span>` : ""}
      </button>`;
    };
    const sections = blds.map(b => {
      let rooms = Object.values(M.rooms).filter(r => r.b === b.id);
      if (q) rooms = rooms.filter(r => r.no.startsWith(q));
      if (st.bNeed) rooms = rooms.filter(r => needIds.has(OPS.Rooms.roomId(r.b, r.no)) || by.has(OPS.Rooms.roomId(r.b, r.no)));
      if (fset) rooms = rooms.filter(r => fset.has(OPS.Rooms.roomId(r.b, r.no)));
      if (!rooms.length) return "";
      const floors = {};
      rooms.forEach(r => { (floors[floorOf(r.no)] = floors[floorOf(r.no)] || []).push(r); });
      const fl = Object.keys(floors).sort((a, c) => +c - +a);
      return `<section class="card bsec">${multiB() ? `<h2>${esc(b.name)} <span class="c">${rooms.length}실</span></h2>` : ""}
        ${fl.map(f => `<div class="floor"><span class="fl">${esc(f)}F</span><div class="tiles">${floors[f].sort((a, c) => +a.no - +c.no).map(tile).join("")}</div></div>`).join("")}
      </section>`;
    }).join("");
    return `<section class="card">
      <div class="rbar" style="margin-bottom:6px">
        <h2 style="margin:0">현황판</h2>
        <div class="seg2" role="group" aria-label="보기 방식"><button type="button" data-bmode="grid" aria-pressed="${mode === "grid"}">블록</button><button type="button" data-bmode="plan" aria-pressed="${mode === "plan"}">배치도</button></div>
      </div>
      ${fset ? `<p class="bfline">「${esc(K.label[st.bf] || "")}」 객실 ${countIn(fset)}실만 보는 중 <button type="button" class="lnk" data-bf="${esc(st.bf)}">전체 보기</button></p>` : ""}
      <div class="rbar">
        <input id="rq" type="search" inputmode="numeric" placeholder="호수 검색" value="${esc(st.rq)}" aria-label="호수 검색">
        <div class="chips dates">${dateChips.map(x => `<button type="button" data-rdate="${esc(x)}" aria-pressed="${x === st.rdate}">${esc(x.slice(5).replace("-", "/"))}${x === today ? " 오늘" : ""}</button>`).join("")}</div>
        ${multiB() && mode === "grid" ? `<div class="chips">${[{ id: "all", name: "전체" }].concat(M.buildings).map(b => `<button type="button" data-rb="${esc(b.id)}" aria-pressed="${b.id === st.rb}">${esc(b.name)}</button>`).join("")}</div>` : ""}
        ${mode === "grid" && !fset ? `<label class="tg"><input type="checkbox" id="bNeed" ${st.bNeed ? "checked" : ""}> 업무 있는 객실만</label>` : ""}
      </div>
      ${demo ? `<p class="demo">예시 객실입니다. 관리자 역할의 설정 탭에서 객실을 등록하거나 예약표를 한 번 올리면 실제 객실로 바뀝니다.</p>` : ""}
      ${!demo ? dayNote() : ""}
      ${!demo ? liveLine() : ""}
      <details class="lgd" ${st.lgOpen ? "open" : ""}><summary>표시 설명</summary><div class="legend2"><span><span class="tf hot">긴급</span> 긴급 업무</span><span><span class="tf need">미확인</span> ${esc(OPS.deptName(st.role))} 화면에서 아직 안 본 것</span><span><span class="dct dc-FO">FO 1</span><span class="dct dc-HK">HK 1</span><span class="dct dc-FM">ENG 1</span> 부서별 열린 업무</span><span><span class="dct dv">불출 1</span> 진행 중 불출</span><span class="lgb lg-out">퇴실</span><span class="lgb lg-in">입실</span><span class="lgb lg-stay">연박</span><span class="lgb lg-free">공실</span><span class="lgb lg-ready">입실 가능</span></div></details>
    </section>
    ${mode === "plan" ? planView(M, by, needIds, hotIds, q) : sections || `<div class="empty">해당하는 객실이 없습니다.</div>`}`;
  }

  // ---------- 현황 숫자(v0.10) ----------
  // 숫자 하나 = 객실 묶음 하나. 누르면 객실판이 그 객실만 보여 준다.
  const inRb = id => { const r = boardM().rooms[id]; return !!r && (st.rb === "all" || r.b === st.rb); };
  const countIn = set => Array.from(set).filter(inRb).length;
  function kpiSets(M, by, needIds, hotIds) {
    const sets = {}, add = (k, id) => { (sets[k] = sets[k] || new Set()).add(id); };
    const now = Date.now();
    sets.need = new Set(needIds); sets.hot = new Set(hotIds); sets.late = new Set(); sets.mine = new Set();
    by.forEach((ts, id) => {
      if (ts.some(t => Core.isOverdue(t, now))) add("late", id);
      if (ts.some(t => t.toDept === st.role)) add("mine", id);
    });
    const day = dayDoc(st.rdate), hasDay = !!(day || manualOn(st.rdate));
    const rows = hasDay ? svcRows() : [];
    ["pre", "ing", "ready", "reply", "todo", "deliv"].forEach(k => { sets[k] = new Set(); });
    rows.forEach(x => {
      const s = x.s || {};
      if (x.type === "out" && !s.ext) {
        if (s.done) add("ready", x.id); else if (s.co) add("ing", x.id); else add("pre", x.id);
      }
      if (OPS.Svc.foNeeds(x)) add("reply", x.id);
      if (OPS.Svc.hkTodo(x)) add("todo", x.id);
    });
    if (st.rdate === OPS.ymd(now)) st.deliv.forEach(d => {
      if (!d.roomId || !M.rooms[d.roomId]) return;
      if (d.fail && !d.cancel) add("reply", d.roomId);
      if (OPS.Desk.isOpen(d) && !d.go) add("deliv", d.roomId);
    });
    const rc = OPS.Dash.ready(rows.filter(x => inRb(x.id)));
    ["ready", "clean", "wait", "pre"].forEach(k => { sets["rd-" + k] = new Set(rc.ids[k]); });
    const dn = OPS.deptName(st.role);
    const label = { need: dn + " 확인 필요", hot: "긴급", late: "기한 초과", mine: "우리 부서 업무", pre: "퇴실 전", ing: "청소 대기·중", ready: "입실 가능", reply: "프론트가 답할 것", todo: "할 청소", deliv: "불출 출발 전",
      "rd-ready": "당일 입실 · 입실 가능", "rd-clean": "당일 입실 · 청소 중·점검 대기", "rd-wait": "당일 입실 · 퇴실완, 청소 대기", "rd-pre": "당일 입실 · 아직 퇴실 전" };
    return { sets, label, hasDay, rows, rc, arr: OPS.Dash.arrivals(Object.keys(M.rooms).filter(inRb), id => roomState(id, st.rdate)), fresh: OPS.Dash.freshness(day, st.rdate, now) };
  }
  // 부서마다 그 부서가 행동할 숫자만. tone: 0이 아니면 그 색으로(글자로도 말한다)
  const KPI_BY_ROLE = {
    FO: [["reply", "hot"], ["need", "acc"], ["hot", "hot"], ["late", "warn"], ["pre"], ["ing"], ["ready", "ok"]],
    MG: [["need", "acc"], ["hot", "hot"], ["late", "warn"], ["reply", "hot"], ["pre"], ["ing"], ["ready", "ok"]],
    HK: [["need", "acc"], ["todo", "acc"], ["deliv", "warn"], ["hot", "hot"], ["pre"], ["ready", "ok"]],
    FM: [["need", "acc"], ["mine", "acc"], ["hot", "hot"], ["late", "warn"]]
  };
  const SVC_KEYS = new Set(["pre", "ing", "ready", "reply", "todo"]);
  const KPI_SHORT = { reply: "답할 것", need: "확인 필요", hot: "긴급", late: "기한 초과", mine: "우리 업무", pre: "퇴실 전", ing: "청소 대기·중", ready: "입실 가능", todo: "할 청소", deliv: "불출 대기" };
  function kpiStrip(K) {
    const list = KPI_BY_ROLE[st.role].filter(([k]) => K.hasDay || !SVC_KEYS.has(k));
    const tile = ([k, tone]) => {
      const n = countIn(K.sets[k] || new Set());
      return `<button type="button" class="kpi ${n && tone ? "t-" + tone : ""}" data-bf="${k}" aria-pressed="${st.bf === k}" ${n ? "" : "disabled"} aria-label="${esc(K.label[k])} ${n}실${n ? ", 누르면 이 객실만 보기" : ""}"><b>${n}</b><span>${esc(KPI_SHORT[k])}</span></button>`;
    };
    return `<div class="kpis" role="group" aria-label="${esc(OPS.deptName(st.role))} 지금 숫자(객실 수)">${list.map(tile).join("")}</div>`;
  }
  // 입실 준비: 당일 퇴실 후 입실 객실이 어느 단계에 있는가(진행이 클수록 짙은 초록)
  const RD = [["ready", "입실 가능"], ["clean", "청소 중·점검 대기"], ["wait", "퇴실완·청소 대기"], ["pre", "아직 퇴실 전"]];
  function readyBar(rc, arr, fresh, opts) {
    const o = opts || {};
    const head = rc.total
      ? `<div class="rdyh"><span class="rdyn"><b>${rc.ready}</b> / ${rc.total}</span><span>당일 입실 객실 입실 가능${arr ? ` · 빈 방 입실 ${arr.empty}실 별도` : ""}${rc.ext ? ` · 연장 ${rc.ext}실 제외` : ""}</span></div>`
      : `<div class="rdyh"><span>${arr && arr.inn ? `오늘 입실 ${arr.inn}실은 모두 빈 방 입실이라 준비할 퇴실 객실이 없습니다.` : "당일 퇴실 후 입실하는 객실이 없습니다."}</span></div>`;
    const seg = rc.total ? `<div class="rdyb" role="img" aria-label="${RD.map(([k, n]) => n + " " + rc[k] + "실").join(", ")}">${RD.filter(([k]) => rc[k]).map(([k, n]) => `<span class="rs-${k}" style="flex-grow:${rc[k]}" title="${esc(n)} ${rc[k]}실"></span>`).join("")}</div>
      <div class="rdyl">${RD.map(([k, n]) => !rc[k] ? `<span class="rl-i zero"><i class="rs-${k}"></i>${esc(n)} <b>0</b></span>` : `<button type="button" class="rl-i" ${o.go ? `data-gotab="board" data-bfset="rd-${k}"` : `data-bf="rd-${k}" aria-pressed="${st.bf === "rd-" + k}"`}><i class="rs-${k}"></i>${esc(n)} <b>${rc[k]}</b></button>`).join("")}</div>` : "";
    const f = fresh || {};
    const when = f.at ? `예약표 ${esc(hm(f.at))} 기준` : "예약표 반영 없음(직접 추가 예약만)";
    const warn = f.stale ? ` <span class="warnt">어제 올린 예약표로 계산한 예정 값입니다. 오늘 예약표를 올려야 정확합니다.</span>` : "";
    return `${head}${seg}<p class="rdyf">${when} · 청소 단계는 실시간${warn}</p>`;
  }
  // ---------- 현황판(관리자 첫 화면) ----------
  function dashView() {
    const M = boardM(), demo = M === DEMO, now = Date.now(), D = OPS.Dash;
    const today = OPS.ymd(now);
    const T = D.totals(st.tasks, now), L = D.deptLoad(st.tasks, now);
    const by = roomTasks(M), needIds = new Set(), hotIds = new Set();
    by.forEach((ts, id) => { if (ts.some(t => Core.needsAck(t, "MG"))) needIds.add(id); if (ts.some(t => t.priority === "긴급")) hotIds.add(id); });
    const K = demo ? null : kpiSets(M, by, needIds, hotIds);
    const go = (tab, extra) => `data-gotab="${tab}"${extra || ""}`;
    const kpi = (n, label, tone, attrs, title) => `<button type="button" class="kpi big ${n && tone ? "t-" + tone : ""}" ${attrs} title="${esc(title)}"><b>${n}</b><span>${esc(label)}</span></button>`;
    const taskKpis = `<div class="kpis big" role="group" aria-label="업무 숫자">
      ${kpi(T.hot, "긴급", "hot", go("work"), "긴급 열린 업무(보류 제외). 누르면 할 일 화면")}
      ${kpi(T.late, "기한 초과", "warn", go("work"), "기한이 지난 열린 업무")}
      ${kpi(T.confirm, "완료 확인 대기", "acc", go("work"), "처리 부서가 끝냈다고 보고했고 요청 부서 확인이 남은 업무")}
      ${kpi(T.open, "열린 업무", "", go("work"), "접수·배정·진행·확인 대기·보류 전체")}
      ${kpi(T.hold, "보류", "", go("work"), "보류 중 업무")}
      ${kpi(T.doneToday, "오늘 완료", "ok", go("log"), "오늘 완료 처리된 업무. 누르면 이력")}
    </div>`;
    // 현장 지금: 숫자마다 갈 화면이 있다
    const rows = K ? K.rows : [];
    const hkAck = rows.filter(OPS.Svc.hkNeedsAck).length, stayWait = rows.filter(x => x.type === "stay" && !(x.s || {}).reply).length;
    const dOpen = st.deliv.filter(OPS.Desk.isOpen), dSlow = dOpen.filter(d => now - d.at >= 30 * 60000).length, dFail = st.deliv.filter(d => d.fail && !d.cancel).length;
    const lostKeep = st.lost.filter(x => x.status === "보관").length;
    const line = (n, label, sub, attrs, tone) => `<button type="button" class="dline ${n && tone ? "t-" + tone : ""}" ${attrs}><b>${n}</b><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span><i aria-hidden="true">›</i></button>`;
    const fieldCard = `<section class="card"><h2>현장 지금</h2><p class="sub">누르면 처리하는 화면으로 갑니다.</p><div class="dlines">
      ${K && K.hasDay ? line(countIn(K.sets.reply), "프론트가 답할 것", "키핑 \"아직 재실\" 알림 · 불출 \"못 함\"", go("board", ` data-bfset="reply"`), "hot") : ""}
      ${K && K.hasDay ? line(hkAck, "키핑 미확인", "새 퇴실완·재실 요청·우선 준비", go("svc"), "acc") : ""}
      ${K && K.hasDay ? line(stayWait, "재실 요청 미입력", "시간·청소 종류를 아직 안 적은 재실 객실(안 적으면 정비 안 함)", go("svc"), "") : ""}
      ${line(dOpen.length, "불출 진행 중", dSlow ? `30분 넘은 요청 ${dSlow}건` : "", go("desk"), dSlow ? "warn" : "")}
      ${line(dFail, "불출 못 함(오늘)", "프론트가 고객에게 다시 안내", go("desk"), "hot")}
      ${line(lostKeep, "분실물 보관 중", "", go("desk"), "")}
    </div>${K && !K.hasDay ? `<p class="sub" style="margin:10px 0 0">${esc(st.rdate.slice(5).replace("-", "/"))} 예약표가 없어 청소·재실 숫자는 뺐습니다.</p>` : ""}</section>`;
    const readyHtml = K && K.hasDay && (K.rc.total || K.arr.inn) ? `<section class="card rdy"><h2>입실 준비 <span class="sub" style="margin:0;font-weight:500">${esc(st.rdate.slice(5).replace("-", "/"))}${st.rdate === today ? " 오늘" : " 예정"}</span></h2>${readyBar(K.rc, K.arr, K.fresh, { go: true })}</section>` : "";
    // 부서별 열린 업무
    const depts = OPS.DEPTS.filter(d => d.id !== "MG"), max = Math.max(1, ...depts.map(d => L[d.id].open));
    const deptCard = `<section class="card"><h2>부서별 열린 업무</h2><p class="sub">받은 부서 기준. 막대 = 열린 업무 수.</p><div class="hbars">
      ${depts.map(d => { const o = L[d.id]; return `<button type="button" class="hb" ${go("work")} aria-label="${esc(d.name)} 열린 업무 ${o.open}건, 대기 ${o.wait}, 진행 ${o.doing}, 확인 대기 ${o.confirm}, 보류 ${o.hold}">
        <span class="hbl"><span class="dc dc-${d.id}">${esc(d.code)}</span>${esc(d.name)}</span>
        <span class="hbt"><span class="hbf" style="width:${o.open ? Math.max(3, o.open / max * 100) : 0}%"></span><b>${o.open}</b></span>
        <span class="hbs">대기 ${o.wait} · 진행 ${o.doing} · 확인 대기 ${o.confirm} · 보류 ${o.hold}${o.hot ? ` · <span class="warnt">긴급 ${o.hot}</span>` : ""}${o.late ? ` · <span class="warnt">기한 초과 ${o.late}</span>` : ""}</span></button>`; }).join("")}
    </div></section>`;
    const old = D.oldest(st.tasks, 5);
    const oldCard = `<section class="card"><h2>오래 열린 업무</h2><p class="sub">보류 제외, 등록이 오래된 순. 누르면 업무를 엽니다.</p>${old.length ? `<div class="olist">${old.map(t => `<button type="button" class="ol" data-open="${esc(t.id)}"><span class="oa">${esc(D.dur(Math.round((now - t.createdAt) / 60000)))}</span><span class="ot"><span><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${t.room ? esc((bTag(t) ? bTag(t) + " " : "") + t.room) + " · " : ""}${esc(t.title)}</span><small>${esc(OPS.deptName(t.toDept))} · ${esc(t.status)}</small></span></button>`).join("")}</div>` : `<div class="empty">열린 업무가 없습니다.</div>`}</section>`;
    // 응답 시간·반복
    const R = D.response(st.tasks, now, 7, 5);
    const respCard = `<section class="card"><h2>응답 시간 <span class="sub" style="margin:0;font-weight:500">최근 7일</span></h2><p class="sub">다른 부서가 보낸 업무가 등록부터 "시작"을 누를 때까지 걸린 시간의 가운데 값. 버튼을 누른 시각 기준이라 실제보다 늦게 잡힐 수 있습니다. 5건 미만이면 표시하지 않습니다.</p>
      <div class="resp">${depts.map(d => `<div class="rp"><span class="dc dc-${d.id}">${esc(d.code)}</span><span class="rpn">${R[d.id].median == null ? `<span class="sub" style="margin:0">표본 ${R[d.id].n}건</span>` : `<b>${esc(D.dur(R[d.id].median))}</b><small>${R[d.id].n}건</small>`}</span></div>`).join("")}</div></section>`;
    const P = D.repeats(st.tasks, now, demo ? null : M, 30, 10);
    const rmax = Math.max(1, ...P.rooms.map(x => x.n)), cmax = Math.max(1, ...P.cats.map(x => x.n));
    const rank = (arr, mx, attr) => arr.length ? `<div class="hbars sm">${arr.map(x => `<${attr ? "button type=\"button\"" : "div"} class="hb" ${attr ? attr(x) : ""}><span class="hbl">${esc(x.label)}</span><span class="hbt"><span class="hbf" style="width:${Math.max(3, x.n / mx * 100)}%"></span><b>${x.n}</b></span></${attr ? "button" : "div"}>`).join("")}</div>` : `<div class="empty" style="padding:8px 0">두 번 이상 나온 객실이 없습니다.</div>`;
    const repCard = `<section class="card"><h2>반복 발생 <span class="sub" style="margin:0;font-weight:500">최근 30일 이슈·수리 ${P.n}건</span></h2>${P.enough ? `<div class="cols2"><div><h4 class="mini">객실</h4>${rank(P.rooms, rmax, x => `data-room="${esc(x.id)}" aria-label="${esc(x.label)}호 ${x.n}건, 누르면 객실 상세"`)}</div><div><h4 class="mini">분류</h4>${rank(P.cats, cmax)}</div></div>` : `<p class="sub" style="margin:0">기록이 10건 이상 쌓이면 표시합니다. 적은 표본의 순위는 우연과 구분되지 않습니다.</p>`}</section>`;
    const fresh = K ? K.fresh : {};
    const dates = weekChips();
    return `<section class="card dhead"><div class="rbar" style="margin:0"><h2 style="margin:0">통계</h2>
        <div class="chips dates">${dates.map(x => `<button type="button" data-rdate="${esc(x)}" aria-pressed="${x === st.rdate}">${esc(x.slice(5).replace("-", "/"))}${x === today ? " 오늘" : ""}</button>`).join("")}</div>
        ${multiB() ? `<div class="chips">${[{ id: "all", name: "전체" }].concat(M.buildings).map(b => `<button type="button" data-rb="${esc(b.id)}" aria-pressed="${b.id === st.rb}">${esc(b.name)}</button>`).join("")}</div>` : ""}</div>
      <p class="sub" style="margin:8px 0 0">지금 <span data-now>${esc(hm(now))}</span> · 업무·청소·불출은 실시간${fresh.at ? ` · 객실 상태는 예약표 ${esc(hm(fresh.at))} 기준` : ""}${fresh.stale ? ` <span class="warnt">(어제 올린 예약표의 예정 값)</span>` : ""}${demo ? " · 객실 미등록이라 객실 숫자는 없습니다" : ""}</p></section>
      ${taskKpis}
      <div class="dgrid">${readyHtml}${fieldCard}${deptCard}${oldCard}${respCard}${repCard}</div>`;
  }

  function readyCard(K) {
    if (!K.hasDay) return "";
    if (!K.rc.total && !K.arr.inn) return "";
    return `<section class="card rdy"><h2>입실 준비 <span class="sub" style="margin:0;font-weight:500">${esc(st.rdate.slice(5).replace("-", "/"))}${st.rdate === OPS.ymd(Date.now()) ? " 오늘" : " 예정"}</span></h2>${readyBar(K.rc, K.arr, K.fresh)}</section>`;
  }

  // 객실 목록은 그대로 두고, 그날 상태(퇴실·입실·연박)만 예약표·청소표로 덧입힌다
  function dayNote() {
    const d = dayDoc(st.rdate);
    if (d && (d.rooms || d.cleanSheet)) {
      const src = d.src || {};
      return `<p class="sub" style="margin:0 0 6px">${esc(st.rdate.slice(5).replace("-", "/"))} 상태: ${[src.reservation ? "예약표 " + hm(src.reservation.at) : "", src.clean ? "청소표 " + hm(src.clean.at) : "", manualOn(st.rdate) ? "직접 추가 예약" : ""].filter(Boolean).map(esc).join(" · ")} 반영</p>`;
    }
    const last = Object.keys(st.days).filter(k => st.days[k] && (st.days[k].rooms || st.days[k].cleanSheet)).sort().pop();
    return `<p class="sub" style="margin:0 0 6px">${esc(st.rdate.slice(5).replace("-", "/"))} 숙박 상태가 아직 없습니다. 객실판은 그대로 쓰고, 예약표를 올리면 퇴실·입실·연박이 표시됩니다${last ? ` (마지막 반영 ${esc(last.slice(5).replace("-", "/"))})` : ""}.</p>`;
  }

  // ---------- 청소·재실(프론트 ↔ 키핑) ----------
  function svcSubscribe() {
    if (st.svcDate === st.rdate || !Store.backend) return;
    if (st.svcUnsub) { try { st.svcUnsub(); } catch (e) {} }
    st.svcDate = st.rdate; st.svc = {};
    st.svcUnsub = Store.watchWhere(COL.roomSvc, "date", st.rdate, list => {
      const o = {}; list.forEach(x => { if (x.roomId) o[x.roomId] = x; }); st.svc = o;
      if (st.tab === "svc" || st.tab === "board" || st.tab === "dash" || st.openRoomId) render();
    }, e => flash("청소 기록 동기화 오류: " + (e && e.message || e)));
  }
  const svcRows = () => { const M = boardM(); return M === DEMO || !(dayDoc(st.rdate) || manualOn(st.rdate)) ? [] : OPS.Svc.rows(M, id => roomState(id, st.rdate), st.svc); };
  const SVC_CLS = { "입실 가능": "ok", "점검 대기": "go", "청소 중": "go", "키핑: 아직 재실": "warn", "연장·청소 없음": "off", "완료": "ok", "시간 확정": "go", "쓰레기·수건만": "go", "퇴실완·청소 대기": "go", "회신 대기": "wait", "발송 전": "wait", "요청 없음": "wait", "퇴실 전": "wait", "청소 없음": "off", "무응답·청소 없음": "off" };
  const rLabel = r => (multiB() ? (r.building || "") + " " : "") + r.no;
  const tAt = o => (o && o.at ? hm(o.at).split(" ")[1] : "");

  function svcView() {
    const M = boardM();
    if (M === DEMO && st.store !== "db") return connCard("청소·재실");
    if (M === DEMO) return `<section class="card later-box"><h2>청소·재실</h2><p class="sub">객실이 등록되어야 씁니다. 관리자 역할의 설정 탭에서 객실을 등록하거나 예약표·청소표를 올려 주십시오.</p></section>`;
    const today = OPS.ymd(Date.now());
    const dates = weekChips();
    const d = dayDoc(st.rdate) || (manualOn(st.rdate) ? {} : null);
    let list = svcRows();
    if (st.rb !== "all") list = list.filter(x => x.r.b === st.rb);
    const sm = OPS.Svc.summary(list);
    const head = `<section class="card"><div class="rbar" style="margin-bottom:6px"><h2 style="margin:0">청소·재실</h2>
        <div class="chips dates">${dates.map(x => `<button type="button" data-rdate="${esc(x)}" aria-pressed="${x === st.rdate}">${esc(x.slice(5).replace("-", "/"))}${x === today ? " 오늘" : ""}</button>`).join("")}</div>
        ${multiB() ? `<div class="chips">${[{ id: "all", name: "전체" }].concat(M.buildings).map(b => `<button type="button" data-rb="${esc(b.id)}" aria-pressed="${b.id === st.rb}">${esc(b.name)}</button>`).join("")}</div>` : ""}</div>
      ${d ? `<div class="sums" style="margin:0"><span class="sum">재실 <b>${sm.stay}</b></span><span class="sum stay">정비 요청 <b>${sm.time}</b></span><span class="sum">청소 X <b>${sm.refuse}</b></span><span class="sum free">요청 없음 <b>${sm.wait + sm.none}</b></span><span class="sum out">퇴실 <b>${sm.out}</b> (퇴실완 ${sm.co})</span><span class="sum in">완료 <b>${sm.done}</b></span>${sm.ack ? `<span class="needbtn" style="padding:2px 10px">키핑 미확인 <b>${sm.ack}</b></span>` : ""}</div>` : ""}
      ${d ? houseLine() : ""}
      <p class="sub" style="margin:8px 0 0">재실: 요청 시간대(시작~끝)·청소 종류 입력 → 키핑 확인 → 완료. 요청이 없으면 정비하지 않습니다. 퇴실: 퇴실완 → 키핑 확인 → 완료. 비밀번호를 제공한 객실은 퇴실완 때 비번 변경 업무가 생깁니다.</p>
    </section>`;
    const tools = (st.role === "FO" || st.role === "MG") ? frontTools(M) : "";
    if (!d) return head + tools + `<div class="empty">${esc(st.rdate)} 객실 상태가 없습니다. 예약표를 반영하거나 예약을 직접 추가하면 재실·퇴실 목록이 생깁니다.</div>`;
    if (st.role === "HK") return head + hkView(list);
    if (st.role === "FM") return head + `<section class="card"><p class="sub">시설 역할은 보기만 합니다. 청소 중 발견한 시설 이상은 키핑이 객실에서 업무로 등록합니다.</p>${foView(list, true)}</section>`;
    return head + foView(list, false) + tools;
  }

  // ---------- 불출·분실물(키핑·시설 톡방 대체) ----------
  const mins = at => Math.max(0, Math.round((Date.now() - at) / 60000));
  const D_CLS = { "요청": "wait", "가는 중": "go", "완료": "ok", "일부 완료": "go", "불가": "warn", "취소": "off" };
  function roomPick(prefix, M, pf) {
    const blds = M.buildings || [];
    return `${blds.length > 1 ? `<label class="f">동<select id="${prefix}B">${blds.map(b => `<option value="${esc(b.id)}" ${pf && pf.b === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>` : ""}
      <label class="f">호수<input id="${prefix}No" inputmode="numeric" list="${prefix}List" placeholder="예: 1512" required value="${esc(pf && pf.no || "")}"><datalist id="${prefix}List">${Array.from(new Set(Object.values(M.rooms).map(r => r.no))).sort((a, b) => +a - +b).map(n => `<option value="${esc(n)}">`).join("")}</datalist></label>`;
  }
  function readRoom(prefix) {
    const M = boardM();
    const b = $(prefix + "B") ? $(prefix + "B").value : (M.buildings[0] || {}).id;
    const no = String(+String($(prefix + "No").value).replace(/호$/, "").trim() || "");
    const id = OPS.Rooms.roomId(b, no), r = M.rooms[id];
    if (!r) throw new Error(((M.buildings.find(x => x.id === b) || {}).name || "") + " " + no + "호는 객실 목록에 없습니다. 동을 확인해 주십시오.");
    return { roomId: id, b, no, building: r.building || "" };
  }
  function deskView() {
    const M = boardM();
    if (M === DEMO && st.store !== "db") return connCard("불출·분실물");
    if (M === DEMO) return `<section class="card later-box"><h2>불출·분실물</h2><p class="sub">객실이 등록되어야 씁니다. 관리자 설정에서 객실을 등록하거나 예약표를 올려 주십시오.</p></section>`;
    const D = OPS.Desk, role = st.role, fo = role === "FO" || role === "MG", hk = role === "HK" || role === "MG";
    const open = D.sortOpen(st.deliv.filter(D.isOpen)), closed = st.deliv.filter(d => !D.isOpen(d)).sort((a, b) => (b.updatedAt || b.at) - (a.updatedAt || a.at));
    const sum = { big: 0, small: 0 }; st.deliv.filter(d => !d.cancel).forEach(d => { sum.big += (d.items || {}).big || 0; sum.small += (d.items || {}).small || 0; });
    const lbl = d => (multiB() ? (d.building || "") + " " : "") + d.no;
    const dRow = d => {
      const stt = D.status(d), age = mins(d.at), slow = D.isOpen(d) && age >= 30;
      return `<div class="srow ${D.isOpen(d) && hk && !d.go ? "pend" : ""}">
        <div class="sh"><b class="sn">${esc(lbl(d))}</b><span class="chip ${D_CLS[stt] || ""}">${esc(stt)}</span>${d.urgent ? `<span class="chip warn">긴급</span>` : ""}${d.due ? `<span class="chip k">${esc(d.due)}까지</span>` : ""}<span>${esc(D.line(d))}</span></div>
        <div class="sx">${esc(D.methodName(d.method))}${d.guestIn ? " · 손님 객실 안" : ""}${hk ? ` <span class="w" style="display:inline">/ ${esc(D.line(d, true))} · ${esc(D.methodName(d.method, true))}${d.guestIn ? " · guest in room" : ""}</span>` : ""}</div>
        <div class="sa"><span class="w ${slow ? "warnt" : ""}">요청 ${esc(whoLine(d, { short: true }))} (${age}분 전)${d.go ? ` · 출발 ${esc(whoLine(d.go, { short: true }))}` : ""}${d.done ? ` · 완료 ${esc(whoLine(d.done, { short: true }))}${d.done.note ? " (" + esc(d.done.note) + ")" : ""}` : ""}${d.fail ? ` · 불가(${esc(whoLine(d.fail, { short: true }))}): ${esc(d.fail.why)}` : ""}</span>
          ${D.isOpen(d) && hk ? `${d.go ? "" : `<button type="button" class="btn sm" data-desk="go" data-id="${esc(d.id)}">가는 중</button>`}<button type="button" class="btn sm main" data-desk="done" data-id="${esc(d.id)}">완료</button><button type="button" class="btn sm" data-desk="part" data-id="${esc(d.id)}">일부만</button><button type="button" class="btn sm" data-desk="fail" data-id="${esc(d.id)}">못 함</button>` : ""}
          ${D.isOpen(d) && fo ? `<button type="button" class="lnk" data-desk="cancel" data-id="${esc(d.id)}">취소</button>` : ""}
          ${!D.isOpen(d) && !d.cancel && fo ? `<button type="button" class="lnk" data-desk="reopen" data-id="${esc(d.id)}">다시 요청</button>` : ""}</div>
        ${st.dNote === d.id ? `<div class="sedit"><input id="dn-${esc(d.id)}" maxlength="80" placeholder="${st.dNoteKind === "fail" ? "이유 예: 큰수건 재고 없음 / no large towel" : "한 것 예: 큰수건 대신 작은수건 4"}"><div class="acts" style="margin:0"><button type="button" class="btn sm main" data-desk="${st.dNoteKind === "fail" ? "failok" : "partok"}" data-id="${esc(d.id)}">저장</button><button type="button" class="btn sm" data-desk="noteclose" data-id="${esc(d.id)}">닫기</button></div></div>` : ""}
      </div>`;
    };
    const num = (id, label, en) => `<label class="qcell" title="${esc(en)}"><span>${esc(label)}</span><input type="number" id="${id}" min="0" max="99" value="" placeholder="0" inputmode="numeric"></label>`;
    const form = fo ? `<section class="card"><h2>불출 요청</h2><p class="sub">객실 → 품목·수량 → 방법. 키핑 화면에 한/영으로 뜨고, 키핑이 그 요청에서 완료를 누르면 여기서 바로 보입니다.</p>
      <form id="dForm" class="new" data-keep autocomplete="off">
        <div class="row2">${roomPick("dq", M, null)}</div>
        <div class="qgrid">${D.ITEMS.map(i => num("di-" + i.id, i.ko, i.en)).join("")}</div>
        <div class="acts" style="flex-wrap:wrap;gap:6px 14px">${D.TASKS.map(t => `<label class="tg"><input type="checkbox" id="dt-${t.id}"> ${esc(t.ko)}</label>`).join("")}</div>
        <div class="row2"><label class="f">방법<select id="dMethod">${D.METHODS.map(m => `<option value="${m.id}">${esc(m.ko)}</option>`).join("")}</select></label>
          <label class="f">기한(선택)<input type="time" id="dDue" step="600"></label></div>
        <label class="f">기타(선택)<input id="dOther" maxlength="80" placeholder="예: 퀸 이불 시트 1"></label>
        <div class="acts" style="flex-wrap:wrap;gap:6px 14px"><label class="tg"><input type="checkbox" id="dIn"> 손님 객실 안</label><label class="tg"><input type="checkbox" id="dUrg"> 긴급</label></div>
        <button class="btn main" type="submit">${st.dForce ? "그래도 보내기" : "요청 보내기"}</button>
        <div class="msg ${st.dForce ? "err" : ""}" id="dMsg" aria-live="polite">${esc(st.dMsg)}</div></form></section>` : "";
    const list = `<section class="card"><h2>진행 중 <span class="c">${open.length}</span></h2><p class="sub">긴급 → 기한 → 들어온 순. 30분이 넘은 요청은 시간이 붉게 보입니다. 오늘 요청 합계: 큰수건 ${sum.big} · 작은수건 ${sum.small}.</p>
        ${open.length ? `<div class="slist">${open.map(dRow).join("")}</div>` : `<div class="empty">진행 중인 요청이 없습니다.</div>`}
        <p style="margin:10px 0 0"><button type="button" class="lnk" data-desk="toggleDone">${st.dDone ? "끝난 요청 숨기기" : `끝난 요청 보기 (${closed.length})`}</button></p>
        ${st.dDone && closed.length ? `<div class="slist">${closed.slice(0, 40).map(dRow).join("")}</div>` : ""}</section>`;
    // 수건 재고
    const today = OPS.ymd(Date.now());
    const stockRow = b => {
      const x = st.stock[b.id];
      return `<div class="srow"><div class="sh"><b class="sn">${esc(b.name)}</b>${x ? `<span>큰수건 <b>${x.big}</b> · 작은수건 <b>${x.small}</b></span>${x.dry ? `<span class="w" style="display:inline">${esc(x.dry)}</span>` : ""}<span class="w ${mins(x.at) > 180 ? "warnt" : ""}" style="display:inline">${esc(whoLine(x, { short: true }))} (${mins(x.at)}분 전)</span>` : `<span class="w" style="display:inline">오늘 기록 없음</span>`}</div>
        ${hk ? `<form class="acts" data-keep data-stock="${esc(b.id)}" style="margin:6px 0 0;flex-wrap:wrap"><label class="tw">큰<input type="number" id="sb-${esc(b.id)}" min="0" max="999" style="width:64px" value="${x ? x.big : ""}"></label><label class="tw">작은<input type="number" id="ss-${esc(b.id)}" min="0" max="999" style="width:64px" value="${x ? x.small : ""}"></label><input id="sd-${esc(b.id)}" maxlength="40" placeholder="세탁·건조 중 (예: 203호 큰 10)" value="${esc(x && x.dry || "")}" style="flex:1;min-width:140px"><button class="btn sm main" type="submit">저장</button></form>` : ""}</div>`;
    };
    const stock = `<section class="card"><h2>수건 재고 (오늘)</h2><p class="sub">키핑이 린넨실 수량을 적으면 모두에게 보입니다. 3시간 넘게 갱신이 없으면 시간이 붉게 보입니다.</p><div class="slist">${(M.buildings || []).map(stockRow).join("")}</div><div class="msg" aria-live="polite">${esc(st.sMsg)}</div></section>`;
    // 분실물
    const q = String(st.lq || "").trim();
    const lost = st.lost.filter(x => !q || String(x.no).startsWith(q) || String(x.item).includes(q)).sort((a, b) => b.at - a.at).slice(0, 40);
    const lostRow = x => `<div class="srow"><div class="sh"><b class="sn">${esc(lbl(x))}</b><span>${esc(x.item)}</span><span class="chip ${x.status === "보관" ? "go" : "off"}">${esc(x.status)}</span>${x.photo ? `<span class="w" style="display:inline">사진 있음</span>` : ""}</div>
      <div class="sa"><span class="w">${esc(x.date.slice(5).replace("-", "/"))} 발견 · ${esc(x.place)} · 등록 ${esc(whoLine(x))}${x.log && x.log[0] ? ` · ${esc(x.log[0].to)} ${esc(whoLine(x.log[0]))}` : ""}</span>${fo && x.status === "보관" ? `<button type="button" class="btn sm" data-lost="고객 전달" data-id="${esc(x.id)}">고객 전달</button><button type="button" class="btn sm" data-lost="폐기" data-id="${esc(x.id)}">폐기</button>` : ""}${fo && x.status !== "보관" ? `<button type="button" class="lnk" data-lost="보관" data-id="${esc(x.id)}">보관으로 되돌리기</button>` : ""}</div></div>`;
    const lostCard = `<section class="card"><h2>분실물 <span class="c">${st.lost.filter(x => x.status === "보관").length}</span></h2><p class="sub">"그 객실 청소 때 발견된 것 있나요?"는 여기서 호수로 찾습니다. 고객 이름은 적지 않습니다. 사진은 아직 저장하지 않으니 사진이 있는지만 표시합니다.</p>
      <form id="lForm" class="new" data-keep autocomplete="off"><div class="row2">${roomPick("lq", M, null)}<label class="f">발견일<input type="date" id="lDate" value="${esc(today)}"></label></div>
        <div class="row2"><label class="f">물건<input id="lItem" maxlength="80" placeholder="예: 검정 충전기, 은색 반지" required></label><label class="f">보관 위치<select id="lPlace">${D.PLACES.map(p => `<option>${esc(p)}</option>`).join("")}</select></label></div>
        <label class="tg" style="margin:4px 0 8px;display:inline-flex"><input type="checkbox" id="lPhoto"> 사진 찍어 둠</label>
        <button class="btn main" type="submit">분실물 등록</button>
        <div class="msg" id="lMsg" aria-live="polite">${esc(st.lMsg)}</div></form>
      <label class="f" style="margin-top:12px">찾기 (호수 또는 물건)<input id="lSearch" value="${esc(q)}" placeholder="예: 1209 또는 충전기"></label>
      ${lost.length ? `<div class="slist">${lost.map(lostRow).join("")}</div>` : `<div class="empty">${q ? "찾는 분실물이 없습니다." : "등록된 분실물이 없습니다."}</div>`}</section>`;
    return (fo ? `<div class="cols">${form}${stock}</div>` : stock) + list + lostCard;
  }
  async function deskSubmit(f) {
    const D = OPS.Desk, a = actor();
    if (f.id === "dForm") {
      try {
        const r = readRoom("dq");
        const items = {}; D.ITEMS.forEach(i => { items[i.id] = ($("di-" + i.id) || {}).value; });
        const tasks = {}; D.TASKS.forEach(t => { tasks[t.id] = ($("dt-" + t.id) || {}).checked; });
        const input = Object.assign(r, { items, tasks, other: $("dOther").value, method: $("dMethod").value, due: $("dDue").value, guestIn: $("dIn").checked, urgent: $("dUrg").checked });
        const dup = D.openFor(st.deliv, r.roomId);
        if (dup.length && st.dForce !== r.roomId) { st.dForce = r.roomId; throw new Error(`${r.no}호에 아직 안 끝난 요청이 있습니다: ${dup.map(d => D.line(d)).join(" / ")}. 추가 요청이면 한 번 더 눌러 주십시오.`); }
        await D.request(input, a);
        st.dForce = null; st.dMsg = `${r.no}호 요청을 보냈습니다.`;
        f.reset(); st.keep = null;
      } catch (e) { st.dMsg = e.message; if (!/아직 안 끝난/.test(e.message)) st.dForce = null; }
      render(); return true;
    }
    if (f.id === "lForm") {
      try {
        const r = readRoom("lq");
        await D.addLost(Object.assign(r, { item: $("lItem").value, place: $("lPlace").value, date: $("lDate").value, photo: $("lPhoto").checked }), a);
        st.lMsg = `${r.no}호 분실물을 등록했습니다.`; f.reset();
      } catch (e) { st.lMsg = e.message; }
      render(); return true;
    }
    if (f.dataset.stock) {
      const b = f.dataset.stock;
      try { await D.setStock(OPS.ymd(Date.now()), b, { big: $("sb-" + b).value, small: $("ss-" + b).value, dry: $("sd-" + b).value }, a, st.stock[b]); st.sMsg = "재고를 저장했습니다."; }
      catch (e) { st.sMsg = e.message; }
      render(); return true;
    }
    return false;
  }
  async function deskAct(act, id) {
    const D = OPS.Desk, a = actor(), d = st.deliv.find(x => x.id === id);
    try {
      if (act === "toggleDone") { st.dDone = !st.dDone; render(); return; }
      if (!d) return;
      if (act === "go") await D.go(d, a);
      else if (act === "done") await D.done(d, a, "");
      else if (act === "part" || act === "fail") { st.dNote = id; st.dNoteKind = act; render(); return; }
      else if (act === "noteclose") { st.dNote = null; render(); return; }
      else if (act === "partok") { const v = $("dn-" + id).value.trim(); if (!v) throw new Error("실제로 한 것을 적어 주십시오."); await D.done(d, a, v); st.dNote = null; }
      else if (act === "failok") { await D.fail(d, a, $("dn-" + id).value); st.dNote = null; }
      else if (act === "cancel") await D.cancel(d, a);
      else if (act === "reopen") await D.reopen(d, a);
    } catch (e) { flash(e.message || String(e)); }
  }

  // 투숙 객실 수: PMS 재실 수와 맞춰 보는 용도
  function houseLine() {
    const M = boardM(); let stay = 0, out = 0, inn = 0;
    Object.keys(M.rooms).forEach(id => {
      if (st.rb !== "all" && M.rooms[id].b !== st.rb) return;
      const x = roomState(id, st.rdate); if (!x) return;
      if (x.stay === "연박") stay++;
      if (x.stay === "퇴실" || x.stay === "퇴실·입실") out++;
      if (x.stay === "입실" || x.stay === "퇴실·입실") inn++;
    });
    const tomorrow = st.rdate > OPS.ymd(Date.now());
    return `<p class="sub" style="margin:8px 0 0">${tomorrow ? "예정 · " : ""}전날 밤 투숙 <b>${stay + out}</b>실 = 연박 ${stay} + 퇴실 ${out} · 입실 ${inn} → 오늘 밤 투숙 <b>${stay + inn}</b>실. 프로그램(PMS) 재실 수와 다르면 예약표를 확인해 주십시오.</p>`;
  }

  // 프론트 도구: 예약표 반영 + 새 예약 직접 추가
  function frontTools(M) {
    const today = OPS.ymd(Date.now());
    const pf = st.addPrefill || {};
    const blds = M.buildings || [];
    const active = st.manual.filter(m => OPS.Stays.dayN(m.start) + (m.nights | 0) >= OPS.Stays.dayN(today)).sort((a, b) => a.start.localeCompare(b.start) || String(a.no).localeCompare(String(b.no)));
    const lastSrc = (() => { const k = Object.keys(st.days).filter(x => st.days[x] && st.days[x].src && st.days[x].src.reservation).sort().pop(); return k ? st.days[k].src.reservation : null; })();
    return `<div class="cols"><section class="card"><h2>예약표 반영</h2>
        <p class="sub">예약표(.xlsx)를 올리면 오늘 기준으로 투숙 중인 객실이 입실일과 관계없이 전부 반영됩니다(장기 투숙 포함). 내일은 예정 상태로 함께 계산됩니다. 이름·연락처·예약번호는 저장하지 않습니다.${lastSrc ? ` 마지막 반영: ${esc(hm(lastSrc.at))} ${esc(lastSrc.file)}` : ""}</p>
        <label class="btn main" style="display:inline-flex;align-items:center;cursor:pointer">예약표 올리기<input type="file" id="rFile" accept=".xlsx,.xlsm" multiple hidden></label> <span class="sub" style="margin:0 0 0 6px">또는 화면 아무 곳에 파일을 끌어다 놓기</span>
        <div class="msg" id="rMsg" aria-live="polite">${esc(st.rMsg)}</div></section>
      <section class="card"><h2>예약 추가</h2>
        <p class="sub">예약표 반영 뒤 새로 들어온 예약을 넣습니다. 입실일부터 박수만큼 연박, 마지막 다음 날 퇴실로 잡힙니다.</p>
        <form id="addStay" class="new" autocomplete="off">
          <div class="row2">${blds.length > 1 ? `<label class="f">동<select id="asB">${blds.map(b => `<option value="${esc(b.id)}" ${pf.b === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label>` : ""}
          <label class="f">호수<input id="asNo" inputmode="numeric" list="asList" value="${esc(pf.no || "")}" placeholder="예: 805" required><datalist id="asList">${Array.from(new Set(Object.values(M.rooms).map(r => r.no))).sort((a, b) => +a - +b).map(n => `<option value="${esc(n)}">`).join("")}</datalist></label></div>
          <div class="row2"><label class="f">입실일<input id="asStart" type="date" value="${esc(pf.start || st.rdate)}"></label>
          <label class="f">박수<input id="asN" type="number" min="1" max="60" value="${esc(pf.n || 1)}"></label></div>
          <label class="f">메모(선택)<input id="asMemo" maxlength="60" placeholder="예: 워크인, 연장"></label>
          <button class="btn main" type="submit">${st.forceAdd ? "겹쳐도 추가" : "추가"}</button>
          <div class="msg ${st.forceAdd ? "err" : ""}" id="asMsg" aria-live="polite">${esc(st.addMsg)}</div>
        </form>
        ${active.length ? `<h4 style="margin:14px 0 6px">직접 추가한 예약 <span class="c">${active.length}</span></h4><div class="slist">${active.map(m => `<div class="srow"><div class="sh"><b class="sn">${esc((multiB() ? (m.building || "") + " " : "") + m.no)}</b><span>${esc(m.start.slice(5).replace("-", "/"))} 입실 · ${m.nights}박 → ${esc(OPS.Stays.addDays(m.start, m.nights).slice(5).replace("-", "/"))} 퇴실</span>${m.memo ? `<span class="w" style="display:inline">${esc(m.memo)}</span>` : ""}<button type="button" class="lnk" data-delstay="${esc(m.id)}">삭제</button></div><div class="w">${esc(whoLine(m))}</div></div>`).join("")}</div>` : ""}
      </section></div>`;
  }

  async function addStay() {
    const M = boardM();
    const b = $("asB") ? $("asB").value : (M.buildings[0] || {}).id;
    const no = String(+String($("asNo").value).replace(/호$/, "").trim() || "");
    const id = OPS.Rooms.roomId(b, no);
    const start = $("asStart").value, nights = Math.max(1, Math.min(60, parseInt($("asN").value, 10) || 0));
    st.addPrefill = { b, no, start, n: nights };
    if (!M.rooms[id]) throw new Error(((M.buildings.find(x => x.id === b) || {}).name || "") + " " + no + "호는 객실 목록에 없습니다.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("입실일을 골라 주십시오.");
    const key = id + "|" + start + "|" + nights;
    const md = d => d.slice(5).replace("-", "/");
    const ck = OPS.Stays.check(d => baseState(id, d), st.manual.filter(m => m.roomId === id), start, nights);
    if (ck.dup === "manual") { st.forceAdd = null; throw new Error(`중복: ${no}호는 이미 직접 추가한 예약(${md(ck.with.start)} 입실 ${ck.with.nights}박)과 기간이 겹칩니다. 박수를 바꾸려면 그 예약을 삭제한 뒤 다시 넣어 주십시오.`); }
    if (ck.dup === "sheet") { st.forceAdd = null; throw new Error(`중복: 예약표에 ${no}호 ${md(start)} 입실이 이미 있습니다.`); }
    if (ck.nights.length && st.forceAdd !== key) {
      st.forceAdd = key;
      throw new Error(`${no}호는 예약표상 ${ck.nights.map(md).join(", ")} 밤에 투숙 중입니다. 조기 퇴실 등으로 비어 있는 것이 확인된 경우에만 한 번 더 눌러 추가하십시오.`);
    }
    const a = actor();
    await Store.set(COL.manualStays, id + "__" + start, { roomId: id, b, building: (M.buildings.find(x => x.id === b) || {}).name || "", no, start, nights, memo: OPS.mask(($("asMemo").value || "").trim()).slice(0, 60), by: a.name, uid: a.uid, role: a.role, at: Date.now(), propertyId: OPS.CTX.propertyId });
    st.forceAdd = null; st.addPrefill = null;
    st.addMsg = `${no}호 ${start.slice(5).replace("-", "/")} 입실 ${nights}박을 추가했습니다.`;
  }

  function chip(x) { const t = OPS.Svc.status(x); return `<span class="chip ${SVC_CLS[t] || ""}">${esc(t)}</span>`; }
  function ackLine(x) {
    const s = x.s || {};
    if (OPS.Svc.hkNeedsAck(x)) return `<span class="w warnt">키핑 미확인</span>`;
    if (s.done) return `<span class="w">완료 ${esc(whoLine(s.done, { short: true }))}${s.done.small || s.done.large ? ` · 작${s.done.small} 큰${s.done.large}` : ""}</span>`;
    if (s.hkAck) return `<span class="w">키핑 확인 ${esc(whoLine(s.hkAck, { short: true }))}</span>`;
    return "";
  }

  function foView(list, ro) {
    const stay = list.filter(x => x.type === "stay").sort((a, b) => (a.s.reply ? 1 : 0) - (b.s.reply ? 1 : 0) || (+a.r.no - +b.r.no));
    const out = list.filter(x => x.type === "out").sort((a, b) => (OPS.Svc.foNeeds(b) ? 1 : 0) - (OPS.Svc.foNeeds(a) ? 1 : 0) || (a.s.co ? 1 : 0) - (b.s.co ? 1 : 0) || (b.sameDayIn ? 1 : 0) - (a.sameDayIn ? 1 : 0) || (+a.r.no - +b.r.no));
    const ready = out.filter(x => x.s.done && !x.s.ext).length, ing = out.filter(x => !x.s.done && (x.s.start || x.s.cleaned)).length;
    const stayRow = x => {
      const s = x.s, editing = st.svcEdit === x.id && !ro, r = s.reply || {}, rt = OPS.Svc.reqText(x);
      const sel = r.kinds || (s.reply ? [] : ["정비"]);
      return `<div class="srow ${OPS.Svc.hkNeedsAck(x) ? "pend" : ""}">
        <div class="sh"><b class="sn">${esc(rLabel(x.r))}</b><span class="w" style="display:inline">${esc(x.kind)}</span>${chip(x)}${r.window ? `<span class="chip k">${esc(r.window)}</span>` : ""}${rt ? `<span class="w" style="display:inline">${esc(rt)}</span>` : ""}</div>
        <div class="sa">${ro ? "" : `<button type="button" class="btn sm ${s.reply ? "" : "main"}" data-svc="edit" data-id="${esc(x.id)}">${s.reply ? "요청 수정" : "요청 입력"}</button>`}${s.reply ? `<span class="w">${esc(whoLine(s.reply, { short: true }))}</span>` : ""}${ackLine(x)}</div>
        ${editing ? `<div class="sedit req">
          <div class="acts" style="margin:0"><label class="tw">시작<input type="time" id="rf-${esc(x.id)}" value="${esc(r.from || "")}" step="1800"></label><span aria-hidden="true">~</span><label class="tw">끝<input type="time" id="rt-${esc(x.id)}" value="${esc(r.to || "")}" step="1800"></label></div>
          <div class="reqk" role="group" aria-label="요청한 청소">${OPS.Svc.REQ_KINDS.map(k => `<label class="tg"><input type="checkbox" name="rk-${esc(x.id)}" value="${esc(k)}" ${sel.includes(k) ? "checked" : ""}> ${esc(k === "정비" ? x.kind : k)}</label>`).join("")}</div>
          <input id="rm-${esc(x.id)}" placeholder="메모(선택) 예: 생수 2" value="${esc(r.items || "")}" maxlength="100">
          <div class="acts" style="margin:0"><button type="button" class="btn sm main" data-svc="req" data-id="${esc(x.id)}">저장</button><button type="button" class="btn sm" data-svc="refuse" data-id="${esc(x.id)}">청소 X</button>${s.reply ? `<button type="button" class="btn sm" data-svc="clear" data-id="${esc(x.id)}">지우기</button>` : ""}<button type="button" class="btn sm" data-svc="close" data-id="${esc(x.id)}">닫기</button></div></div>` : ""}
      </div>`;
    };
    const outRow = x => {
      const s = x.s, need = OPS.Svc.foNeeds(x), editing = (st.svcEdit === x.id || need) && !ro;
      const stage = s.done ? "" : s.cleaned ? `청소 끝 ${tAt(s.cleaned)}` : s.start ? `청소 시작 ${tAt(s.start)}` : "";
      return `<div class="srow ${need ? "pend blinkrow" : OPS.Svc.hkNeedsAck(x) ? "pend" : ""}">
        <div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${x.sameDayIn ? `<span class="chip in">당일 입실</span>` : ""}${chip(x)}${s.prio ? `<span class="chip k">우선 ${esc(s.prio.time)}</span>` : ""}${s.late && s.co ? `<span class="chip k">레이트 ${esc(s.late.time)}</span>` : ""}${s.pwGiven ? `<span class="chip warn">비번 제공</span>` : ""}${stage ? `<span class="w" style="display:inline">${esc(stage)}</span>` : ""}</div>
        ${need ? `<div class="sx warnt">키핑이 ${esc(tAt(s.stillIn))}에 방문했는데 아직 손님이 있습니다. 레이트·연장·퇴실완 중 하나로 답해 주십시오.</div>` : ""}
        <div class="sa">${ro ? "" : `<label class="tg"><input type="checkbox" data-svc="pw" data-id="${esc(x.id)}" ${s.pwGiven ? "checked" : ""}> 비번 제공</label>
          ${s.co ? `<button type="button" class="btn sm" data-svc="unco" data-id="${esc(x.id)}" title="누르면 퇴실완 취소">퇴실완 ${esc(tAt(s.co))}</button>` : s.ext ? `<button type="button" class="btn sm" data-svc="unext" data-id="${esc(x.id)}">연장 취소</button>` : `<button type="button" class="btn sm main" data-svc="co" data-id="${esc(x.id)}">퇴실완</button>`}
          ${need ? "" : `<button type="button" class="btn sm" data-svc="edit" data-id="${esc(x.id)}">레이트·연장·우선</button>`}`}${ackLine(x)}</div>
        ${editing ? `<div class="sedit"><div class="acts" style="margin:0;flex-wrap:wrap">
            ${s.co ? "" : `<label class="tw">레이트<input type="time" id="lt-${esc(x.id)}" value="${esc(s.late ? s.late.time : "13:00")}" step="600"></label><button type="button" class="btn sm main" data-svc="late" data-id="${esc(x.id)}">레이트 지정</button>
            <button type="button" class="btn sm" data-svc="ext" data-id="${esc(x.id)}">연장(오늘 청소 없음)</button>`}
            <label class="tw">입실<input type="time" id="pt-${esc(x.id)}" value="${esc(s.prio ? s.prio.time : "15:00")}" step="600"></label><button type="button" class="btn sm" data-svc="prio" data-id="${esc(x.id)}">우선 준비</button>${s.prio ? `<button type="button" class="btn sm" data-svc="unprio" data-id="${esc(x.id)}">우선 해제</button>` : ""}
            ${need ? "" : `<button type="button" class="btn sm" data-svc="close" data-id="${esc(x.id)}">닫기</button>`}</div>
          <p class="sub" style="margin:6px 0 0">연장은 예약표에도 반영해야 다음 날부터 연박으로 잡힙니다(예약 추가 또는 예약표 다시 올리기).</p></div>` : ""}
      </div>`;
    };
    return `<section class="card"><h2>재실 정비 요청 <span class="c">${stay.length}</span></h2><p class="sub">청소표의 재실 객실입니다. 손님이 요청한 시간대(시작~끝)와 청소 종류를 적으면 키핑 화면에 바로 뜹니다. 적지 않은 객실은 정비하지 않습니다. 요청이 없는 객실이 위에 옵니다.</p>${stay.length ? `<div class="slist">${stay.map(stayRow).join("")}</div>` : `<div class="empty">재실 객실이 없습니다.</div>`}</section>
      <section class="card"><h2>퇴실 <span class="c">${out.length}</span></h2><p class="sub">입실 가능 <b>${ready}</b>실 · 청소 중 ${ing}실. 키핑이 "아직 재실"을 알린 객실과 당일 입실 객실이 위에 옵니다. 먼저 필요한 객실은 "우선 준비"로 입실 시각을 걸면 키핑 목록 맨 위로 갑니다.</p>${out.length ? `<div class="slist">${out.map(outRow).join("")}</div>` : `<div class="empty">퇴실 객실이 없습니다.</div>`}</section>`;
  }

  function hkView(list) {
    const todo = OPS.Svc.hkSort(list.filter(OPS.Svc.hkTodo));
    const done = list.filter(x => x.s.done).sort((a, b) => b.s.done.at - a.s.done.at);
    const waitN = list.filter(x => x.type === "stay" && !x.s.reply).length, preN = list.filter(x => x.type === "out" && !x.s.co).length;
    const n = [0, 1, 2, 3, 4, 5, 6, 8];
    const row = x => {
      const s = x.s, need = OPS.Svc.hkNeedsAck(x);
      const what = x.type === "out" ? `퇴실 ${esc(tAt(s.co))}${s.prio ? ` · <b class="warnt">${esc(s.prio.time)} 입실 우선</b>` : x.sameDayIn ? ` · <b class="warnt">당일 입실</b>` : ""}${s.cleaned ? ` · 청소 끝 ${esc(tAt(s.cleaned))}` : s.start ? ` · 청소 중` : ""}` : s.reply.type === "time" ? `<b>${esc(s.reply.window)}</b> · ${esc(s.reply.kinds ? OPS.Svc.reqText(x) : x.kind)}` : "청소 X · 요청만";
      const stageBtn = x.type !== "out" || need ? "" : !s.start ? `<button type="button" class="btn sm" data-svc="start" data-id="${esc(x.id)}">청소 시작</button>` : !s.cleaned ? `<button type="button" class="btn sm" data-svc="cleaned" data-id="${esc(x.id)}">청소 끝(점검 대기)</button>` : "";
      return `<div class="srow ${need ? "pend blinkrow" : ""}">
        <div class="sh"><b class="sn">${esc(rLabel(x.r))}</b><span>${what}</span></div>
        ${s.reply && s.reply.items && !s.reply.kinds ? `<div class="sx">요청: ${esc(s.reply.items)}</div>` : ""}${s.memo && s.memo.text ? `<div class="sx">추가: ${esc(s.memo.text)}</div>` : ""}
        <div class="sa">${need ? `<button type="button" class="btn sm main" data-svc="ack" data-id="${esc(x.id)}">확인</button>` : `<span class="w">확인 ${esc(tAt(s.hkAck))}</span>`}
          <label class="tw">작<select id="ts-${esc(x.id)}">${n.map(v => `<option>${v}</option>`).join("")}</select></label><label class="tw">큰<select id="tl-${esc(x.id)}">${n.map(v => `<option>${v}</option>`).join("")}</select></label>
          ${stageBtn}<button type="button" class="btn sm ${x.type === "out" && s.cleaned ? "main" : ""}" data-svc="done" data-id="${esc(x.id)}">${x.type === "out" ? "점검 완료·입실 가능" : "완료"}</button></div>
      </div>`;
    };
    // 아직 퇴실완이 안 된 퇴실 객실: 방문했는데 손님이 있으면 프론트에 알린다(톡방의 "아직 퇴실 안 하셨다고 합니다")
    const pre = list.filter(x => x.type === "out" && !x.s.co && !x.s.ext).sort((a, b) => (+a.r.no - +b.r.no));
    const preRow = x => `<div class="srow"><div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${chip(x)}${x.s.prio ? `<span class="chip k">${esc(x.s.prio.time)} 입실 우선</span>` : ""}</div>
      <div class="sa">${x.s.stillIn && OPS.Svc.foNeeds(x) ? `<span class="w warnt">프론트 답 기다리는 중 (${esc(tAt(x.s.stillIn))} 알림)</span>` : `<button type="button" class="btn sm" data-svc="stillin" data-id="${esc(x.id)}">아직 손님 있음 → 프론트에 알림</button>`}</div></div>`;
    return `<section class="card"><h2>오늘 할 청소 <span class="c">${todo.length}</span></h2><p class="sub">당일 입실 퇴실 → 퇴실 → 재실 요청 시간순 → 요청만. 깜빡이는 줄은 새로 들어온 내용이니 확인을 눌러 주십시오. 재실 요청 없음 ${waitN}실(정비 안 함), 퇴실 전 ${preN}실은 아직 목록에 없습니다.</p>
      ${todo.length ? `<div class="slist">${todo.map(row).join("")}</div>` : `<div class="empty">지금 할 청소가 없습니다.</div>`}</section>
      ${pre.length ? `<section class="card"><h2>퇴실 전 <span class="c">${pre.length}</span></h2><p class="sub">프론트가 퇴실완을 누르면 위 목록으로 올라갑니다. 방문했는데 손님이 있으면 알림을 눌러 주십시오. 프론트가 레이트·연장으로 답하면 여기 표시됩니다.</p><div class="slist">${pre.map(preRow).join("")}</div></section>` : ""}
      <section class="card"><h2>완료 <span class="c">${done.length}</span></h2>${done.length ? `<div class="slist">${done.map(x => `<div class="srow"><div class="sh"><b class="sn">${esc(rLabel(x.r))}</b><span>${esc(x.type === "out" ? "퇴실" : x.kind)}</span>${ackLine(x)}<button type="button" class="lnk" data-svc="undone" data-id="${esc(x.id)}">완료 취소</button></div></div>`).join("")}</div>` : `<div class="empty">아직 없습니다.</div>`}</section>`;
  }

  async function svcAct(act, id, el) {
    const cur = st.svc[id] || null, a = actor(), T = st.rdate, S = OPS.Svc;
    const room = boardM().rooms[id];
    try {
      let doc = null;
      if (act === "send") doc = await S.send(T, id, cur, a, ($("via-" + id) || {}).value || "");
      else if (act === "unsend") doc = await S.unsend(T, id, cur, a);
      else if (act === "edit") { st.svcEdit = st.svcEdit === id ? null : id; render(); return; }
      else if (act === "close") { st.svcEdit = null; render(); return; }
      else if (act === "time") { doc = await S.replyTime(T, id, cur, a, $("sw-" + id).value, $("si-" + id).value); st.svcEdit = null; }
      else if (act === "req") { doc = await S.request(T, id, cur, a, { from: $("rf-" + id).value, to: $("rt-" + id).value, kinds: Array.from(document.querySelectorAll(`input[name="rk-${CSS.escape(id)}"]:checked`)).map(c => c.value), memo: $("rm-" + id).value }); st.svcEdit = null; }
      else if (act === "refuse") { doc = await S.replyRefuse(T, id, cur, a, ""); st.svcEdit = null; }
      else if (act === "none") { doc = await S.replyNone(T, id, cur, a); st.svcEdit = null; }
      else if (act === "clear") { doc = await S.clearReply(T, id, cur, a); st.svcEdit = null; }
      else if (act === "co") doc = await S.checkout(T, id, cur, a, room);
      else if (act === "unco") doc = await S.undoCheckout(T, id, cur, a);
      else if (act === "pw") doc = await S.setPwGiven(T, id, cur, a, el.checked);
      else if (act === "ack") doc = await S.ack(T, id, cur, a);
      else if (act === "done") doc = await S.done(T, id, cur, a, ($("ts-" + id) || {}).value, ($("tl-" + id) || {}).value);
      else if (act === "undone") doc = await S.undoDone(T, id, cur, a);
      else if (act === "stillin") doc = await S.stillIn(T, id, cur, a);
      else if (act === "late") { doc = await S.late(T, id, cur, a, $("lt-" + id).value); st.svcEdit = null; }
      else if (act === "ext") { doc = await S.ext(T, id, cur, a, true); st.svcEdit = null; }
      else if (act === "unext") doc = await S.ext(T, id, cur, a, false);
      else if (act === "prio") { doc = await S.prio(T, id, cur, a, $("pt-" + id).value); st.svcEdit = null; }
      else if (act === "unprio") doc = await S.prio(T, id, cur, a, "");
      else if (act === "start") doc = await S.start(T, id, cur, a);
      else if (act === "cleaned") doc = await S.cleaned(T, id, cur, a);
      if (doc) { st.svc[id] = Object.assign({ id: OPS.Svc.sid(T, id) }, doc); render(); }
    } catch (e) { flash(e.message || String(e)); }
  }

  // ---------- 배치도 ----------
  function planView(M, by, needIds, hotIds, q) {
    const needIn = (b, f) => Array.from(needIds).filter(id => { const r = M.rooms[id]; return r && r.b === b && (f == null || OPS.Layout.floorOf(r.no) === f); }).length;
    if (!st.pb || !M.buildings.some(b => b.id === st.pb)) st.pb = (M.buildings.slice().sort((a, c) => needIn(c.id) - needIn(a.id))[0] || {}).id;
    const b = st.pb;
    const floors = OPS.Layout.floors(M, b);
    if (q) { const hit = Object.values(M.rooms).find(r => r.b === b && r.no.startsWith(q)); if (hit) st.pFloor[b] = OPS.Layout.floorOf(hit.no); }
    if (!st.pFloor[b] || !floors.includes(st.pFloor[b])) st.pFloor[b] = floors.slice().sort((x, y) => needIn(b, y) - needIn(b, x))[0];
    const f = st.pFloor[b];
    const L = OPS.Layout.get(M, b, f);
    const room = it => {
      const id = OPS.Rooms.roomId(b, it.no), s = roomState(id, st.rdate), ts = by.get(id) || [];
      const cls = ["pr", s && s.stay ? "st-" + (STAY_CLS[s.stay] || "") : "", ts.length ? "has" : "", needIds.has(id) ? "need" : "", hotIds.has(id) ? "hot" : "", q && it.no.startsWith(q) ? "hit" : "", it.stray ? "stray" : ""].join(" ");
      const cx = it.x + it.w / 2;
      return `<g class="${cls}" data-room="${esc(id)}" role="button" aria-label="${esc(it.no)}호${ts.length ? ", 열린 업무 " + ts.length + "건" : ""}${needIds.has(id) ? ", 확인 필요" : ""}">
        <rect class="bg" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="6"/>
        <rect class="bar" x="${it.x + 1}" y="${it.y + it.h - 6}" width="${it.w - 2}" height="5" rx="2"/>
        <text class="no" x="${cx}" y="${it.y + it.h / 2 - 1}" text-anchor="middle">${esc(it.no)}</text>
        <text class="sy" x="${cx}" y="${it.y + it.h / 2 + 13}" text-anchor="middle">${s && s.stay ? esc(STAY_SHORT[s.stay] || s.stay) : ""}</text>
        ${ts.length ? `<circle class="bd" cx="${it.x + it.w - 4}" cy="${it.y + 4}" r="9"/><text class="bdt" x="${it.x + it.w - 4}" y="${it.y + 8}" text-anchor="middle">${ts.length}</text>` : ""}
        ${hasNote(id) ? `<circle class="nd" cx="${it.x + 8}" cy="${it.y + 8}" r="3.5"/>` : ""}
      </g>`;
    };
    const feat = x => `<g class="pf ${esc(x.type || "")}"><rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" rx="4"/>${x.label ? `<text x="${x.x + x.w / 2}" y="${x.y + x.h / 2 + 4}" text-anchor="middle">${esc(x.label)}</text>` : ""}</g>`;
    return `<section class="card">
      <div class="rbar">
        ${multiB() ? `<div class="chips">${M.buildings.map(x => `<button type="button" data-pb="${esc(x.id)}" aria-pressed="${x.id === b}">${esc(x.name)}${needIn(x.id) ? ` <b class="nb">${needIn(x.id)}</b>` : ""}</button>`).join("")}</div>` : ""}
      </div>
      <div class="chips fls">${floors.map(x => `<button type="button" data-pf="${esc(x)}" aria-pressed="${x === f}">${esc(x)}F${needIn(b, x) ? ` <b class="nb">${needIn(b, x)}</b>` : ""}</button>`).join("")}</div>
      <div class="pv" id="pv" data-key="${esc(b + "|" + f)}" data-w="${L.w}" data-h="${L.h}">
        <div class="pz" id="pz"><svg width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}" xmlns="http://www.w3.org/2000/svg">${L.features.map(feat).join("")}${L.items.map(room).join("")}</svg></div>
        <div class="zb"><button type="button" data-zoom="in" aria-label="확대">+</button><button type="button" data-zoom="out" aria-label="축소">−</button><button type="button" data-zoom="fit" aria-label="화면 맞춤">맞춤</button></div>
      </div>
      <p class="sub" style="margin-top:8px">${L.auto ? "간이 배치(가운데 엘리베이터, 좌우 객실, 동별로 이어 붙임)입니다. 실제 배치도 사진을 받으면 이 층 모양으로 바뀝니다. " : ""}${L.stray ? `배치도에 없는 객실 ${L.stray}개는 아래쪽에 따로 놓았습니다. ` : ""}두 손가락으로 확대·축소, 끌어서 이동, 객실을 누르면 상세가 열립니다.</p>
    </section>`;
  }
  function applyZoom() {
    const pz = $("pz"); if (!pz || !st.zoom) return;
    pz.style.transform = `translate(${st.zoom.x}px,${st.zoom.y}px) scale(${st.zoom.s})`;
  }
  function fitZoom(pv) {
    const W = +pv.dataset.w, H = +pv.dataset.h, vw = pv.clientWidth - 60, vh = pv.clientHeight;
    const s = Math.min(vw / W, vh / H, 2.2) * 0.96;
    return { key: pv.dataset.key, s, x: (vw - W * s) / 2, y: (vh - H * s) / 2, fit: s };
  }
  function zoomAt(f, cx, cy) {
    const z = st.zoom; if (!z) return;
    const ns = Math.max(z.fit * 0.6, Math.min(z.fit * 8, z.s * f));
    z.x = cx - (cx - z.x) * (ns / z.s); z.y = cy - (cy - z.y) * (ns / z.s); z.s = ns;
    applyZoom();
  }
  function initPlan() {
    const pv = $("pv"); if (!pv) return;
    // 보기 창 높이: 화면 폭에 맞췄을 때 읽을 만하면 그 높이로, 너무 작으면 화면 절반 높이로 두고 확대해서 연다
    const W = +pv.dataset.w, H = +pv.dataset.h, fw = pv.clientWidth / W;
    const vh = window.innerHeight || 800;
    pv.style.height = (fw >= 0.6 ? Math.max(220, Math.min(H * Math.min(fw, 2.2) * 0.96 + 24, vh * 0.62)) : Math.max(300, vh * 0.52)) + "px";
    if (!st.zoom || st.zoom.key !== pv.dataset.key) {
      st.zoom = fitZoom(pv);
      // 미확인 객실이 있으면 그쪽으로 확대(칸이 작을 때만)
      const need = pv.querySelector(".pr.hit") || pv.querySelector(".pr.need.hot") || pv.querySelector(".pr.need");
      if (st.zoom.s < 0.6) {
        // 칸이 너무 작으면 읽을 수 있는 크기로 확대: 미확인 객실이 있으면 그 자리, 없으면 층의 왼쪽 끝부터
        const ns = Math.min(0.95, st.zoom.fit * 3);
        const H = +pv.dataset.h;
        if (need) {
          const r = need.querySelector("rect.bg"); const x = +r.getAttribute("x") + +r.getAttribute("width") / 2, y = +r.getAttribute("y") + +r.getAttribute("height") / 2;
          st.zoom.s = ns; st.zoom.x = pv.clientWidth / 2 - x * ns; st.zoom.y = pv.clientHeight / 2 - y * ns;
        } else { st.zoom.s = ns; st.zoom.x = 8; st.zoom.y = (pv.clientHeight - H * ns) / 2; }
      }
    }
    applyZoom();
    if (pv.dataset.bound) return;
    pv.dataset.bound = "1";
    const pts = new Map();
    let start = null;
    pv.addEventListener("pointerdown", e => {
      if (e.target.closest(".zb")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { moved: 0, x: st.zoom.x, y: st.zoom.y, s: st.zoom.s, pts: new Map(pts) };
      st.drag = { moved: 0 };
    });
    pv.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = pv.getBoundingClientRect();
      const arr = Array.from(pts.values()), s0 = Array.from(start.pts.values());
      if (arr.length === 1 && s0.length >= 1) {
        const dx = arr[0].x - s0[0].x, dy = arr[0].y - s0[0].y;
        st.drag.moved = Math.max(st.drag.moved, Math.abs(dx) + Math.abs(dy));
        if (st.drag.moved > 8 && !pv.hasPointerCapture(e.pointerId)) { try { pv.setPointerCapture(e.pointerId); } catch (x) {} }
        st.zoom.x = start.x + dx; st.zoom.y = start.y + dy; applyZoom();
      } else if (arr.length >= 2 && s0.length >= 2) {
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = d(arr[0], arr[1]) / Math.max(1, d(s0[0], s0[1]));
        const cx = (arr[0].x + arr[1].x) / 2 - rect.left, cy = (arr[0].y + arr[1].y) / 2 - rect.top;
        st.drag.moved = 99;
        const ns = Math.max(st.zoom.fit * 0.6, Math.min(st.zoom.fit * 8, start.s * ratio));
        st.zoom.x = cx - (cx - start.x) * (ns / start.s); st.zoom.y = cy - (cy - start.y) * (ns / start.s); st.zoom.s = ns; applyZoom();
      }
    });
    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size) start = { x: st.zoom.x, y: st.zoom.y, s: st.zoom.s, pts: new Map(pts) };
      else start = null;
    };
    pv.addEventListener("pointerup", end);
    pv.addEventListener("pointercancel", end);
    pv.addEventListener("wheel", e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = pv.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
  }

  // 객실 상세: 이슈 · 최근 24시간 인수인계 · 부서별 비고
  // ---------- 투숙 기간(입실일 ~ 퇴실일) ----------
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const dLabel = iso => { const d = new Date(iso + "T00:00:00Z"); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
  // 예약표 기간 + 직접 추가 예약. 같은 입실일이면 예약표 것만 남긴다.
  function roomSpans(id) {
    const idx = st.stayIdx;
    const sheet = ((idx && idx.rooms) || {})[id] || [];
    const list = sheet.map(x => ({ start: x[0], co: x[1], mark: !!x[2], src: "sheet" }));
    st.manual.filter(m => m.roomId === id).forEach(m => {
      if (list.some(x => x.start === m.start)) return;
      list.push({ start: m.start, co: OPS.Stays.addDays(m.start, m.nights | 0), src: "manual", memo: m.memo || "" });
    });
    return list.sort((a, b) => a.start.localeCompare(b.start));
  }
  function staySection(id, date) {
    const L = roomSpans(id), idx = st.stayIdx;
    const nights = x => OPS.Stays.dayN(x.co) - OPS.Stays.dayN(x.start);
    const line = (x, extra) => `<div class="span ${x.mark ? "mk" : ""}"><b>${esc(dLabel(x.start))}</b> 입실 → <b>${esc(dLabel(x.co))}</b> 퇴실 <span class="w" style="display:inline">${nights(x)}박${extra ? " · " + esc(extra) : ""}${x.src === "manual" ? " · 직접 추가" : ""}${x.mark ? " · 예약표 표기 칸(UHC·Miss 등)" : ""}${x.memo ? " · " + esc(x.memo) : ""}</span></div>`;
    if (!idx && !L.length) return `<h4>투숙 기간</h4><p class="w">예약표를 반영하면 입실일~퇴실일이 나옵니다.</p>`;
    const t = OPS.Stays.dayN(date);
    const cur = L.find(x => OPS.Stays.dayN(x.start) <= t && t < OPS.Stays.dayN(x.co));
    const leaving = L.find(x => OPS.Stays.dayN(x.co) === t);
    const next = L.find(x => OPS.Stays.dayN(x.start) > t && x !== cur);
    const rows = [];
    if (leaving) rows.push(`<p class="sl">${esc(dLabel(date))} 퇴실</p>` + line(leaving));
    if (cur) { const k = t - OPS.Stays.dayN(cur.start) + 1, n = nights(cur); rows.push(`<p class="sl">${esc(dLabel(date))} 투숙 중</p>` + line(cur, `${k}박째` + (n - k ? `, ${n - k}박 남음` : ", 오늘 밤이 마지막"))); }
    if (next) rows.push(`<p class="sl">다음 입실</p>` + line(next, `${OPS.Stays.dayN(next.start) - t}일 뒤`));
    if (!rows.length) rows.push(`<p class="w">${esc(dLabel(date))} 기준 투숙·예정 없음 (예약표 반영 범위 안에서)</p>`);
    const rest = L.filter(x => x !== cur && x !== leaving && x !== next);
    return `<h4>투숙 기간 <span class="sub" style="font-weight:400">${idx ? `예약표 ${esc(hm(idx.at))} 기준` : "직접 추가 예약만"}</span></h4>
      ${rows.join("")}
      ${rest.length ? `<button type="button" class="lnk" style="margin:2px 0 4px" id="stayAll">${st.stayAll ? "전후 숙박 접기" : `전후 숙박 ${rest.length}건 보기`}</button>${st.stayAll ? `<div class="spans">${rest.map(x => line(x)).join("")}</div>` : ""}` : ""}
      ${idx && !idx.borders ? `<p class="w">월 경계 표시를 읽지 못한 파일이라 월말·월초에 걸친 숙박은 둘로 나뉘어 보일 수 있습니다.</p>` : ""}`;
  }

  function openRoom(id, refresh) {
    const M = boardM(); if (!M || !M.rooms[id]) return;
    const demo = M === DEMO;
    const r = M.rooms[id], s = roomState(id, st.rdate);
    st.openRoomId = id; st.openId = null;
    const all = st.tasks.filter(t => OPS.Rooms.resolve(t, M) === id);
    const open = Core.sort(all.filter(t => Core.isOpen(t)));
    const need = open.filter(t => Core.needsAck(t, st.role));
    const since = Date.now() - 864e5;
    const ids = new Set(all.map(t => t.id)), byId = new Map(all.map(t => [t.id, t]));
    const ev = st.events.filter(e => ids.has(e.taskId) && e.at >= since && e.action !== "확인").sort((a, b) => b.at - a.at).slice(0, 20);
    const n = st.notes[id] || {};
    const keepTxt = refresh && st.noteEdit && $("noteTxt") ? $("noteTxt").value : null;
    const canEdit = d => st.role === d && !demo;
    $("dlgBody").innerHTML = `<button type="button" class="x" id="dlgX" aria-label="닫기">×</button>
      ${demo ? `<p class="demo">예시 객실입니다. 실제 객실을 등록하면 이 자리에 그 객실 정보가 나옵니다.</p>` : ""}
      <h3>${multiB() ? esc(r.building) + " " : ""}${esc(r.no)}호 <span class="meta" style="font-weight:400">${esc(r.type || "")}${r.dong ? " · " + esc(r.dong) + "동" : ""}</span></h3>
      <div class="rs">${s && s.stay ? `<span class="chip ${STAY_CLS[s.stay] || ""}">${esc(s.stay)}</span>` : ""}${s && s.clean ? `<span class="chip k">${esc(s.clean)}${s.cleanFromSheet ? "" : " 예상"}</span>` : ""}${s && s.flags && s.flags.length ? s.flags.map(f => `<span class="chip warn">${esc(f)}</span>`).join("") : ""}</div>
      ${demo ? "" : `<div class="stayb">${staySection(id, st.rdate)}</div>`}
      <div class="acts">
        ${need.length ? `<button type="button" class="btn main" id="roomAck">${esc(OPS.deptName(st.role))} 확인 (${need.length}건)</button>` : ""}
        ${st.role !== "MG" && !demo ? `<button type="button" class="btn" id="roomNew">이 객실로 업무 등록</button>` : ""}
        ${(st.role === "FO" || st.role === "MG") && !demo ? `<button type="button" class="btn" id="roomAdd">이 객실 예약 추가</button>` : ""}
      </div>
      ${(() => { const x = demo ? null : svcRows().find(y => y.id === id); if (!x) return ""; const s = x.s;
        return `<h4>${esc(st.rdate.slice(5).replace("-", "/"))} 청소</h4><div class="rs">${chip(x)}${x.type === "stay" ? `<span class="chip k">${esc(x.kind)}</span>` : ""}${s.reply && s.reply.window ? `<span class="chip k">${esc(s.reply.window)}</span>` : ""}${s.pwGiven ? `<span class="chip warn">비번 제공</span>` : ""}${ackLine(x)}</div>${s.reply && (s.reply.items || s.reply.kinds) ? `<div class="w">요청: ${esc(OPS.Svc.reqText(x))}</div>` : ""}<button type="button" class="lnk" style="margin:4px 0 0" id="goSvc">청소·재실 탭에서 처리</button>`; })()}
      <h4>열린 이슈 <span class="c">${open.length}</span></h4>
      ${open.length ? `<div class="list">${open.map(t => { const a = Core.actions(t, st.role)[0]; return `<div class="task ${t.priority === "긴급" ? "hot" : ""}" tabindex="0" data-open="${esc(t.id)}"><span class="room">${Core.needsAck(t, st.role) ? "●" : ""}</span><span class="t"><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</span>${a ? `<button type="button" class="btn go" data-act="${esc(a.to)}" data-id="${esc(t.id)}">${esc(a.label)}</button>` : ""}<span class="meta">${esc(OPS.kindName(t.kind))} · ${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · ${esc(t.status)} · ${esc(ago(t.createdAt))}${Core.isOverdue(t) ? ` · <span class="late">기한 초과</span>` : ""}</span></div>`; }).join("")}</div>` : `<div class="w">열린 이슈가 없습니다.</div>`}
      <h4>인수인계 정리 <span class="sub" style="font-weight:400">최근 24시간</span></h4>
      ${ev.length ? `<ol class="tl">${ev.map(e => { const t = byId.get(e.taskId); return `<li><b>${esc(e.action)}</b> ${esc(t ? t.title : "")}${e.to && e.action !== "댓글" ? ` <span class="w" style="display:inline">${esc(e.from ? e.from + " → " : "")}${esc(e.to)}</span>` : ""}${e.note ? `<br>${esc(e.note)}` : ""}<br><span class="w">${esc(whoLine(e))}</span></li>`; }).join("")}</ol>` : `<div class="w">최근 24시간 동안 이 객실의 처리 기록이 없습니다.</div>`}
      <h4>부서별 비고</h4>
      <p class="sub">세 부서 모두 볼 수 있고, 각 부서는 자기 칸만 고칠 수 있습니다. 카드번호·비밀번호는 자동으로 가려집니다. 투숙객 이름·연락처는 적지 마십시오.</p>
      <div class="notes">${NOTE_DEPTS.map(d => { const x = n[d] || {}; const editing = st.noteEdit === d && canEdit(d);
        return `<div class="note ${canEdit(d) ? "mine" : ""}"><div class="nh"><b>${esc(OPS.deptName(d))}</b>${x.at ? `<span class="w" style="display:inline"> · ${esc(whoLine(Object.assign({ role: d }, x)))}</span>` : ""}${canEdit(d) && !editing ? `<button type="button" class="lnk" data-note-edit="${d}">${x.text ? "수정" : "쓰기"}</button>` : ""}</div>
        ${editing ? `<form id="noteForm" data-dept="${d}"><textarea id="noteTxt" maxlength="1000" rows="4">${esc(keepTxt != null ? keepTxt : x.text || "")}</textarea><div class="acts" style="margin:6px 0 0"><button class="btn main" type="submit">저장</button><button type="button" class="btn" data-note-cancel="1">취소</button></div></form>`
          : `<div class="nt">${x.text ? esc(x.text) : `<span class="w">비어 있음</span>`}</div>`}</div>`; }).join("")}</div>`;
    if (!$("dlg").open) $("dlg").showModal();
    if (st.noteEdit && $("noteTxt") && !refresh) $("noteTxt").focus();
  }
  async function saveNote(dept, text) {
    if (st.role !== dept) throw new Error(OPS.deptName(st.role) + " 역할은 " + OPS.deptName(dept) + " 비고를 고칠 수 없습니다.");
    const id = st.openRoomId;
    const cur = Object.assign({}, st.notes[id] || {});
    delete cur.id;
    const a = actor(), now = Date.now();
    const clean = OPS.mask(String(text || "").trim()).slice(0, 1000);
    cur[dept] = { text: clean, by: a.name, uid: a.uid, at: now };
    cur.roomId = id; cur.propertyId = OPS.CTX.propertyId; cur.updatedAt = now;
    cur.hist = [{ dept, by: a.name, uid: a.uid, at: now, len: clean.length }].concat(cur.hist || []).slice(0, 20);
    await Store.set(COL.roomNotes, id, cur);
    st.notes[id] = cur;
  }

  // ---------- 설정 ----------
  const DEPT_W = OPS.DEPTS;
  function parseRooms(txt) {
    const out = [];
    String(txt || "").split(/[,\s]+/).filter(Boolean).forEach(tok => {
      const m = /^(\d{2,5})(?:-(\d{2,5}))?$/.exec(tok);
      if (!m) return;
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (b < a || b - a > 300) return;
      for (let n = a; n <= b; n++) out.push(String(n));
    });
    return Array.from(new Set(out));
  }
  function settingsView() {
    if (st.role !== "MG") return `<section class="card later-box"><h2>설정</h2><p class="sub">관리자 역할에서만 열립니다.</p></section>`;
    const S = st.settings || {}, M = st.master;
    const staffRows = DEPT_W.map(d => {
      const list = st.staff.filter(x => x.dept === d.id).sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || String(a.name).localeCompare(b.name));
      return `<tr><td>${esc(d.name)}</td><td>${list.length ? list.map(x => `<button type="button" class="stf ${x.active ? "" : "off"}" data-staff-toggle="${esc(x.id)}" title="누르면 ${x.active ? "비활성" : "활성"}">${esc(x.name)}</button>`).join(" ") : `<span class="sub">없음</span>`}</td></tr>`;
    }).join("");
    const blds = M && M.buildings ? M.buildings : [];
    return `<div class="cols"><div>
      <section class="card"><h2>지점</h2><p class="sub">모든 기록에 지점 표시가 붙습니다. 지점 표시는 나중에 다른 지점 데이터와 섞이지 않게 하는 기준입니다.</p>
        <form id="propForm" class="new">
          <div class="row2"><label class="f">지점 이름<input id="sName" maxlength="40" value="${esc(S.propertyName || "")}" placeholder="예: UH FLAT 서초"></label>
          <label class="f">지점 표시(영문·숫자)<input id="sPid" maxlength="20" value="${esc(S.propertyId || OPS.CTX.propertyId)}" pattern="[a-z0-9-]{1,20}"></label></div>
          <div class="row2"><label class="f">주간 파트 시작<input id="sDay" type="time" value="${esc(S.dayStart || OPS.CTX.dayStart)}"></label>
          <label class="f">야간 파트 시작<input id="sNight" type="time" value="${esc(S.nightStart || OPS.CTX.nightStart)}"></label></div>
          <label class="f">비번 변경 담당 (비밀번호 제공 객실 퇴실 시)<select id="sPw">${OPS.DEPTS.filter(d => d.id !== "MG").map(d => `<option value="${d.id}" ${(S.pwDept || OPS.CTX.pwDept) === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
          <button class="btn main" type="submit">저장</button>
        </form></section>
      <section class="card"><h2>동과 객실 <span class="c">${M ? Object.keys(M.rooms).length : 0}실</span></h2>
        <p class="sub">${blds.length ? blds.map(b => `${esc(b.name)} ${Object.values(M.rooms).filter(r => r.b === b.id).length}실`).join(" · ") : "등록된 동이 없습니다."}${M && M.src && M.src.reservation ? ` · 예약표 ${esc(M.src.reservation.file)} (${esc(hm(M.src.reservation.at))})` : ""}</p>
        <form id="roomForm" class="new">
          <div class="row2"><label class="f">동<select id="rbSel"><option value="">새 동 만들기</option>${blds.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("")}</select></label>
          <label class="f">새 동 이름<input id="rbName" maxlength="12" placeholder="예: 본관 (한 동이면 비워 두기)"></label></div>
          <label class="f">객실 번호<input id="rbRooms" placeholder="예: 201-215, 301-315, 1001"></label>
          <button class="btn" type="submit">객실 추가</button>
        </form>
        <form id="wingForm" class="new" style="margin-top:14px">
          <p class="sub" style="margin:0">배치도 동 구분(예약표에 동 표기가 없을 때 사용). 호수 끝자리 범위로 적습니다.</p>
          <div class="row2"><label class="f">동<select id="wgB">${blds.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("")}</select></label>
          <label class="f">규칙<input id="wgRule" placeholder="예: A동 1-14, B동 15-18" value="${esc(blds.length && M.layouts && M.layouts[blds[0].id] && M.layouts[blds[0].id].wings ? M.layouts[blds[0].id].wings.map(w => w.name + " " + w.from + "-" + w.to).join(", ") : "")}"></label></div>
          <button class="btn" type="submit" ${blds.length ? "" : "disabled"}>저장</button>
        </form>
        <h2 style="margin-top:18px">예약표 가져오기</h2>
        <p class="sub">예약표(.xlsx)를 올리면 동·호수·타입이 만들어지고 오늘 기준 객실 상태(내일은 예정)가 반영됩니다. 평소에는 프론트가 청소·재실 탭에서 올립니다. 청소표는 객실 목록을 처음 만들 때만 선택적으로 씁니다. 이름·연락처·예약번호·코멘트는 저장하지 않습니다.</p>
        <label class="btn main" style="display:inline-flex;align-items:center;cursor:pointer">파일 선택<input type="file" id="rFile" accept=".xlsx,.xlsm" multiple hidden></label> <span class="sub" style="margin:0 0 0 6px">또는 화면에 끌어다 놓기(예약표·청소표)</span>
        <div class="msg" id="rMsg" aria-live="polite">${esc(st.rMsg)}</div>
      </section>
    </div><div>
      <section class="card"><h2>직원 명부 <span class="c">${st.staff.filter(x => x.active).length}명</span></h2>
        <p class="sub">작성자 이름 칸에서 고를 수 있게 됩니다. 이름을 누르면 활성·비활성이 바뀝니다. 실사용 때 로그인과 부서 고정의 기준이 됩니다.</p>
        <form id="staffForm" class="new"><div class="row2"><label class="f">이름<input id="stName" maxlength="20" required></label>
          <label class="f">부서<select id="stDept">${DEPT_W.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></label></div>
          <button class="btn" type="submit">추가</button></form>
        <div class="scroll" style="margin-top:12px"><table><tbody>${staffRows}</tbody></table></div>
      </section>
      <section class="card"><h2>이슈 분류</h2><p class="sub">한 줄에 하나씩. 비우면 기본값(컴플레인 기록부 10종)으로 돌아갑니다.</p>
        <form id="catForm" class="new"><label class="f">분류<textarea id="sCats" rows="6">${esc((S.categories && S.categories.length ? S.categories : OPS.DEFAULT_CATEGORIES).join("\n"))}</textarea></label>
        <button class="btn" type="submit">저장</button></form></section>
      <section class="card"><h2>데이터 내보내기</h2><p class="sub">이 지점의 업무·이력·객실·설정·명부를 한 파일(JSON)로 받습니다. 백업과, 나중에 다른 저장소로 옮길 때 씁니다.</p>
        <button type="button" class="btn" id="exportBtn">내보내기</button></section>
      <div class="msg" id="setMsg" aria-live="polite">${esc(st.setMsg)}</div>
    </div></div>`;
  }
  function applySettings(S) {
    st.settings = S || null;
    S = S || {};
    OPS.CTX.propertyId = S.propertyId || "p1";
    OPS.CTX.propertyName = S.propertyName || "";
    OPS.CTX.dayStart = S.dayStart || "07:00";
    OPS.CTX.nightStart = S.nightStart || "22:00";
    OPS.CTX.pwDept = S.pwDept || "FM";
    OPS.CATEGORIES = S.categories && S.categories.length ? S.categories.slice() : OPS.DEFAULT_CATEGORIES.slice();
  }
  async function saveSettings(patch) {
    const cur = Object.assign({}, st.settings || {});
    delete cur.id;
    const next = Object.assign(cur, patch, { updatedAt: Date.now() });
    await Store.set(COL.settings, "main", next);
    applySettings(next);
  }
  async function exportAll() {
    const say = t => { st.setMsg = t; const m = $("setMsg"); if (m) m.textContent = t; };
    try {
      // v0.19: 청소 기록·불출·재고·분실물·비고·직접 추가 예약·숙박 기간도 백업에 넣는다
      const cols = [COL.tasks, COL.events, COL.property, COL.roomDays, COL.settings, COL.staff, COL.roomSvc, COL.roomNotes, COL.manualStays, COL.deliveries, COL.stock, COL.lostFound, COL.stayIndex];
      const data = {};
      for (const c of cols) data[c] = await Store.all(c);
      const out = { format: "ops-export", version: OPS.VERSION, propertyId: OPS.CTX.propertyId, propertyName: OPS.CTX.propertyName, exportedAt: new Date().toISOString(), data };
      const name = "ops-" + OPS.CTX.propertyId + "-" + OPS.ymd(Date.now()) + ".json";
      const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
      let dl = null;
      try { dl = window.claude && typeof window.claude.use === "function" ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
      if (dl) { await dl.save({ filename: name, data: blob }); }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1e4); }
      say(`내보냈습니다: ${name} (업무 ${data[COL.tasks].length}건, 이력 ${data[COL.events].length}건, 청소 기록 ${data[COL.roomSvc].length}건, 불출 ${data[COL.deliveries].length}건, 분실물 ${data[COL.lostFound].length}건)`);
    } catch (e) { say("내보내기 실패: " + (e && e.message || e)); }
  }

  // ---------- 이력 ----------
  function logView() {
    const byId = new Map(st.tasks.map(t => [t.id, t]));
    const mineT = t => st.role === "MG" || (t && (t.fromDept === st.role || t.toDept === st.role));
    const ev = st.events.filter(e => mineT(byId.get(e.taskId))).sort((a, b) => b.at - a.at).slice(0, 150);
    const rows = ev.map(e => {
      const t = byId.get(e.taskId);
      const what = e.field ? `${esc(e.field)}: ${esc(e.from)} → ${esc(e.to)}` : e.from || e.to ? `${esc(e.from || "")}${e.from ? " → " : ""}${esc(e.to)}` : "";
      return `<tr><td class="st">${esc(hm(e.at))}</td><td>${esc(nameOf(e.uid, e.by))}<br><span class="sub">${esc(OPS.deptName(e.role))}</span></td><td>${esc(e.action)}</td><td>${t ? `<a href="#${esc(st.role.toLowerCase())}" data-open="${esc(t.id)}">${esc(t.room ? t.room + " · " : "")}${esc(t.title)}</a>` : "(삭제된 업무)"}</td><td>${what}${e.note ? `<br><span class="sub">${esc(e.note)}</span>` : ""}</td></tr>`;
    }).join("");
    return `<section class="card"><h2>변경 이력 <span class="c">${st.events.length}</span></h2><p class="sub">${st.role === "MG" ? "모든 등록·상태 이동·수정·댓글. 최근 150건." : esc(OPS.deptName(st.role)) + "가 요청했거나 받은 업무의 이력만 보입니다. 최근 150건."}</p>
      ${ev.length ? `<div class="scroll"><table><thead><tr><th>시각</th><th>작성자</th><th>동작</th><th>업무</th><th>내용</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">아직 기록이 없습니다.</div>`}</section>`;
  }

  function laterView(id) {
    const t = TABS.find(x => x.id === id);
    return `<section class="card later-box"><h2>${esc(t.name)}</h2><p class="sub">${esc(t.later)}에서 구현합니다. 데이터 자리는 이미 잡혀 있습니다.</p><ul>${LATER[id].map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
  }

  // ---------- 그리기 ----------
  function render() {
    renderHead();
    connBanner();
    const mine = t => st.role === "MG" || (t.toDept === st.role && t.status !== "완료 대기") || (t.fromDept === st.role && t.status === "완료 대기");
    const hot = st.tasks.filter(t => Core.isOpen(t) && t.priority === "긴급" && t.status !== "보류" && mine(t));
    const a = $("alert");
    a.style.display = hot.length ? "block" : "none";
    a.textContent = hot.length ? `긴급 ${hot.length}건: ` + hot.slice(0, 3).map(t => (t.room ? t.room + " " : "") + t.title).join(" / ") + (hot.length > 3 ? " 외" : "") : "";
    const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest("#newForm") ? captureForm() : null;
    const rqFocus = document.activeElement && (document.activeElement.id === "rq" || document.activeElement.id === "lSearch") ? document.activeElement.id : null;
    svcSubscribe();
    const keepD = keepInputs();
    // 현황판이 바탕화면. 다른 화면은 위에 "현황판" 돌아가기 줄을 붙인다
    const tabName = (TABS.find(t => t.id === st.tab) || {}).name || "";
    const back = st.tab === "board" ? "" : `<div class="backbar"><button type="button" class="home" data-tab="board"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>현황판</button><h1>${esc(tabName)}</h1></div>`;
    $("view").innerHTML = dropMsgHtml() + back + (st.tab === "dash" ? dashView() : st.tab === "board" ? boardView() : st.tab === "svc" ? svcView() : st.tab === "desk" ? deskView() : st.tab === "work" ? workView() : st.tab === "log" ? logView() : st.tab === "rooms" ? roomsView() : st.tab === "settings" ? settingsView() : laterView(st.tab));
    if (keep) restoreForm(keep);
    restoreInputs(keepD);
    if (rqFocus && $(rqFocus)) { const i = $(rqFocus); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (st.tab === "board" && st.bMode === "plan" && !st.bf) initPlan();
    if ($("dlg").open && st.openId) openTask(st.openId, true);
    else if ($("dlg").open && st.openRoomId) openRoom(st.openRoomId, true);
    if (st.prefill && st.tab === "work" && $("fRoom")) {
      if ($("fBld") && st.prefill.b) $("fBld").value = st.prefill.b;
      $("fRoom").value = st.prefill.no; st.prefill = null; $("fTitle").focus();
    }
  }
  // 입력 중인 폼(data-keep)은 다시 그려도 값과 커서를 지킨다(다른 사람이 저장하면 화면이 다시 그려짐)
  function keepInputs() {
    const forms = document.querySelectorAll("form[data-keep]");
    if (!forms.length) return null;
    const v = {}; forms.forEach(f => f.querySelectorAll("input,select,textarea").forEach(i => { if (i.id) v[i.id] = i.type === "checkbox" ? i.checked : i.value; }));
    return { v, focus: document.activeElement && document.activeElement.id };
  }
  function restoreInputs(k) {
    if (!k) return;
    Object.keys(k.v).forEach(id => { const i = $(id); if (!i || !i.closest("form[data-keep]")) return; if (i.type === "checkbox") i.checked = k.v[id]; else i.value = k.v[id]; });
    if (k.focus && $(k.focus)) { try { $(k.focus).focus(); } catch (e) {} }
  }
  function captureForm() {
    const f = id => ($(id) || {}).value;
    return { bld: f("fBld"), room: f("fRoom"), cat: f("fCat"), title: f("fTitle"), detail: f("fDetail"), focus: document.activeElement.id };
  }
  function restoreForm(k) {
    if ($("fBld")) $("fBld").value = k.bld || "";
    if ($("fRoom")) $("fRoom").value = k.room || "";
    if ($("fCat")) $("fCat").value = k.cat || "";
    if ($("fTitle")) $("fTitle").value = k.title || "";
    if ($("fDetail")) $("fDetail").value = k.detail || "";
    if (k.focus && $(k.focus)) $(k.focus).focus();
  }

  // ---------- 상세 ----------
  function openTask(id, refresh) {
    const t = st.tasks.find(x => x.id === id);
    const dlg = $("dlg");
    if (!t) { if (dlg.open) dlg.close(); st.openId = null; return; }
    st.openId = id; if (!refresh) { st.backRoom = st.openRoomId || st.backRoom; } st.openRoomId = null;
    const ev = st.events.filter(e => e.taskId === id).sort((a, b) => a.at - b.at);
    const acts = Core.actions(t, st.role);
    const prevCmt = refresh && $("cmtText") ? $("cmtText").value : "";
    if (Core.needsAck(t, st.role)) Core.ack(t, actor()).catch(() => {});
    $("dlgBody").innerHTML = `<button type="button" class="x" id="dlgX" aria-label="닫기">×</button>${st.backRoom ? `<button type="button" class="lnk" id="backRoom">← 객실로</button>` : ""}
      <h3><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${t.room ? (bTag(t) ? esc(bTag(t)) + " " : "") + esc(t.room) + " · " : ""}${esc(t.title)}</h3>
      <div class="meta">${esc(OPS.kindName(t.kind))}${t.category ? " · " + esc(t.category) : ""} · ${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · <b>${esc(t.status)}</b> · 등록 ${esc(whoLine({ uid: t.createdUid, by: t.createdBy, role: t.createdRole || t.fromDept, at: t.createdAt }))}${t.doneAt ? " · 완료 " + esc(hm(t.doneAt)) : ""}</div>
      ${t.detail ? `<div class="detail">${esc(t.detail)}</div>` : ""}
      <div class="acts">${acts.map((a, i) => `<button type="button" class="btn ${i === 0 ? "main" : ""}" data-act="${esc(a.to)}" data-id="${esc(t.id)}">${esc(a.label)}</button>`).join("") || `<span class="sub">${esc(OPS.deptName(st.role))} 역할에서 할 수 있는 동작이 없습니다.</span>`}</div>
      <form class="cmt" id="cmtForm"><input id="cmtText" placeholder="댓글·조치 내용" maxlength="1000" aria-label="댓글"><button class="btn" type="submit">남기기</button></form>
      <ol class="tl">${ev.map(e => `<li><b>${esc(e.action)}</b>${e.field ? ` ${esc(e.field)}: ${esc(e.from)} → ${esc(e.to)}` : e.to && e.action !== "댓글" ? ` <span class="w">${esc(e.from ? e.from + " → " : "")}${esc(e.to)}</span>` : ""}${e.note ? `<br>${esc(e.note)}` : ""}<br><span class="w">${esc(whoLine(e))}</span></li>`).join("")}</ol>`;
    if (prevCmt) $("cmtText").value = prevCmt;
    if (!dlg.open) dlg.showModal();
  }

  // ---------- 동작 ----------
  async function doMove(id, to, btn) {
    const t = st.tasks.find(x => x.id === id);
    if (!t) return;
    if (btn) btn.disabled = true;
    try { await Core.move(t, to, actor()); }
    catch (e) { flash(e.message); }
    finally { if (btn) btn.disabled = false; }
  }
  function flash(text) {
    const a = $("alert");
    a.style.display = "block"; a.textContent = text;
    setTimeout(render, 3500);
  }

  // 부서·메뉴를 바꾸면 새 화면의 맨 위에서 시작한다(이전 화면의 스크롤 위치를 끌고 오지 않음)
  function toTop() {
    try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, 0); }
    const v = $("view"); if (v) v.scrollTop = 0;
  }
  // 사이드바가 머리 바로 아래 붙도록 머리 높이를 잰다(글자 크게·줄바꿈에 따라 바뀜)
  function fitHead() { const hd = document.querySelector("header"); if (hd) document.documentElement.style.setProperty("--hh", hd.getBoundingClientRect().height + "px"); }
  window.addEventListener("resize", fitHead);
  try { new ResizeObserver(fitHead).observe(document.querySelector("header")); } catch (e) {}
  const drawer = on => { if (on) $("side").scrollTop = 0; document.body.classList.toggle("drawer", on); $("scrim").hidden = !on; $("menuBtn").setAttribute("aria-expanded", String(on)); if (on) setTimeout(() => { const a = document.querySelector('#tabs [aria-selected="true"]') || $("sideX"); if (a) a.focus({ preventScroll: true }); }, 30); };
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("drawer")) drawer(false); });
  document.addEventListener("click", e => {
    if (e.target.closest("#menuBtn") || e.target.closest("#whoBtn")) { drawer(!document.body.classList.contains("drawer")); return; }
    if (e.target.closest("#sideX") || e.target.id === "scrim") { drawer(false); return; }
    if (e.target.closest("#tabs [data-tab], #laterTabs [data-tab]")) drawer(false);
    const r = e.target.closest("[data-role]");
    if (r) { st.role = r.dataset.role; fitTab(); mem.set("role", st.role); history.replaceState(null, "", "#" + st.role.toLowerCase()); st.formTo = null; render(); toTop(); return; }
    const tb = e.target.closest("[data-tab]");
    if (tb) { st.tab = tb.dataset.tab; st.bf = ""; render(); toTop(); return; }
    const gt = e.target.closest("[data-gotab]");
    if (gt) { st.tab = gt.dataset.gotab; st.bf = gt.dataset.bfset || ""; render(); toTop(); return; }
    const bfb = e.target.closest("[data-bf]");
    if (bfb) { if (bfb.disabled) return; const k = bfb.dataset.bf; st.bf = st.bf === k ? "" : k; render(); return; }
    if (e.target.closest("#themeBtn")) { mem.set("theme", THEME_NEXT[mem.get("theme", "auto")] || "auto"); applyTheme(); return; }
    if (e.target.closest("#langBtn")) {
      // 영문 화면: 기기마다 저장. 한국어로 돌아갈 때는 새로 그려야 원래 글자가 돌아오므로 다시 불러온다
      const en = mem.get("lang", "ko") !== "en";
      mem.set("lang", en ? "en" : "ko"); mem.set("tab", st.tab);
      if (en) { OPS.I18n.set("en"); applyLang(); fitHead(); } else location.reload();
      return;
    }
    if (e.target.id === "clockRoll") { mem.set("tab", st.tab); location.reload(); return; }
    if (e.target.id === "dropMsgX") { st.dropMsg = null; render(); return; }
    if (e.target.id === "connCopy") {
      const inp = $("connUrl"); inp.focus(); inp.select();
      const ok = () => flash("링크를 복사했습니다. 다른 브라우저 주소창에 붙여 넣어 주십시오.");
      const old = () => { try { document.execCommand("copy") ? ok() : flash("길게 눌러 링크를 복사해 주십시오."); } catch (x) { flash("길게 눌러 링크를 복사해 주십시오."); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(SHARE_URL).then(ok, old); else old();
      return;
    }
    if (e.target.id === "connRetry") { mem.set("tab", st.tab); location.reload(); return; }
    if (e.target.closest("#sizeBtn")) { mem.set("size", mem.get("size", "") === "lg" ? "" : "lg"); applyTheme(); fitHead(); return; }
    const ds = e.target.closest("[data-delstay]");
    if (ds) { Store.remove(COL.manualStays, ds.dataset.delstay).catch(err => flash(err.message)); st.addMsg = "삭제했습니다."; return; }
    if (e.target.id === "stayAll") { st.stayAll = !st.stayAll; openRoom(st.openRoomId, true); return; }
    if (e.target.id === "roomAdd") { const r = boardM().rooms[st.openRoomId]; st.addPrefill = { b: r.b, no: r.no, start: st.rdate, n: 1 }; st.forceAdd = null; st.openRoomId = null; $("dlg").close(); st.tab = "svc"; render(); return; }
    const dk = e.target.closest("[data-desk]");
    if (dk) { deskAct(dk.dataset.desk, dk.dataset.id); return; }
    const lf = e.target.closest("[data-lost]");
    if (lf) { const x = st.lost.find(y => y.id === lf.dataset.id); if (x) OPS.Desk.setLost(x, lf.dataset.lost, actor()).catch(err => flash(err.message)); return; }
    const sv = e.target.closest("[data-svc]");
    if (sv && sv.tagName !== "INPUT") { svcAct(sv.dataset.svc, sv.dataset.id, sv); return; }
    if (e.target.id === "goSvc") { st.openRoomId = null; $("dlg").close(); st.tab = "svc"; render(); return; }
    const bm = e.target.closest("[data-bmode]");
    if (bm) { st.bMode = bm.dataset.bmode; mem.set("bmode", st.bMode); render(); return; }
    const pb = e.target.closest("[data-pb]");
    if (pb) { st.pb = pb.dataset.pb; render(); return; }
    const pf = e.target.closest("[data-pf]");
    if (pf) { st.pFloor[st.pb] = pf.dataset.pf; render(); return; }
    const zb = e.target.closest("[data-zoom]");
    if (zb) { const pv = $("pv"); if (zb.dataset.zoom === "fit") { st.zoom = fitZoom(pv); applyZoom(); } else zoomAt(zb.dataset.zoom === "in" ? 1.3 : 1 / 1.3, pv.clientWidth / 2, pv.clientHeight / 2); return; }
    const rm = e.target.closest("[data-room]");
    if (rm && rm.closest("#pv") && st.drag && st.drag.moved > 8) { st.drag = null; return; }
    if (rm) { st.backRoom = null; st.noteEdit = null; openRoom(rm.dataset.room); return; }
    if (e.target.id === "backRoom") { const r = st.backRoom; st.backRoom = null; st.openId = null; openRoom(r); return; }
    if (e.target.id === "bNeedBtn") { st.bNeed = !st.bNeed; render(); return; }
    if (e.target.id === "roomAck") {
      const M = boardM(), id = st.openRoomId;
      const list = st.tasks.filter(t => OPS.Rooms.resolve(t, M) === id && Core.needsAck(t, st.role));
      (async () => { for (const t of list) { try { await Core.ack(t, actor()); } catch (err) { flash(err.message); } } })();
      return;
    }
    if (e.target.id === "roomNew") {
      const r = st.master.rooms[st.openRoomId];
      st.prefill = { b: r.b, no: r.no }; st.openRoomId = null; st.backRoom = null; $("dlg").close(); st.tab = "work"; render(); return;
    }
    const ne = e.target.closest("[data-note-edit]");
    if (ne) { st.noteEdit = ne.dataset.noteEdit; openRoom(st.openRoomId); return; }
    if (e.target.closest("[data-note-cancel]")) { st.noteEdit = null; openRoom(st.openRoomId); return; }
    const sf = e.target.closest("[data-staff-toggle]");
    if (sf) { const x = st.staff.find(y => y.id === sf.dataset.staffToggle); if (x) Store.update(COL.staff, x.id, { active: !x.active }).catch(err => flash(err.message)); return; }
    if (e.target.id === "exportBtn") { exportAll(); return; }
    const rd = e.target.closest("[data-rdate]");
    if (rd) { st.rdate = rd.dataset.rdate; render(); return; }
    const rbb = e.target.closest("[data-rb]");
    if (rbb) { st.rb = rbb.dataset.rb; render(); return; }
    const ch = e.target.closest("[data-filter]");
    if (ch) { st.filter = ch.dataset.filter; render(); return; }
    const p = e.target.closest("[data-pri]");
    if (p) { st.formPri = p.dataset.pri; document.querySelectorAll("#fPri button").forEach(b => b.setAttribute("aria-pressed", b.dataset.pri === st.formPri)); return; }
    const act = e.target.closest("[data-act]");
    if (act) { e.stopPropagation(); doMove(act.dataset.id, act.dataset.act, act); return; }
    if (e.target.id === "dlgX") { $("dlg").close(); return; }
    const op = e.target.closest("[data-open]");
    if (op) { e.preventDefault(); openTask(op.dataset.open); }
  });
  document.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".task")) { e.preventDefault(); openTask(e.target.dataset.open); }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "fKind") { st.formKind = e.target.value; st.formTo = null; const k = captureForm(); render(); restoreForm(k); }
    if (e.target.id === "fTo") st.formTo = e.target.value;
    if (e.target.id === "myPart") mem.set("part", e.target.value);
    if (e.target.id === "rOnly") { st.rOnly = e.target.checked; render(); }
    if (e.target.id === "rHide") { st.rHide = e.target.checked; render(); }
    if (e.target.id === "bNeed") { st.bNeed = e.target.checked; render(); }
    if (e.target.matches && e.target.matches("input[data-svc]")) svcAct(e.target.dataset.svc, e.target.dataset.id, e.target);
    if (e.target.id === "fBld" && $("roomList")) $("roomList").innerHTML = roomOptions();
    if (e.target.id === "rFile" && e.target.files.length) { const fs = Array.from(e.target.files); e.target.value = ""; importFiles(fs, st.tab === "svc"); }
  });
  $("myName").addEventListener("input", e => mem.set("name", e.target.value));
  applyTheme(); setInterval(applyTheme, 60000);
  // ---------- 현재 시각(실시간) ----------
  // 이 기기 시계 기준(프로그램의 "오늘" 판단과 같은 기준). 매초 갱신, 초가 바뀌는 순간에 맞춘다.
  // 자정이 지나면 화면의 "오늘"·오늘 불출 목록은 연 날짜에 머물러 있으므로 다시 열기를 안내한다.
  const openDay = OPS.ymd(Date.now());
  let lastTouch = Date.now(), rollDone = false;
  ["pointerdown", "keydown", "input"].forEach(ev => window.addEventListener(ev, () => { lastTouch = Date.now(); }, true));
  const WD_KO = ["일", "월", "화", "수", "목", "금", "토"], WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const p2 = n => String(n).padStart(2, "0");
  function tickClock() {
    const d = new Date(), en = mem.get("lang", "ko") === "en";
    const t = p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
    if ($("clockT")) $("clockT").textContent = t;
    const part = OPS.guessPart(d) === "night" ? (en ? "Night shift" : "야간 파트") : (en ? "Day shift" : "주간 파트");
    const day = (d.getMonth() + 1) + "/" + d.getDate() + " (" + (en ? WD_EN : WD_KO)[d.getDay()] + ")";
    const rolled = OPS.ymd(d) !== openDay;
    const cd = $("clockD");
    if (cd) {
      const key = day + part + rolled + en;
      if (cd.dataset.k !== key) {
        cd.dataset.k = key;
        cd.innerHTML = esc(day) + (rolled ? `<button type="button" class="roll" id="clockRoll" title="${en ? "The date changed. Reload to switch today's lists to the new day." : "날짜가 바뀌었습니다. 다시 열면 오늘 기준 목록으로 바뀝니다."}">${en ? "Reload" : "다시 열기"}</button>` : esc(" · " + part));
      }
    }
    document.querySelectorAll("[data-now]").forEach(x => { x.textContent = hm(d.getTime()); });
    // v0.19: 켜 둔 현황판이 날짜가 바뀐 뒤에도 어제에 머물지 않게, 아무도 만지지 않은 지 3분이 지나면 스스로 다시 연다.
    // 입력 중·창이 열린 상태·저장 중이면 기다린다(쓰던 내용을 날리지 않는다).
    if (rolled && !rollDone && Date.now() - lastTouch > 3 * 60000 && !st.saving && !st.svcEdit && !($("dlg") && $("dlg").open)) {
      const ae = document.activeElement;
      if (!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) { rollDone = true; mem.set("tab", st.tab); location.reload(); }
    }
  }
  tickClock();
  (function loop() { tickClock(); setTimeout(loop, 1000 - (Date.now() % 1000) + 5); })();
  // 휴대폰에서는 이름·파트·밝기·언어·글자 크기를 머리에서 빼서 메뉴 서랍 안으로(현황판을 더 넓게)
  const placeMe = () => { const me = document.querySelector(".me"), narrow = innerWidth <= 600; const to = narrow ? $("sideMe") : document.querySelector(".top"); if (me && to && me.parentNode !== to) { to.appendChild(me); if (typeof fitHead === "function") fitHead(); } };
  placeMe(); addEventListener("resize", placeMe);
  document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("lgd")) st.lgOpen = e.target.open; }, true);
  applyLang(); if (mem.get("lang", "ko") === "en") OPS.I18n.set("en");
  document.addEventListener("input", e => { if (e.target.id === "rq") { st.rq = e.target.value; render(); } if (e.target.id === "lSearch") { st.lq = e.target.value; render(); } });
  $("dlg").addEventListener("close", () => { st.openId = null; st.openRoomId = null; st.backRoom = null; st.noteEdit = null; });
  document.addEventListener("submit", async e => {
    e.preventDefault();
    if (await deskSubmit(e.target)) return;
    if (e.target.id === "newForm") {
      const msg = $("fMsg");
      try {
        const bld = $("fBld") ? $("fBld").value : "";
        const roomTxt = $("fRoom").value.trim();
        let roomId = "";
        if (st.master && roomTxt) {
          const no = roomTxt.replace(/호$/, "");
          const hits = Object.keys(st.master.rooms).filter(id => st.master.rooms[id].no === String(+no) && /^\d{3,4}$/.test(no));
          if (!bld && hits.length > 1) throw new Error(no + "호는 " + hits.map(id => st.master.rooms[id].building).join("·") + "에 모두 있습니다. 동을 골라 주십시오.");
          roomId = OPS.Rooms.resolve({ room: roomTxt, building: bld }, st.master) || "";
        }
        await Core.createTask({
          building: roomId ? roomId.split("-")[0] : bld, roomId,
          kind: $("fKind").value, toDept: $("fTo").value, room: $("fRoom").value,
          category: $("fCat") ? $("fCat").value : "", title: $("fTitle").value,
          detail: $("fDetail") ? $("fDetail").value : "", priority: st.formPri
        }, actor());
        st.formPri = "일반"; st.formTo = null;
        $("fTitle").value = ""; $("fRoom").value = ""; if ($("fDetail")) $("fDetail").value = ""; if ($("fBld")) $("fBld").value = "";
        msg.className = "msg"; msg.textContent = "등록했습니다.";
        $("fTitle").focus();
      } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
    }
    const say = t => { st.setMsg = t; const m = $("setMsg"); if (m) m.textContent = t; };
    try {
      if (e.target.id === "addStay") {
        try { await addStay(); } catch (err) { st.addMsg = err.message; }
        render(); return;
      }
      if (e.target.id === "noteForm") {
        await saveNote(e.target.dataset.dept, $("noteTxt").value);
        st.noteEdit = null; openRoom(st.openRoomId); return;
      }
      if (e.target.id === "propForm") {
        const pid = $("sPid").value.trim().toLowerCase();
        if (!/^[a-z0-9-]{1,20}$/.test(pid)) throw new Error("지점 표시는 영문 소문자·숫자·하이픈 20자 이내입니다.");
        await saveSettings({ propertyName: $("sName").value.trim().slice(0, 40), propertyId: pid, dayStart: $("sDay").value, nightStart: $("sNight").value, pwDept: $("sPw").value });
        say("지점 설정을 저장했습니다."); render(); return;
      }
      if (e.target.id === "catForm") {
        const cats = Array.from(new Set($("sCats").value.split(/\r?\n/).map(x => x.trim().slice(0, 20)).filter(Boolean))).slice(0, 30);
        await saveSettings({ categories: cats });
        say("이슈 분류를 저장했습니다."); render(); return;
      }
      if (e.target.id === "staffForm") {
        const name = $("stName").value.trim().slice(0, 20);
        if (!name) throw new Error("이름을 적어 주십시오.");
        if (st.staff.some(x => x.name === name && x.dept === $("stDept").value)) throw new Error("같은 부서에 같은 이름이 이미 있습니다.");
        await Store.add(COL.staff, { name, dept: $("stDept").value, active: true, propertyId: OPS.CTX.propertyId, createdAt: Date.now() });
        say(name + " 님을 추가했습니다."); return;
      }
      if (e.target.id === "wingForm") {
        const b = $("wgB").value, txt = $("wgRule").value.trim();
        const rule = [];
        txt.split(",").map(x => x.trim()).filter(Boolean).forEach(part => {
          const m = /^(.+?)\s+(\d{1,2})\s*-\s*(\d{1,2})$/.exec(part);
          if (!m) throw new Error("규칙 형식: 'A동 1-14, B동 15-18'");
          rule.push({ name: m[1].trim().slice(0, 10), from: +m[2], to: +m[3] });
        });
        const M = JSON.parse(JSON.stringify(st.master)); delete M.id;
        M.layouts = M.layouts || {}; M.layouts[b] = Object.assign({}, M.layouts[b] || {});
        if (rule.length) M.layouts[b].wings = rule; else delete M.layouts[b].wings;
        M.updatedAt = Date.now();
        await Store.set(COL.property, "main", M); st.master = M;
        say(rule.length ? "배치도 동 구분을 저장했습니다." : "배치도 동 구분을 지웠습니다."); render(); return;
      }
      if (e.target.id === "roomForm") {
        const nums = parseRooms($("rbRooms").value);
        if (!nums.length) throw new Error("객실 번호를 적어 주십시오. 예: 201-215, 301");
        const M = st.master ? JSON.parse(JSON.stringify(st.master)) : { buildings: [], rooms: {} };
        delete M.id;
        let b = $("rbSel").value;
        if (!b) {
          const nm = $("rbName").value.trim().slice(0, 12) || (M.buildings.length ? "" : "본관");
          if (!nm) throw new Error("새 동 이름을 적어 주십시오.");
          if (M.buildings.some(x => x.name === nm)) throw new Error(nm + "은(는) 이미 있습니다. 위에서 골라 주십시오.");
          let i = 1; while (M.buildings.some(x => x.id === "b" + i)) i++;
          b = "b" + i; M.buildings.push({ id: b, name: nm });
        }
        const bn = (M.buildings.find(x => x.id === b) || {}).name || "";
        let added = 0;
        nums.forEach(no => { const id = OPS.Rooms.roomId(b, no); if (!M.rooms[id]) { M.rooms[id] = { b, building: bn, no, dong: "", type: "" }; added++; } });
        M.updatedAt = Date.now();
        await Store.set(COL.property, "main", M);
        st.master = M;
        say(`${bn} 객실 ${added}개를 추가했습니다${added < nums.length ? ` (이미 있던 ${nums.length - added}개 제외)` : ""}.`); render(); return;
      }
    } catch (err) { const m = err.message || String(err); if ($("setMsg")) say(m); else flash(m); return; }
    if (e.target.id === "cmtForm") {
      const t = st.tasks.find(x => x.id === st.openId);
      if (!t) return;
      try { await Core.comment(t, $("cmtText").value, actor()); $("cmtText").value = ""; }
      catch (err) { flash(err.message); }
    }
  });
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1).toUpperCase();
    if (OPS.DEPTS.some(d => d.id === h) && h !== st.role) { st.role = h; fitTab(); render(); }
  });

  function syncBadge() {
    const w = $("where"); if (!w || !st.store) return;
    const db = st.store === "db";
    w.className = "badge live " + (st.saveErr || st.readOnly ? "err" : db ? "db" : "");
    w.innerHTML = `<i aria-hidden="true"></i>${st.readOnly ? "보기 전용" : st.saveErr ? "저장 실패" : st.saving ? "저장 중…" : db ? "실시간" + (st.lastRecv ? " " + esc(hm(st.lastRecv).split(" ")[1]) : "") : "이 기기에만 저장"}`;
    w.title = db ? "공유 DB에 연결되어 다른 기기의 변경이 바로 반영됩니다. 시각은 마지막으로 변경을 받은 때." : "공유 DB에 연결되지 않아 이 브라우저에만 저장됩니다.";
    const ll = document.querySelector("p.live"); if (ll) ll.outerHTML = liveLine();
  }

  // ---------- 시작 ----------
  fitHead(); setTimeout(fitHead, 600);
  $("myPart").innerHTML = OPS.PARTS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("myPart").value = mem.get("part", OPS.guessPart());
  $("myName").value = mem.get("name", "");
  render();
  (async () => {
    // 로그인한 사람(계정). 못 받으면 null → 이름 칸 입력을 쓴다
    try {
      const c = window.claude;
      UAPI = c && typeof c.use === "function" ? await Promise.race([c.use("user"), new Promise(r => setTimeout(() => r(null), 10000))]) : null;
      if (UAPI) {
        const id = await UAPI.id();
        if (id) {
          st.me = { id };
          try { const p = await UAPI.me(); if (p && p.name) st.names[id] = p.name; } catch (e) {}
          const nm = $("myName"); nm.placeholder = "로그인: " + (st.names[id] || "계정") + " (다른 표시 이름은 여기에)";
        }
      }
    } catch (e) { UAPI = null; }
    const kind = await Store.init();
    st.store = kind;
    // 공유 DB가 열려도 계정의 공유 수준이 보기 전용이면 쓰기가 거절된다(플랫폼 규칙). 미리 묻고 화면에 알린다
    if (kind === "db" && UAPI && typeof UAPI.can === "function") {
      try { const w = await UAPI.can("data.write"); if (w === false) st.readOnly = true; st.canWrite = w; } catch (e) {}
    }
    // 저장·수신 시각을 기록해 "반영 중인지"를 화면에 보인다
    ["add", "set", "update", "remove"].forEach(m => {
      const orig = Store[m].bind(Store);
      Store[m] = async (...a) => {
        if (st.readOnly) { flash("보기 전용 계정이라 저장되지 않았습니다. 위 안내를 확인해 주십시오."); throw new Error("보기 전용 계정: 저장 권한 없음"); }
        st.saving = (st.saving || 0) + 1; syncBadge();
        try { const r = await orig(...a); st.lastSaved = Date.now(); st.saveErr = ""; return r; }
        catch (e) {
          // 권한을 미리 알 수 없었던 경우(null) 거절된 쓰기로 판단한다
          if (st.store === "db" && st.canWrite !== true && e && e.code === "invalid_argument") { st.readOnly = true; connBanner(); flash("이 계정에는 기록 권한이 없습니다. 위 안내를 확인해 주십시오."); }
          st.saveErr = (e && e.message) || String(e); throw e;
        }
        finally { st.saving--; syncBadge(); }
      };
    });
    ["watch", "watchWhere"].forEach(m => {
      const orig = Store[m].bind(Store);
      Store[m] = (...a) => { const i = a.findIndex(x => typeof x === "function"); const fn = a[i]; a[i] = list => { st.lastRecv = Date.now(); fn(list); syncBadge(); }; return orig(...a); };
    });
    const w = $("where");
    syncBadge(); render();
    $("foot").textContent = kind === "db"
      ? "기록은 이 페이지의 공유 DB에 저장됩니다. 1인 시험판이며 역할은 화면 위에서 바꿉니다. 실제 투숙객 정보는 넣지 마십시오."
      : "공유 DB에 연결되지 않아 이 브라우저에만 저장됩니다. 다른 기기에서는 보이지 않습니다.";
    const err = e => flash("실시간 동기화 오류: " + (e && e.message || e));
    Store.watch(COL.tasks, list => { st.tasks = list; render(); }, err);
    Store.watch(COL.events, list => { st.events = list; if (st.tab === "log" || st.openId) render(); }, err);
    Store.watch(COL.settings, list => { applySettings(list.find(x => x.id === "main")); render(); }, err);
    Store.watch(COL.manualStays, list => { st.manual = list; render(); }, err);
    Store.watch(COL.stayIndex, list => { st.stayIdx = list.find(x => x.id === "main") || null; if (st.openRoomId && $("dlg").open) openRoom(st.openRoomId, true); }, err);
    // 불출은 오늘 것만, 재고는 오늘 문서, 분실물은 전체(건수가 적다)
    const today0 = OPS.ymd(Date.now());
    Store.watchWhere(COL.deliveries, "date", today0, list => { st.deliv = list; if (st.tab === "desk" || st.tab === "board" || st.tab === "dash") render(); }, err);
    Store.watchWhere(COL.stock, "date", today0, list => { const o = {}; list.forEach(x => { o[x.b] = x; }); st.stock = o; if (st.tab === "desk" || st.tab === "svc") render(); }, err);
    Store.watch(COL.lostFound, list => { st.lost = list; if (st.tab === "desk" || st.tab === "dash") render(); }, err);
    Store.watch(COL.roomNotes, list => { const o = {}; list.forEach(x => { o[x.id] = x; }); st.notes = o; if (st.tab === "board" || st.openRoomId) render(); }, err);
    Store.watch(COL.staff, list => { st.staff = list; render(); }, err);
    Store.watch(COL.property, list => { const m = list.find(x => x.id === "main"); st.master = m && m.rooms ? m : null; render(); }, err);
    Store.watch(COL.roomDays, list => { const o = {}; list.forEach(x => { o[x.id] = x; }); st.days = o; if (st.tab === "rooms" || st.tab === "board" || st.tab === "dash") render(); }, err);
  })();
}
