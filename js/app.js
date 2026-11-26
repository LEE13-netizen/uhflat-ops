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
    { id: "work", name: "작업대" },          // [web] 1단계 구조: 할 일 + 받은 편지함 + 불출 처리를 한 곳으로
    { id: "svc", name: "청소·재실" },
    { id: "desk", name: "재고·분실물" },
    { id: "shift", name: "교대·인수인계", later: "3단계" },
    { id: "check", name: "체크리스트", later: "4단계" },
    { id: "rooms", name: "보관함" },           // [web] 이슈 목록 → 종류별 보관함
    { id: "log", name: "이력" },
    { id: "dash", name: "통계", mg: true },
    { id: "settings", name: "설정" }
  ];
  const LATER = {
    shift: ["근무 교대 열기·마감", "마감 때 미완료 업무와 미체크 항목 자동 수집", "다음 근무자 확인 기록", "마감 후 잠금(월 마감 구조 변형)"],
    check: ["부서별 당일 체크 틀", "근무자별 체크 실행", "미체크 항목을 '체크 미완료' 업무로 승격"]
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
    rdate: OPS.ymd(Date.now()), rq: "", rb: "all", rOnly: true, rHide: true, rMsg: "",
    hf: "all", sendType: "", sendPicked: false, ns: new Map(), svcB: "", today: OPS.ymd(Date.now()), delivAll: [], stockAll: [], handoffs: [],          // [web] 작업대: 종류 거르기, 보내기 종류
    ak: "issue", ap: "30", as: "all", ac: "", aq: "", aMore: false   // [web] 보관함: 종류·기간·상태·분류·찾기
  };
  // [web] 웹 로그인: 허용된 부서만(프로그램 관리자 = 모든 부서)
  const canRole = id => !OPS.Auth || OPS.Auth.allowed.includes(id);
  OPS.headOf = r => !!(OPS.Auth && OPS.Auth.head && OPS.Auth.dept === r);   // [web] 부서장(자기 부서 업무 전부 처리)
  if (!OPS.DEPTS.some(d => d.id === st.role) || !canRole(st.role)) st.role = OPS.Auth ? OPS.Auth.dept : "FO";
  st.locked = mem.get("locked", "") === "1";
  // v0.21 첫 화면: 브라우저를 새로 열 때마다 부서 고르기 화면부터(같은 창의 새로 고침·자정 전환은 유지)
  try { if (!sessionStorage.getItem("opsEntered")) st.locked = true; } catch (e) {}
  if (OPS.Auth) st.locked = false;   // [web] PIN 로그인이 입구
  // 부서 아이콘(v0.21). 영문 약자 대신 그림: 프론트=데스크에 선 사람, 키핑=빗자루, 시설=렌치, 관리자=방패
  const ICON_PATH = {
    FO: '<circle cx="9" cy="5" r="2.7"/><path d="M3.8 13.2c.3-3 2.4-4.9 5.2-4.9s4.9 1.9 5.2 4.9"/><path d="M15.8 13.2a2.7 2.7 0 0 1 5.4 0"/><path d="M18.5 9.4v1.1"/><path d="M1.8 13.2h20.4"/><path d="M3.3 13.2v7.8h17.4v-7.8"/>',
    HK: '<path d="M15.5 2.5 11 12"/><path d="M6.5 12h8.5l2 9h-12.5z"/><path d="M8.5 15.5v5.5M11.5 15.5v5.5M14.5 15.5v5.5"/><path d="M19.5 3.5v4M17.5 5.5h4"/>',
    FM: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    MG: '<path d="M12 21.5s8-3.8 8-10V5.2L12 2.5 4 5.2v6.3c0 6.2 8 10 8 10z"/><path d="m8.8 11.8 2.3 2.3 4.3-4.4"/>',
    MN: '<rect x="5" y="4" width="14" height="17.5" rx="2"/><path d="M9 4V2.8h6V4"/><path d="m8.5 10 1.6 1.6 2.9-3"/><path d="M14.5 10.5h2"/><path d="m8.5 15.5 1.6 1.6 2.9-3"/><path d="M14.5 16h2"/>'
  };
  const icon = (id, size) => `<svg class="di" viewBox="0 0 24 24" width="${size || 22}" height="${size || 22}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATH[id] || ""}</svg>`;
  const STAFF_DEPTS = () => OPS.DEPTS.filter(d => d.id !== "MG");
  // 관리자(프로그램 전체 관리)는 이 시스템 소유자만. 계정 정보를 못 받는 환경(이 기기 전용 시험)에서는 막지 않는다
  const adminOk = () => OPS.Auth ? !!OPS.Auth.owner : (!!st.uReady && (!UAPI || st.owner === true));   // [web] 프로그램 관리자 계정만
  // 현황판(객실 판)이 모든 부서의 첫 화면. 통계는 관리자만
  // v0.23: 통계는 관리자(소유자)와 매니지먼트
  const fitTab = () => { if (!OPS.isMgr(st.role) && st.tab === "dash") st.tab = "board"; st.bf = ""; };
  { const t0 = mem.get("tab", ""); if (t0 && TABS.some(t => t.id === t0)) st.tab = t0; mem.set("tab", ""); }
  fitTab();
  st.bMode = ["plan", "stack"].includes(mem.get("bmode", "grid")) ? mem.get("bmode", "grid") : "grid";   // [web] stack = 건물 배치도

  // 작성자 = 로그인한 사람(claude.ai 계정) + 지금 부서. 저장은 계정 id만, 이름은 화면에 그릴 때마다 계정에서 읽는다.
  // 로그인 정보를 못 받으면(공개 링크로 들어온 사람 등) 이름 칸에 적은 이름을 쓴다.
  const actor = () => ({ role: st.role, uid: st.me ? st.me.id : "", name: $("myName").value.trim() || (st.me ? "" : OPS.deptName(st.role) + " 근무자") });   // v0.21: 주간·야간 파트 구분 없앰(새 기록에 파트를 남기지 않음)
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
      b.innerHTML = (dark ? MOON : SUN) + `<span>${OPS.Auth ? (mode === "auto" ? "자동(" + (dark ? "어둡게" : "밝게") + ")" : dark ? "어둡게" : "밝게") : mode === "auto" ? (dark ? "야간 자동" : "주간 자동") : dark ? "야간" : "주간"}</span>`;
      b.setAttribute("aria-pressed", String(mode !== "auto"));
      b.setAttribute("aria-label", "화면 밝기, 지금 " + (mode === "auto" ? "자동" : dark ? (OPS.Auth ? "어둡게 고정" : "야간 고정") : (OPS.Auth ? "밝게 고정" : "주간 고정")) + ". 누르면 바뀜");
    }
    const big = mem.get("size", "") === "lg";
    document.documentElement.dataset.size = big ? "lg" : "";
    if ($("sizeBtn")) { $("sizeBtn").setAttribute("aria-pressed", String(big)); $("sizeBtn").textContent = big ? "가-" : "가+"; $("sizeBtn").title = big ? "글자 보통" : "글자 크게"; }
  }

  function renderHead() {
    applyTheme();
    renderNames();
    const mk = document.querySelector(".mark small");
    if (mk) mk.textContent = (OPS.CTX.propertyName ? OPS.CTX.propertyName + " · " : "") + "통합 업무 시스템 · " + OPS.VERSION + (OPS.Auth ? " · 웹" : " · 1인 시험판");
    $("roles").innerHTML = STAFF_DEPTS().filter(d => canRole(d.id)).map(d => {
      const n = st.tasks.filter(t => Core.needsAck(t, d.id)).length + (d.id === "HK" && st.master ? svcRows().filter(OPS.Svc.hkNeedsAck).length : 0) + (d.id === "FO" && st.master ? svcRows().filter(foSvcNeed).length : 0);
      return `<button type="button" data-role="${d.id}" aria-pressed="${d.id === st.role}" aria-label="${esc(d.en + " " + d.name)}${n ? ", 확인 필요 " + n + "건" : ""}"><span class="rc">${icon(d.id)}</span><span class="rl"><span class="re">${esc(d.en)}</span><span class="rk">${esc(d.name)}</span></span>${n ? `<span class="n">${n}</span>` : ""}</button>`;
    }).join("");
    const me = OPS.DEPTS.find(d => d.id === st.role) || {};
    const wb = $("whoBtn"); if (wb) { wb.dataset.who = st.role; wb.innerHTML = `<span class="rc">${icon(me.id)}</span><span class="rk2">${esc(me.name || "")}${st.me && !OPS.Auth ? " · " + esc(nameOf(st.me.id, $("myName").value.trim()) || "로그인") : ""}</span>`; }
    const ab = $("adminBtn"); if (ab) { ab.hidden = !adminOk(); ab.setAttribute("aria-pressed", String(st.role === "MG")); }
    // 탭 숫자: 키핑은 아직 출발 안 한 불출, 프론트는 키핑이 "못 함"으로 돌려보낸 오늘 요청
    // [web] 작업대 숫자 = 확인 안 한 업무 + (키핑) 아직 출발 안 한 불출 + (프론트) 키핑이 "못 함"으로 돌려보낸 오늘 불출
    const badge = id => (id === "work" ? hubCount(st.role) : 0);
    // 메뉴 버튼 숫자 = 지금 부서가 볼 것(작업대 + 청소·재실 확인)
    const myN = (st.role === "HK" && st.master ? svcRows().filter(OPS.Svc.hkNeedsAck).length : 0) + (st.role === "FO" && st.master ? svcRows().filter(foSvcNeed).length : 0) + TABS.reduce((a, t) => a + badge(t.id), 0);
    const mb = $("menuBadge"); if (mb) { mb.hidden = !myN; mb.textContent = myN; }
    // 쓰는 메뉴와 아직 준비 중인 메뉴(교대·체크리스트)를 나눠 그린다
    const tabBtn = t => { const n = badge(t.id); return `<button type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === st.tab}">${esc(t.name)}${n ? `<span class="tbadge">${n}</span>` : ""}${t.later ? `<span class="later">${esc(t.later)}</span>` : ""}</button>`; };
    const shown = TABS.filter(t => !t.mg || OPS.isMgr(st.role));
    $("tabs").innerHTML = shown.filter(t => !t.later).map(tabBtn).join("");
    if ($("laterTabs")) $("laterTabs").innerHTML = shown.filter(t => t.later).map(tabBtn).join("");
  }

  // ---------- 업무 한 줄 ----------
  function taskRow(t, role, o) {
    let acts = Core.actions(t, role);
    if (o && o.sent && acts[0] && acts[0].to === "취소") acts = [];   // [web] 보낸 것: 취소는 카드를 열어서만
    const late = Core.isOverdue(t);
    const go = acts[0] ? `<button type="button" class="btn ${acts[0].to === "진행 중" || acts[0].to === "완료" || acts[0].to === "완료 대기" ? "main" : ""} go" data-act="${esc(acts[0].to)}" data-id="${esc(t.id)}">${esc(acts[0].label)}</button>` : "";
    const need = Core.needsAck(t, role);
    return `<div class="task ${t.priority === "긴급" && Core.isOpen(t) ? "hot" : ""} ${need ? "need" : ""}" tabindex="0" data-open="${esc(t.id)}">
      <span class="room ${t.room ? "" : "none"}">${t.room ? (bTag(t) ? `<small>${esc(bTag(t))}</small>` : "") + esc(t.room) : "위치<br>없음"}</span>
      <span class="t">${need ? `<span class="unread">확인 필요</span> ` : ""}<span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${Core.isOpen(t) ? carryChip(t.createdAt) : ""}${esc(t.title)}</span>
      ${go}
      <span class="meta">${esc(OPS.kindName(t.kind))} · ${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · <span class="st">${esc(t.status)}</span> · ${esc(nameOf(t.createdUid, t.createdBy !== "(이름 없음)" ? t.createdBy : "") || "(이름 없음)")} ${esc(ago(t.createdAt))}${late ? ` · <span class="late">기한 초과</span>` : ""}${readChip(t, st.events, role) ? " · " + readChip(t, st.events, role) : ""}</span>
    </div>`;
  }
  // [web] 읽음 표시 칩: 받은 부서(완료 보고면 요청 부서)가 읽었는가. 그 부서 화면에는 안 보인다(대신 깜빡임)
  const rdTime = at => { const h = hm(at); return OPS.ymd(at) === OPS.ymd(Date.now()) ? h.split(" ")[1] : h; };
  function readChip(t, events, role) {
    const r = Core.readState(t, events);
    if (!r || r.dept === (role || st.role)) return "";
    const dn = esc(OPS.deptName(r.dept));
    if (!r.at) return `<span class="rdy-r no" title="${dn}에서 아직 열어 보지 않았습니다">${dn} 읽지 않음</span>`;
    const nm = r.by ? nameOf(r.uid, r.by) : "";
    return `<span class="rdy-r yes" title="${dn}에서 읽음">${dn} 읽음 ${esc(rdTime(r.at))}${nm ? " " + esc(nm) : ""}</span>`;
  }
  const multiB = () => !!(st.master && st.master.buildings && st.master.buildings.length > 1);
  const bTag = t => (multiB() && t.building ? ((st.master.buildings.find(b => b.id === t.building) || {}).name || "") : "");
  const listHtml = (arr, role, empty) => arr.length ? `<div class="list">${Core.sort(arr).map(t => taskRow(t, role)).join("")}</div>` : `<div class="empty">${esc(empty)}</div>`;

  // ---------- [web] 날짜 경계: 자정으로 자르지 않는다 ----------
  // 24시간 운영이라 시계로 선을 긋지 않는다. 근무를 넘겨받는 순간("인수 확인")이 경계다.
  // 누르기 전까지는 앞 근무의 일. 아무도 안 눌렀을 때만 근무 시작 시각(주간·야간 시작)을 기준으로 "넘어온 것"을 보여 준다.
  const COL_HO = "handoffs";
  function dayFilter() {
    const t = st.today = OPS.ymd(Date.now());
    st.deliv = (st.delivAll || []).filter(d => d.date === t || OPS.Desk.isOpen(d));
    const o = {}; (st.stockAll || []).filter(x => x.date === t).forEach(x => { o[x.b] = x; }); st.stock = o;
  }
  const hm2m = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return m ? +m[1] * 60 + +m[2] : null; };
  // 그 시각(HH:MM)이 now 이전에 마지막으로 지나간 순간
  function lastClock(hhmm, now) {
    const mm = hm2m(hhmm); if (mm == null) return 0;
    const d = new Date(now); d.setHours(Math.floor(mm / 60), mm % 60, 0, 0);
    if (d.getTime() > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  // 지금 근무가 시작된 순간(주간 시작·야간 시작 중 더 최근)
  const shiftStart = (now = Date.now()) => Math.max(lastClock(OPS.CTX.dayStart, now), lastClock(OPS.CTX.nightStart, now));
  // 며칠째: 주간 시작 시각을 몇 번 넘겼는가 + 1 (자정이 아니라 근무일 기준)
  const carryDays = (at, now = Date.now()) => at ? Math.max(1, Math.round((lastClock(OPS.CTX.dayStart, now) - lastClock(OPS.CTX.dayStart, at)) / 864e5) + 1) : 1;
  const carryChip = at => { const n = carryDays(at); return n >= 2 ? `<span class="carry ${n >= 3 ? "old" : ""}" title="근무일 기준 ${n}일째 열려 있습니다">${n}일째</span>` : ""; };
  // 우리 부서가 이번 근무에서 인수 확인을 했는가
  const myHandoff = (dept, since) => (st.handoffs || []).filter(h => h.dept === dept && h.at >= since).sort((a, b) => b.at - a.at)[0] || null;
  // ---------- [web] 작업대: 모든 업무를 처리하는 한 곳 ----------
  // 업무(tasks)와 불출(deliveries)을 같은 목록으로 본다. 저장 형식은 그대로 두고 화면에서만 맞춘다(DB 변경 없음).
  // 끝난 카드는 보관함으로 간다(보관함은 보기·찾기 전용).
  const SEND_TYPES = [
    { id: "issue", name: "이슈" }, { id: "request", name: "고객 요청" }, { id: "repair", name: "수리" },
    { id: "deliv", name: "불출" }, { id: "clean", name: "청소" }, { id: "inspect", name: "점검" }, { id: "pwchange", name: "비번 변경" }
  ];
  // 제목에 들어간 단어로 보낼 곳을 추천한다(돈이 들지 않음). 고르는 것은 보내는 사람
  const SEND_HINTS = [
    ["deliv", /수건|타월|생수|물\s*\d|휴지|티슈|베개|이불|토퍼|세제|쓰레기\s*봉투|옷걸이|다리미|어메니티|칫솔|슬리퍼/],
    ["repair", /고장|안\s*됨|안\s*돼|안돼|안됨|누수|새요|막힘|막혔|교체\s*필요|전등|조명|형광등|에어컨|냉방|난방|보일러|온수|tv|티비|리모컨|도어락|배터리|변기|배수|샤워기|콘센트|차단기|와이파이|wifi/i],
    ["pwchange", /비번\s*변경|비밀번호\s*변경|도어락\s*비번/],
    ["request", /요청|부탁|원하|체크아웃\s*연장|레이트|얼리|모닝콜|택시|짐\s*보관/],
    ["issue", /불만|컴플레인|항의|소음|냄새|벌레|머리카락|청결|불친절|환불/]
  ];
  const hintType = txt => { const t = String(txt || ""); const h = SEND_HINTS.find(([, re]) => re.test(t)); return h ? h[0] : ""; };
  const canDeliv = () => st.role === "FO" || OPS.isMgr(st.role);
  const sendTypes = () => SEND_TYPES.filter(x => x.id !== "deliv" || canDeliv());
  const curSend = () => { const t = st.sendType || (canDeliv() ? "issue" : st.role === "HK" ? "repair" : "issue"); return sendTypes().some(x => x.id === t) ? t : "issue"; };
  const hubKind = t => (t.kind === "issue" || t.kind === "request" || t.kind === "repair" ? t.kind : "etc");
  const HUB_FILTERS = [["all", "전체"], ["issue", "이슈"], ["request", "고객 요청"], ["repair", "수리"], ["deliv", "불출"], ["etc", "기타"]];
  // 우리 부서 몫
  function hubParts(r) {
    const D = OPS.Desk, mgr = OPS.isMgr(r);
    const todoT = st.tasks.filter(t => mgr ? Core.isOpen(t) && t.status !== "완료 대기" : t.toDept === r && t.status !== "완료 대기" && filterGroup(t));
    const confirmT = st.tasks.filter(t => mgr ? t.status === "완료 대기" : t.fromDept === r && t.toDept !== r && t.status === "완료 대기");
    const sentT = mgr ? [] : st.tasks.filter(t => t.fromDept === r && t.toDept !== r && Core.isOpen(t) && t.status !== "완료 대기");
    const openD = D.sortOpen(st.deliv.filter(D.isOpen));
    const failD = st.deliv.filter(d => d.fail && !d.cancel);
    const todoD = r === "HK" || mgr ? openD : r === "FO" ? failD : [];
    const sentD = r === "FO" ? openD : [];
    return { todoT, confirmT, sentT, todoD, sentD };
  }
  // [web] 보내기 종류 바꾸기: 적던 객실 번호와 내용은 새 칸으로 옮긴다
  function switchSend(type, picked) {
    const room = ($("fRoom") || $("dqNo") || {}).value || "", bld = ($("fBld") || $("dqB") || {}).value || "";
    const title = ($("fTitle") || {}).value || "";
    st.sendType = type; st.sendPicked = !!picked; st.formTo = null; st.fMsg = ""; st.dMsg = "";
    st.sendRoom = room ? { b: bld, no: room } : null;
    render();
    if ($("fRoom")) { $("fRoom").value = room; if ($("fBld") && bld) $("fBld").value = bld; }
    if ($("fTitle")) { $("fTitle").value = title; if (title) sendHint(title); }
    if ($("dOther") && title && !$("dOther").value) $("dOther").value = title.slice(0, 80);
  }
  // 내용에 맞는 종류를 추천만 한다(누르면 바뀜). 직접 고른 뒤에는 조용히 있는다
  function sendHint(txt) {
    const el = $("sendHint"); if (!el) return;
    const h = hintType(txt), cur = curSend();
    if (!h || h === cur || st.sendPicked || !sendTypes().some(x => x.id === h)) { el.innerHTML = ""; return; }
    el.innerHTML = `추천: <button type="button" class="btn sm" data-send="${h}">${esc((SEND_TYPES.find(x => x.id === h) || {}).name)}(으)로 보내기</button>`;
  }
  // [web] 인수 확인: 넘어온 것을 이 부서가 넘겨받았다는 기록(누가·언제·몇 건). 넘어온 업무는 함께 확인 처리한다
  async function handoff() {
    const r = st.role, a = actor(), S0 = shiftStart(), P = hubParts(r);
    const old = x => (x.createdAt || x.at || 0) < S0;
    const ts = P.todoT.filter(old), ds = P.todoD.filter(old);
    try {
      await Store.add(COL_HO, { dept: r, at: Date.now(), shiftStart: S0, by: a.name || "", uid: a.uid || "", role: r, propertyId: OPS.CTX.propertyId,
        items: ts.map(t => ({ t: "task", id: t.id, days: carryDays(t.createdAt) })).concat(ds.map(d => ({ t: "deliv", id: d.id, days: carryDays(d.at) }))) });
      for (const t of ts) { if (Core.needsAck(t, r)) { try { await Core.ack(t, a); } catch (e) {} } }
      flash(OPS.deptName(r) + " 인수 확인을 남겼습니다(" + (ts.length + ds.length) + "건).");
    } catch (e) { flash("인수 확인 실패: " + (e && e.message || e)); }
    render();
  }
  function hubCount(r) {
    const P = hubParts(r);
    return st.tasks.filter(t => Core.needsAck(t, r)).length + (r === "HK" ? P.todoD.filter(d => !d.go).length : r === "FO" ? P.todoD.length : 0);
  }
  function hubView() {
    const r = st.role, mgr = OPS.isMgr(r), P = hubParts(r), f = st.hf;
    const okT = t => f === "all" || hubKind(t) === f, okD = () => f === "all" || f === "deliv";
    // 업무와 불출을 한 줄로 섞는다: 긴급 먼저, 그다음 오래된 것 먼저
    const merge = (ts, ds, sentList) => ts.filter(okT).map(t => ({ hot: t.priority === "긴급" ? 0 : 1, at: t.createdAt, h: taskRow(t, r, { sent: sentList }) }))
      .concat(okD() ? ds.map(d => ({ hot: d.urgent ? 0 : 1, at: d.at, h: `<div class="hubd">${delivRow(d)}</div>` })) : [])
      .sort((a, b) => a.hot - b.hot || a.at - b.at);
    const box = (arr, empty) => arr.length ? `<div class="list">${arr.map(x => x.h).join("")}</div>` : `<div class="empty">${esc(empty)}</div>`;
    // [web] 넘어온 것: 이번 근무 시작 전에 생겨 아직 안 끝난 것. 인수 확인 전에는 위에 따로 모으고 아래 목록에서는 뺀다(한 건은 한 곳에)
    const S0 = shiftStart(), ho = mgr ? null : myHandoff(r, S0);
    const old = x => (x.createdAt || x.at || 0) < S0;
    const carT = !mgr && !ho ? P.todoT.filter(old) : [], carD = !mgr && !ho ? P.todoD.filter(old) : [];
    const carried = merge(carT, carD);
    const todo = merge(P.todoT.filter(t => !carT.includes(t)), P.todoD.filter(d => !carD.includes(d))), conf = merge(P.confirmT, []), sent = merge(P.sentT, P.sentD, true);
    const longT = mgr ? Core.sort(st.tasks.filter(t => Core.isOpen(t) && carryDays(t.createdAt) >= 3)) : [];
    const cnt = k => (k === "all" ? P.todoT.length + P.todoD.length : k === "deliv" ? P.todoD.length : P.todoT.filter(t => hubKind(t) === k).length);
    const chips = `<div class="chips hubf">${HUB_FILTERS.filter(([k]) => k !== "deliv" || r === "HK" || r === "FO" || mgr).map(([k, n]) => `<button type="button" data-hf="${k}" aria-pressed="${f === k}">${esc(n)}${cnt(k) ? ` <b>${cnt(k)}</b>` : ""}</button>`).join("")}</div>`;
    const stChips = `<div class="chips" id="chips">${[["open", "처리할 것"], ["hold", "보류"], ["done", "최근 24시간 완료"]].map(([k, n]) => `<button type="button" data-filter="${k}" aria-pressed="${st.filter === k}">${n}</button>`).join("")}</div>`;
    const todoTitle = mgr ? "열린 업무 전체" : r === "FO" ? "우리 부서가 할 것" : "받은 것";
    const todoSub = mgr ? "모든 부서의 열린 업무와 진행 중 불출입니다." : r === "FO" ? "프론트로 온 업무와, 키핑이 \"못 함\"으로 돌려보낸 불출입니다. 손님께 다시 안내하십시오." : r === "HK" ? "키핑으로 온 업무와 불출입니다. 깜빡이는 줄은 아직 확인 안 한 것입니다." : OPS.deptName(r) + "로 온 업무입니다.";
    const carryCard = carried.length ? `<section class="card carryc"><h2>넘어온 것 <span class="c">${carried.length}</span></h2>
        <p class="sub">${esc(hm(S0))} 근무 시작 전에 생겨 아직 안 끝난 것입니다. 훑어보고 <b>인수 확인</b>을 누르면 누가 넘겨받았는지 남고, 아래 목록으로 내려갑니다.</p>
        ${box(carried, "")}<div class="acts"><button type="button" class="btn main" data-handoff="1">${esc(OPS.deptName(r))} 인수 확인 (${carried.length}건)</button></div></section>` : "";
    const hoLine = ho ? `<p class="sub hol">인수 확인 ${esc(hm(ho.at))} · ${esc(nameOf(ho.uid, ho.by) || ho.by || "")} · 넘겨받은 ${ho.items ? ho.items.length : 0}건</p>` : "";
    const longCard = longT.length ? `<section class="card carryc"><h2>오래 넘어간 것 <span class="c">${longT.length}</span></h2><p class="sub">근무일 기준 3일 넘게 열린 업무입니다(SYSTEM OWNER에게 보임). 보류 이유를 적거나, 담당을 바꾸거나, 취소할지 정해 주십시오.</p>${listHtml(longT, r, "")}</section>` : "";
    return `<div class="cols hub"><div>
      ${carryCard}${longCard}
      ${sendCard()}
      ${conf.length ? `<section class="card"><h2>완료 확인 <span class="c">${conf.length}</span></h2><p class="sub">다른 부서가 처리를 마쳤다고 보고했습니다. 확인하면 완료되어 보관함으로 갑니다.</p>${box(conf, "")}</section>` : ""}
      <section class="card"><h2>${esc(todoTitle)} <span class="c">${P.todoT.length + P.todoD.length}</span></h2><p class="sub">${esc(todoSub)} 긴급 먼저, 오래된 것 먼저.</p>${hoLine}
        ${chips}${stChips}${box(todo, st.filter === "open" ? "지금 처리할 것이 없습니다." : "해당하는 것이 없습니다.")}</section>
    </div><div>
      ${mgr ? mgrTable() : `<section class="card"><h2>보낸 것 <span class="c">${sent.length}</span></h2><p class="sub">다른 부서에서 처리 중입니다. 끝나면 보관함으로 갑니다.</p>${box(sent, "다른 부서로 보낸 진행 중인 것이 없습니다.")}</section>`}
      <p class="sub" style="margin:4px 2px">끝난 업무·불출은 <button type="button" class="lnk" data-tab="rooms">보관함</button>에서 찾습니다.</p>
    </div></div>`;
  }
  function mgrTable() {
    const open = st.tasks.filter(t => Core.isOpen(t));
    const depts = OPS.DEPTS.filter(d => d.id !== "MG");
    const cnt = (d, fn) => open.filter(t => t.toDept === d && fn(t)).length;
    const rows = depts.map(d => `<tr><td>${esc(d.name)}</td>
      <td class="num">${cnt(d.id, t => OPS.GROUP[t.status] === "대기")}</td>
      <td class="num">${cnt(d.id, t => OPS.GROUP[t.status] === "진행")}</td>
      <td class="num">${cnt(d.id, t => t.status === "보류")}</td>
      <td class="num">${cnt(d.id, t => t.priority === "긴급")}</td>
      <td class="num">${cnt(d.id, t => Core.isOverdue(t))}</td></tr>`).join("");
    return `<section class="card"><h2>부서별 미처리</h2><p class="sub">열린 업무를 받는 부서 기준으로 셉니다.</p>
      <div class="scroll"><table><thead><tr><th>부서</th><th class="num">대기</th><th class="num">진행</th><th class="num">보류</th><th class="num">긴급</th><th class="num">기한 초과</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  // 보내기: 종류를 고르면 그 종류에 필요한 칸만 펼친다
  function sendCard() {
    const t = curSend();
    const tabs = `<div class="chips sendt" role="group" aria-label="보낼 종류">${sendTypes().map(x => `<button type="button" data-send="${x.id}" aria-pressed="${x.id === t}">${esc(x.name)}</button>`).join("")}</div>`;
    if (t === "deliv") {
      const M = boardM();
      if (!M || M === DEMO) return `<section class="card send"><h2>보내기</h2>${tabs}<p class="sub">객실이 등록되어야 불출을 보낼 수 있습니다.</p></section>`;
      return `<section class="card send"><h2>보내기</h2>${tabs}${delivForm(M)}</section>`;
    }
    st.formKind = t;
    return `<section class="card send"><h2>보내기</h2>${tabs}${formHtml({ hub: true })}</section>`;
  }
  // ---------- [web] 보관함: 끝난 카드가 종류별로 모이는 곳(보기·찾기 전용) ----------
  // 이슈 보관함이 중심. 같은 객실·같은 분류가 기간 안에 2번 넘게 나오면 "반복 객실"로 올린다.
  const ARCH_KINDS = [["issue", "이슈"], ["request", "고객 요청"], ["repair", "수리"], ["etc", "기타 업무"], ["deliv", "불출(오늘)"]];
  const ARCH_PERIODS = [["7", "7일"], ["30", "30일"], ["90", "90일"], ["all", "전체"]];
  const durTxt = ms => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + "분"; const h = Math.floor(m / 60); if (h < 48) return h + "시간" + (m % 60 ? " " + (m % 60) + "분" : ""); return Math.round(h / 24) + "일"; };
  const roomTxt = t => (bTag(t) ? bTag(t) + " " : "") + (t.room || "위치 없음");
  function archView() {
    const k = st.ak, now = Date.now();
    const since = st.ap === "all" ? 0 : now - (+st.ap) * 864e5;
    const q = String(st.aq || "").replace(/호$/, "").trim();
    const chipRow = (arr, cur, attr) => `<div class="chips">${arr.map(([v, n]) => `<button type="button" ${attr}="${v}" aria-pressed="${cur === v}">${esc(n)}</button>`).join("")}</div>`;
    const head = `<div class="abar">${chipRow(ARCH_KINDS, k, "data-ak")}</div>`;
    if (k === "deliv") return head + archDeliv(q);
    let all = st.tasks.filter(t => hubKind(t) === k && (t.createdAt || 0) >= since);
    const shown0 = all.filter(t => (st.as === "all" || (st.as === "open" ? Core.isOpen(t) : !Core.isOpen(t))) && (!q || String(t.room || "").startsWith(q) || String(t.title || "").includes(q) || String(t.detail || "").includes(q)));
    const shown = shown0.filter(t => !st.ac || t.category === st.ac).sort((a, b) => b.createdAt - a.createdAt);
    const done = all.filter(t => t.status === "완료" && t.doneAt);
    const avg = done.length ? durTxt(done.reduce((a, t) => a + (t.doneAt - t.createdAt), 0) / done.length) : "-";
    // 분류별 숫자(이슈만 분류가 있다)
    const cats = {}; shown0.forEach(t => { const c = t.category || "분류 없음"; cats[c] = (cats[c] || 0) + 1; });
    const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const maxC = Math.max(1, ...catList.map(x => x[1]));
    // 반복 객실: 같은 객실 + 같은 분류(이슈) 또는 같은 객실(그 밖) 2번 이상
    const rep = {}; all.forEach(t => { if (!t.room) return; const key = roomTxt(t) + "|" + (k === "issue" ? t.category || "" : ""); (rep[key] = rep[key] || []).push(t); });
    const reps = Object.entries(rep).filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
    const rows = (st.aMore ? shown : shown.slice(0, 100)).map(t => {
      const open = Core.isOpen(t), took = !open && t.doneAt ? durTxt(t.doneAt - t.createdAt) : open ? durTxt(now - t.createdAt) + " 경과" : "";
      return `<div class="arow ${open ? "open" : ""}" tabindex="0" data-open="${esc(t.id)}">
        <span class="ad">${esc(hm(t.createdAt))}</span><span class="ar">${esc(roomTxt(t))}</span>
        <span class="at">${t.priority === "긴급" ? `<span class="pri 긴급">긴급</span>` : ""}${esc(t.title)}${t.category ? ` <span class="chip k">${esc(t.category)}</span>` : ""}</span>
        <span class="am">${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · <span class="chip ${open ? "go" : t.status === "취소" ? "off" : "ok"}">${esc(t.status)}</span>${took ? ` · ${esc(took)}` : ""}</span></div>`;
    }).join("");
    const kn = (ARCH_KINDS.find(x => x[0] === k) || [])[1] || "";
    return head + `<div class="cols arch"><div>
      <section class="card"><h2>${esc(kn)} 보관함 <span class="c">${shown.length}</span></h2>
        <p class="sub">끝난 것과 진행 중인 것을 함께 모아 봅니다. 처리는 <button type="button" class="lnk" data-tab="work">작업대</button>에서 합니다. 줄을 누르면 그 업무(처리 기록 전체)가 열립니다.</p>
        <div class="abar">${chipRow(ARCH_PERIODS, st.ap, "data-ap")}${chipRow([["all", "전체"], ["open", "진행 중"], ["closed", "끝난 것"]], st.as, "data-as")}
          <input id="aq" type="search" placeholder="호수 또는 내용" value="${esc(st.aq)}" aria-label="호수 또는 내용 찾기"></div>
        ${st.ac ? `<p class="sub">분류: <b>${esc(st.ac)}</b> <button type="button" class="lnk" data-ac="">분류 풀기</button></p>` : ""}
        ${rows ? `<div class="alist">${rows}</div>${!st.aMore && shown.length > 100 ? `<p><button type="button" class="lnk" data-amore="1">${shown.length - 100}건 더 보기</button></p>` : ""}` : `<div class="empty">${q ? "찾는 기록이 없습니다." : "이 기간에 기록이 없습니다."}</div>`}
      </section></div><div>
      <section class="card"><h2>요약</h2><div class="sums" style="margin:0">
        <span class="sum">전체 <b>${all.length}</b></span><span class="sum">진행 중 <b>${all.filter(t => Core.isOpen(t)).length}</b></span><span class="sum">완료 <b>${done.length}</b></span><span class="sum">평균 처리 <b>${esc(avg)}</b></span></div>
        ${k === "issue" && catList.length ? `<h4>분류별</h4><div class="acat">${catList.map(([c, n]) => `<button type="button" class="hb" data-ac="${esc(c === "분류 없음" ? "" : c)}" aria-pressed="${st.ac === c}"><span>${esc(c)}</span><i style="width:${Math.round(n / maxC * 100)}%"></i><b>${n}</b></button>`).join("")}</div>` : ""}
      </section>
      <section class="card"><h2>반복 객실 <span class="c">${reps.length}</span></h2><p class="sub">${k === "issue" ? "같은 객실에서 같은 분류가" : "같은 객실에서"} 이 기간에 2번 이상 나온 곳입니다. 누르면 그 객실만 봅니다.</p>
        ${reps.length ? `<div class="chips">${reps.map(([key, v]) => { const [rm, c] = key.split("|"); return `<button type="button" class="arep" data-aroom="${esc(rm.split(" ").pop())}">${esc(rm)}${c ? " · " + esc(c) : ""} <b>${v.length}회</b></button>`; }).join("")}</div>` : `<div class="w">반복된 객실이 없습니다.</div>`}
      </section></div></div>`;
  }
  // 불출은 오늘 것만 불러온다(기간 보관은 2단계)
  function archDeliv(q) {
    const D = OPS.Desk;
    const list = st.deliv.filter(d => !q || String(d.no || "").startsWith(q) || D.line(d).includes(q)).sort((a, b) => b.at - a.at);
    const sum = { big: 0, small: 0 }; st.deliv.filter(d => !d.cancel).forEach(d => { sum.big += (d.items || {}).big || 0; sum.small += (d.items || {}).small || 0; });
    const rows = list.map(d => { const stt = D.status(d), end = d.done || d.fail || d.cancel;
      return `<div class="arow ${D.isOpen(d) ? "open" : ""}"><span class="ad">${esc(hm(d.at))}</span><span class="ar">${esc((multiB() ? (d.building || "") + " " : "") + d.no)}</span>
        <span class="at">${d.urgent ? `<span class="pri 긴급">긴급</span>` : ""}${esc(D.line(d))}</span>
        <span class="am"><span class="chip ${D_CLS[stt] || ""}">${esc(stt)}</span>${end ? ` · ${esc(durTxt(end.at - d.at))}` : ` · ${esc(durTxt(Date.now() - d.at))} 경과`}${d.fail ? ` · ${esc(d.fail.why)}` : ""}${d.done && d.done.note ? ` · ${esc(d.done.note)}` : ""}</span></div>`; }).join("");
    return `<section class="card"><h2>불출 기록 (오늘) <span class="c">${list.length}</span></h2>
      <p class="sub">오늘 요청 합계: 큰수건 ${sum.big} · 작은수건 ${sum.small}. 처리는 <button type="button" class="lnk" data-tab="work">작업대</button>에서 합니다. 지난 날짜 불출 기록은 다음 단계에서 붙입니다.</p>
      <div class="abar"><input id="aq" type="search" placeholder="호수 또는 품목" value="${esc(st.aq)}" aria-label="호수 또는 품목 찾기"></div>
      ${rows ? `<div class="alist">${rows}</div>` : `<div class="empty">오늘 불출 기록이 없습니다.</div>`}</section>`;
  }
  // ---------- 할 일 ----------
  function filterGroup(t) {
    if (st.filter === "open") return Core.isOpen(t) && t.status !== "보류";
    if (st.filter === "hold") return t.status === "보류";
    if (st.filter === "done") return !Core.isOpen(t) && t.updatedAt > Date.now() - 864e5;
    return true;
  }

  function workView() {
    if (OPS.isMgr(st.role)) return managerView();
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
      <section class="card"><h2>열린 업무 전체 <span class="c">${open.length}</span></h2>${listHtml(open, st.role, "열린 업무가 없습니다.")}</section>
    </div><div>${formHtml()}</div></div>`;
  }

  function formHtml(o) {
    o = o || {};
    const kind = st.formKind;
    const to = st.formTo || OPS.defaultTo(kind);
    const kindSel = `<label class="f" ${o.hub ? "hidden" : ""}>종류<select id="fKind">${OPS.KINDS.filter(k => k.id !== "check").map(k => `<option value="${k.id}" ${k.id === kind ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></label>`;
    const toSel = `<label class="f">${o.hub ? "받을 부서" : "보낼 부서"}<select id="fTo">${OPS.DEPTS.map(d => `<option value="${d.id}" ${d.id === to ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>`;
    const roomIn = `<label class="f">객실·위치<span class="pair">${multiB() ? `<select id="fBld" aria-label="동"><option value="">동</option>${st.master.buildings.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("")}</select>` : ""}<input id="fRoom" placeholder="예: 1203, 로비" maxlength="20" list="roomList"></span></label>`;
    const catSel = `<label class="f" ${kind === "issue" ? "" : "hidden"}>분류<select id="fCat"><option value="">선택 안 함</option>${OPS.CATEGORIES.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>`;
    const title = `<label class="f">${o.hub ? "내용" : "제목"}<input id="fTitle" required maxlength="120" placeholder="예: 샤워기 누수, 에어컨 안 됨"></label>`;
    const pri = `<div class="seg" id="fPri" role="group" aria-label="우선순위">${OPS.PRIORITY.map(p => `<button type="button" class="${p}" data-pri="${p}" aria-pressed="${p === st.formPri}">${p}</button>`).join("")}</div>`;
    const detail = `<details><summary class="sub" style="cursor:pointer;margin:0">상세 내용</summary><label class="f" style="margin-top:8px">내용<textarea id="fDetail" maxlength="2000" placeholder="카드번호·객실 비밀번호는 자동으로 가려집니다."></textarea></label></details>`;
    // [web] 작업대 보내기: 객실 → 내용(→ 추천) → 우선순위 → 받을 부서·분류 순서. 기존 업무 등록 칸은 예전 순서 그대로
    const body = o.hub
      ? `<div class="row2">${roomIn}${toSel}</div>${title}<div class="sendhint" id="sendHint" aria-live="polite"></div>${pri}<div class="row2">${catSel}${kindSel}</div>${detail}`
      : `<div class="row2">${kindSel}${toSel}</div><div class="row2">${roomIn}${catSel}</div>${title}${pri}${detail}`;
    return `${o.hub ? "" : `<section class="card"><h2>업무 등록</h2>`}<p class="sub">${o.hub ? "객실과 내용만 적고 보내도 됩니다. 받을 부서는 종류에 따라 자동으로 정해집니다." : "제목만 적고 등록해도 됩니다. 나머지는 종류에 따라 자동으로 채워집니다."}</p>
    <form class="new" id="newForm" autocomplete="off">
      ${body}
      <button class="btn main" type="submit">${o.hub ? "보내기" : "등록"}</button>
      <div class="msg ${st.fErr ? "err" : ""}" id="fMsg" aria-live="polite">${esc(st.fMsg || "")}</div>
      <datalist id="roomList">${roomOptions()}</datalist>
    </form>${o.hub ? "" : "</section>"}`;
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
    const sum = M && d ? OPS.STAY.filter(k => total[k]).map(k => `<span class="sum ${STAY_CLS[k]}">${esc(stayName(k))} <b>${total[k]}</b></span>`).join("") : "";
    const card = id => {
      const r = M.rooms[id], s = roomState(id, st.rdate), ts = Core.sort(byRoom.get(id) || []);
      const hot = ts.some(t => t.priority === "긴급");
      return `<div class="isu-c ${hot ? "hot" : ""}">
        <div class="isu-h"><span class="isu-n">${multiB() ? `<small>${esc(r.building)}</small>` : ""}${esc(r.no)}</span><span class="isu-t">${esc(r.type || "")}${r.dong ? " · " + esc(r.dong) + "동" : ""}</span></div>
        <div class="isu-s">${s && s.stay ? `<span class="chip ${STAY_CLS[s.stay] || ""}">${esc(stayName(s.stay))}</span>` : `<span class="chip">상태 없음</span>`}${s && s.clean ? `<span class="chip k">${esc(kindName(s.clean))}${s.cleanFromSheet ? "" : " 예상"}</span>` : ""}${s && s.flags && s.flags.length ? `<span class="chip warn" title="${esc(s.flags.join(" / "))}">확인 ${s.flags.length}</span>` : ""}</div>
        ${ts.length ? `<ul class="rtasks">${ts.slice(0, 3).map(t => `<li><a href="#${esc(st.role.toLowerCase())}" data-open="${esc(t.id)}"><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</a><span class="w">${esc(OPS.deptName(t.toDept))} · ${esc(t.status)}${Core.isOverdue(t) ? " · 기한 초과" : ""}</span></li>`).join("")}${ts.length > 3 ? `<li class="w">외 ${ts.length - 3}건</li>` : ""}</ul>` : `<div class="w">열린 업무 없음</div>`}
      </div>`;
    };
    const looseCard = ([k, ts]) => `<div class="isu-c loose ${ts.some(t => t.priority === "긴급") ? "hot" : ""}"><div class="isu-h"><span class="isu-n sm">${esc(k)}</span><span class="isu-t">${M ? "공용 구역·객실 미확인" : ""}</span></div><ul class="rtasks">${Core.sort(ts).map(t => `<li><a href="#${esc(st.role.toLowerCase())}" data-open="${esc(t.id)}"><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</a><span class="w">${esc(OPS.deptName(t.toDept))} · ${esc(t.status)}</span></li>`).join("")}</ul></div>`;
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
          const doc = Object.assign({}, prev, { date: T, rooms: OPS.Rooms.dayFrom(resv.stays, T, lm, bm, cleanHistory(cl, bm)), src: Object.assign({}, prev.src || {}, { reservation: { file: resv.fileName, at: now } }) });
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
  const canDrop = () => st.role === "FO" || OPS.isMgr(st.role);
  const XL = /\.(xlsx|xlsm)$/i;
  let dragDepth = 0;
  const hasFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files"));
  function dropShow(on) {
    const d = $("dropzone"); if (!d) return;
    if (st.locked) on = false;
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
    if (st.locked) return;
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
  const STAY_SHORT = { "퇴실": "퇴실", "퇴실·입실": "퇴·입", "입실": "입실", "연박": "재실", "공실": "공실" };
  // [web] 단어 통일(화면 표기만, 저장 값은 그대로): 연박 → 재실, 재실청소 → 일반 청소, 전체재실 → 전체 청소, 객실청소 → 퇴실 청소
  const STAY_NAME = { "연박": "재실" };
  const stayName = v => STAY_NAME[v] || v || "";
  const KIND_NAME = { "재실청소": "일반 청소", "전체재실": "전체 청소", "객실청소": "퇴실 청소" };
  const kindName = v => KIND_NAME[v] || v || "";
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

  const SV_SHORT = { "입실 가능": "입실 가능", "점검 대기": "점검 대기", "청소 중": "청소 중", "퇴실 완료·청소 대기": "청소 대기", "손님 아직 있음": "손님 아직 있음", "연장·청소 없음": "연장", "퇴실 전": "", "발송 전": "", "회신 대기": "", "요청 없음": "", "시간 확정": "재실 청소", "쓰레기·수건만": "요청만", "청소 없음": "청소 X", "무응답·청소 없음": "무응답", "완료": "청소 완료" };
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
    if (st.role === "FO" && !demo) svcRows().forEach(x => { if (foSvcNeed(x)) needIds.add(x.id); });   // [web] 입실 가능·키핑 퇴실 확인 미확인
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
      // [web] 청소 단계는 아래 띠(색+기호+글자)로, 글자 줄은 숙박 상태와 재실 요청 시간만
      const cs = x ? cleanStage(x) : null, win = x && x.type === "stay" && x.s && x.s.reply && x.s.reply.window && !x.s.done ? x.s.reply.window : "";
      const ckind = x && x.type === "stay" && !(x.s && x.s.done) ? kindName(x.kind) : "";   // [web] 재실 → 일반 청소 / 전체 청소
      const stTxt = [s && s.stay ? (STAY_SHORT[s.stay] || s.stay) : "", ckind, win].filter(Boolean).join(" · ");
      const nsr = nsOf(id);
      const cls = ["rt", s && s.stay ? "st-" + (STAY_CLS[s.stay] || "") : "", hot ? "hot" : "", need ? "need" : "", x && x.s && x.s.done && x.type === "out" ? "ready" : "", cs ? "hasc" : "", nsr ? "ns" : ""].join(" ");
      const badges = ["FO", "HK", "FM"].filter(k => dc[k]).map(k => `<span class="dct dc-${k}" title="${esc((OPS.DEPTS.find(d => d.id === k) || {}).name || k)} 업무 ${dc[k]}건">${icon(k, 14)}${dc[k]}</span>`).join("")
        + (dBy.get(id) ? `<span class="dct dv">불출 ${dBy.get(id)}</span>` : "") + (hasNote(id) ? `<span class="dct nt">비고</span>` : "");
      return `<button type="button" class="${cls}" data-room="${esc(id)}" aria-label="${esc(r.building)} ${esc(r.no)}호${stTxt ? ", " + esc(stTxt) : ""}${hot ? ", 긴급" : ""}${need ? ", 확인 필요" : ""}${ts.length ? ", 열린 업무 " + ts.length + "건" : ""}${cs ? ", 청소 " + esc(cs.t) : ""}">
        <span class="rtop"><span class="tn">${esc(r.no)}</span>${hot ? `<span class="tf hot">긴급</span>` : need ? `<span class="tf need">미확인</span>` : nsr ? `<span class="tf nsr">${esc(nsr)}</span>` : ""}</span>
        <span class="ts">${esc(stTxt)}</span>
        ${badges ? `<span class="tds">${badges}</span>` : ""}
        ${csBand(cs)}
      </button>`;
    };
    const sections = blds.map(b => {
      let rooms = Object.values(M.rooms).filter(r => r.b === b.id);
      if (q) rooms = rooms.filter(r => r.no.startsWith(q));
      if (st.bNeed) rooms = rooms.filter(r => needIds.has(OPS.Rooms.roomId(r.b, r.no)) || by.has(OPS.Rooms.roomId(r.b, r.no)));
      if (fset) rooms = rooms.filter(r => fset.has(OPS.Rooms.roomId(r.b, r.no)));
      if (!rooms.length) return "";
      // [web] 판매 객실은 층별로, 비판매(창고·판매불가·기숙사·타 운영사)는 맨 아래 따로
      const nsRooms = rooms.filter(r => nsOf(OPS.Rooms.roomId(r.b, r.no))).sort((a, c) => +a.no - +c.no);
      const saleRooms = rooms.filter(r => !nsOf(OPS.Rooms.roomId(r.b, r.no)));
      const floors = {};
      saleRooms.forEach(r => { (floors[floorOf(r.no)] = floors[floorOf(r.no)] || []).push(r); });
      const fl = Object.keys(floors).sort((a, c) => +c - +a);
      return `<section class="card bsec">${multiB() ? `<h2>${esc(b.name)} <span class="c">판매 ${saleRooms.length}실</span>${nsRooms.length ? ` <span class="c nsc">비판매 ${nsRooms.length}</span>` : ""}</h2>` : ""}
        ${fl.map(f => `<div class="floor"><span class="fl">${esc(f)}F</span><div class="tiles">${floors[f].sort((a, c) => +a.no - +c.no).map(tile).join("")}</div></div>`).join("")}
        ${nsRooms.length ? `<div class="floor nsfloor"><span class="fl">비판매</span><div class="tiles">${nsRooms.map(tile).join("")}</div></div>` : ""}
      </section>`;
    }).join("");
    return `<section class="card">
      <div class="rbar" style="margin-bottom:6px">
        <h2 style="margin:0">현황판</h2>
        <div class="seg2" role="group" aria-label="보기 방식"><button type="button" data-bmode="grid" aria-pressed="${mode === "grid"}">블록</button><button type="button" data-bmode="plan" aria-pressed="${mode === "plan"}">층 배치도</button><button type="button" data-bmode="stack" aria-pressed="${mode === "stack"}">건물 배치도</button></div>
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
      <details class="lgd" ${st.lgOpen ? "open" : ""}><summary>표시 설명 · 객실을 누르면 퇴실·청소 단계를 바로 바꿀 수 있습니다</summary><div class="legend2"><span><span class="tf hot">긴급</span> 긴급 업무</span><span><span class="tf need">미확인</span> ${esc(OPS.deptName(st.role))} 화면에서 아직 안 본 것</span><span><span class="dct dc-FO">${icon("FO", 14)}1</span><span class="dct dc-HK">${icon("HK", 14)}1</span><span class="dct dc-FM">${icon("FM", 14)}1</span> 부서별 열린 업무(프론트·키핑·시설)</span><span><span class="dct dv">불출 1</span> 진행 중 불출</span></div><div class="legend2 lgcs"><b>칸 아래 띠 = 청소 단계</b>${Object.keys(CS).map(k => `<span class="lgc cs-${k}"><b>${CS[k][0]}</b>${esc(CS[k][1])}</span>`).join("")}<span>숙박 상태(퇴실·입실·연박·공실)는 호수 아래 글자</span>${canStage() ? `<span>${st.role === "HK" ? "키핑" : "관리자"}: 칸을 우클릭(휴대폰은 길게 누르기)하면 청소 단계를 바로 바꿀 수 있습니다</span>` : ""}</div></details>
    </section>
    ${mode === "plan" ? planView(M, by, needIds, hotIds, q) : mode === "stack" ? stackView(M, by, needIds, hotIds, q) : sections || `<div class="empty">해당하는 객실이 없습니다.</div>`}`;
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
      "rd-ready": "당일 입실 · 입실 가능", "rd-clean": "당일 입실 · 청소 중·점검 대기", "rd-wait": "당일 입실 · 퇴실 완료, 청소 대기", "rd-pre": "당일 입실 · 아직 퇴실 전" };
    return { sets, label, hasDay, rows, rc, arr: OPS.Dash.arrivals(Object.keys(M.rooms).filter(inRb), id => roomState(id, st.rdate)), fresh: OPS.Dash.freshness(day, st.rdate, now) };
  }
  // 부서마다 그 부서가 행동할 숫자만. tone: 0이 아니면 그 색으로(글자로도 말한다)
  const KPI_BY_ROLE = {
    FO: [["reply", "hot"], ["need", "acc"], ["hot", "hot"], ["late", "warn"], ["pre"], ["ing"], ["ready", "ok"]],
    MG: [["need", "acc"], ["hot", "hot"], ["late", "warn"], ["reply", "hot"], ["pre"], ["ing"], ["ready", "ok"]],
    MN: [["need", "acc"], ["hot", "hot"], ["late", "warn"], ["reply", "hot"], ["pre"], ["ing"], ["ready", "ok"]],
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
  const RD = [["ready", "입실 가능"], ["clean", "청소 중·점검 대기"], ["wait", "퇴실 완료·청소 대기"], ["pre", "아직 퇴실 전"]];
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
    by.forEach((ts, id) => { if (ts.some(t => Core.needsAck(t, st.role))) needIds.add(id); if (ts.some(t => t.priority === "긴급")) hotIds.add(id); });
    const K = demo ? null : kpiSets(M, by, needIds, hotIds);
    const go = (tab, extra) => `data-gotab="${tab}"${extra || ""}`;
    const kpi = (n, label, tone, attrs, title) => `<button type="button" class="kpi big ${n && tone ? "t-" + tone : ""}" ${attrs} title="${esc(title)}"><b>${n}</b><span>${esc(label)}</span></button>`;
    const taskKpis = `<div class="kpis big" role="group" aria-label="업무 숫자">
      ${kpi(T.hot, "긴급", "hot", go("work"), "긴급 열린 업무(보류 제외). 누르면 작업대")}
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
      ${K && K.hasDay ? line(countIn(K.sets.reply), "프론트가 답할 것", "키핑 \"손님 아직 있음\" 알림 · 불출 \"못 함\"", go("board", ` data-bfset="reply"`), "hot") : ""}
      ${K && K.hasDay ? line(hkAck, "키핑 미확인", "새 퇴실 완료·재실 요청·우선 준비", go("svc"), "acc") : ""}
      ${K && K.hasDay ? line(stayWait, "재실 요청 미입력", "시간·청소 종류를 아직 안 적은 재실 객실(안 적으면 정비 안 함)", go("svc"), "") : ""}
      ${line(dOpen.length, "불출 진행 중", dSlow ? `30분 넘은 요청 ${dSlow}건` : "", go("work"), dSlow ? "warn" : "")}
      ${line(dFail, "불출 못 함(오늘)", "프론트가 고객에게 다시 안내", go("work"), "hot")}
      ${line(lostKeep, "분실물 보관 중", "", go("desk"), "")}
    </div>${K && !K.hasDay ? `<p class="sub" style="margin:10px 0 0">${esc(st.rdate.slice(5).replace("-", "/"))} 예약표가 없어 청소·재실 숫자는 뺐습니다.</p>` : ""}</section>`;
    const readyHtml = K && K.hasDay && (K.rc.total || K.arr.inn) ? `<section class="card rdy"><h2>입실 준비 <span class="sub" style="margin:0;font-weight:500">${esc(st.rdate.slice(5).replace("-", "/"))}${st.rdate === today ? " 오늘" : " 예정"}</span></h2>${readyBar(K.rc, K.arr, K.fresh, { go: true })}</section>` : "";
    // 부서별 열린 업무
    const depts = OPS.DEPTS.filter(d => d.id !== "MG"), max = Math.max(1, ...depts.map(d => L[d.id].open));
    const deptCard = `<section class="card"><h2>부서별 열린 업무</h2><p class="sub">받은 부서 기준. 막대 = 열린 업무 수.</p><div class="hbars">
      ${depts.map(d => { const o = L[d.id]; return `<button type="button" class="hb" ${go("work")} aria-label="${esc(d.name)} 열린 업무 ${o.open}건, 대기 ${o.wait}, 진행 ${o.doing}, 확인 대기 ${o.confirm}, 보류 ${o.hold}">
        <span class="hbl"><span class="dc dc-${d.id}">${icon(d.id, 16)}</span>${esc(d.name)}</span>
        <span class="hbt"><span class="hbf" style="width:${o.open ? Math.max(3, o.open / max * 100) : 0}%"></span><b>${o.open}</b></span>
        <span class="hbs">대기 ${o.wait} · 진행 ${o.doing} · 확인 대기 ${o.confirm} · 보류 ${o.hold}${o.hot ? ` · <span class="warnt">긴급 ${o.hot}</span>` : ""}${o.late ? ` · <span class="warnt">기한 초과 ${o.late}</span>` : ""}</span></button>`; }).join("")}
    </div></section>`;
    const old = D.oldest(st.tasks, 5);
    const oldCard = `<section class="card"><h2>오래 열린 업무</h2><p class="sub">보류 제외, 등록이 오래된 순. 누르면 업무를 엽니다.</p>${old.length ? `<div class="olist">${old.map(t => `<button type="button" class="ol" data-open="${esc(t.id)}"><span class="oa">${esc(D.dur(Math.round((now - t.createdAt) / 60000)))}</span><span class="ot"><span><span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${t.room ? esc((bTag(t) ? bTag(t) + " " : "") + t.room) + " · " : ""}${esc(t.title)}</span><small>${esc(OPS.deptName(t.toDept))} · ${esc(t.status)}</small></span></button>`).join("")}</div>` : `<div class="empty">열린 업무가 없습니다.</div>`}</section>`;
    // 응답 시간·반복
    const R = D.response(st.tasks, now, 7, 5);
    const respCard = `<section class="card"><h2>응답 시간 <span class="sub" style="margin:0;font-weight:500">최근 7일</span></h2><p class="sub">다른 부서가 보낸 업무가 등록부터 "시작"을 누를 때까지 걸린 시간의 가운데 값. 버튼을 누른 시각 기준이라 실제보다 늦게 잡힐 수 있습니다. 5건 미만이면 표시하지 않습니다.</p>
      <div class="resp">${depts.map(d => `<div class="rp"><span class="dc dc-${d.id}">${icon(d.id, 16)}</span><span class="rpn">${R[d.id].median == null ? `<span class="sub" style="margin:0">표본 ${R[d.id].n}건</span>` : `<b>${esc(D.dur(R[d.id].median))}</b><small>${R[d.id].n}건</small>`}</span></div>`).join("")}</div></section>`;
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

  // [web] 과거 청소표 이력: { 날짜: { main|annex: { 호수: 청소 종류 } } }. 전체 청소 날짜의 기준점이 된다(처음엔 지난 청소표를 올려서 맞춘다)
  function cleanHistory(cl, bm) {
    const h = {}, src = b => (bm.main === b ? "main" : bm.annex === b ? "annex" : b);
    const put = (date, kinds) => Object.entries(kinds || {}).forEach(([id, k]) => { const i = id.indexOf("-"); if (i < 0 || !date) return; const sk = src(id.slice(0, i)); ((h[date] = h[date] || {})[sk] = h[date][sk] || {})[id.slice(i + 1)] = k; });
    Object.values(st.days || {}).forEach(d => { if (d && d.cleanSheet) put(d.date || d.id, d.cleanSheet); });
    (cl || []).forEach(c => put(c.date, c.kinds));
    return h;
  }
  // [web] 예약표가 오래되면 경고(연장·조기 퇴실·객실 이동이 빠질 수 있다)
  function staleLine() {
    const M = st.master, at = M && M.src && M.src.reservation && M.src.reservation.at;
    if (!at) return "";
    const h = Math.floor((Date.now() - at) / 3600e3);
    return h >= 6 ? `<p class="stale">예약표가 ${h}시간 전 것입니다(${esc(hm(at))}). 연장·조기 퇴실·객실 이동이 빠졌을 수 있으니 최신 예약표를 다시 올려 주십시오(권장: 10시·14시).</p>` : "";
  }
  // 객실 목록은 그대로 두고, 그날 상태(퇴실·입실·연박)만 예약표·청소표로 덧입힌다
  function dayNote() {
    const d = dayDoc(st.rdate);
    if (d && (d.rooms || d.cleanSheet)) {
      const src = d.src || {};
      return staleLine() + `<p class="sub" style="margin:0 0 6px">${esc(st.rdate.slice(5).replace("-", "/"))} 상태: ${[src.reservation ? "예약표 " + hm(src.reservation.at) : "", src.clean ? "청소표 " + hm(src.clean.at) : "", manualOn(st.rdate) ? "직접 추가 예약" : ""].filter(Boolean).map(esc).join(" · ")} 반영</p>`;
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
      if (st.tab === "svc" || st.tab === "board" || st.tab === "dash" || st.openRoomId) soon();
    }, e => flash("청소 기록 동기화 오류: " + (e && e.message || e)));
  }
  const svcRows = () => { const M = boardM(); return M === DEMO || !(dayDoc(st.rdate) || manualOn(st.rdate)) ? [] : OPS.Svc.rows(M, id => roomState(id, st.rdate), st.svc); };
  const SVC_CLS = { "입실 가능": "ok", "점검 대기": "go", "청소 중": "go", "손님 아직 있음": "warn", "연장·청소 없음": "off", "완료": "ok", "시간 확정": "go", "쓰레기·수건만": "go", "퇴실 완료·청소 대기": "go", "회신 대기": "wait", "발송 전": "wait", "요청 없음": "wait", "퇴실 전": "wait", "청소 없음": "off", "무응답·청소 없음": "off" };
  const rLabel = r => { const ns = nsOf(OPS.Rooms.roomId(r.b, r.no)); return (multiB() ? (r.building || "") + " " : "") + r.no + (ns ? " · " + ns : ""); };   // [web] 비판매 객실은 이유를 붙인다
  // [web] 재실 청소 종류: 전체재실(체크인 기준 3박째마다·마지막 전체재실 기준, 빠지면 이월) / 재실청소(그 사이 날 간단 정비)
  const forceChip = x => (x && x.force ? `<span class="kd force" title="장기 투숙 점검: 요청이 없어도 전체 청소">${esc(String(x.day))}일 점검</span>` : "") + (x && x.s && x.s.kindSet ? `<span class="kd lite" title="${esc(whoLine(x.s.kindSet))}">직접 지정</span>` : "");
  const kindChip = k => k === "전체재실" ? `<span class="kd full" title="침구·욕실·바닥까지 전체">전체 청소</span>` : k === "재실청소" ? `<span class="kd lite" title="쓰레기·수건·정리">일반 청소</span>` : esc(kindName(k));

  const tAt = o => (o && o.at ? hm(o.at).split(" ")[1] : "");
  // [web] 청소·재실 요약 숫자. 아래 단락(foView·hkView)과 같은 기준으로 센다
  function svcCounts(list) {
    const S = OPS.Svc, st0 = list.filter(x => x.type === "stay"), ot = list.filter(x => x.type === "out");
    return {
      stay: st0.length,
      sNo: st0.filter(x => !x.s.reply && !x.s.done).length,
      sReq: st0.filter(x => !x.s.done && S.stayWork(x.s)).length,
      sX: st0.filter(x => !x.s.done && x.s.reply && !S.stayWork(x.s)).length,
      sDone: st0.filter(x => x.s.done).length,
      sForce: st0.filter(x => S.forceDue && S.forceDue(x)).length,   // 장기 투숙 점검(요청이 없어도 전체 청소)
      out: ot.length,
      oPre: ot.filter(x => !x.s.co && !x.s.ext && !x.s.done).length,
      oIng: ot.filter(x => x.s.co && !x.s.done && !x.s.ext).length,
      oRdy: ot.filter(x => x.s.done && !x.s.ext).length,
      oExt: ot.filter(x => x.s.ext).length
    };
  }
  // [web] 요약 숫자 → 이동할 단락. 프론트·시설(foView)과 키핑(hkView)의 단락 이름이 다르다
  const SV_GO = {
    fo: { stay: "#sv-stay", sNo: "fo-s-no", sReq: "fo-s-req", sX: "fo-s-req", sDone: "fo-s-done", out: "#sv-out", oPre: "fo-o-pre", oIng: "fo-o-ing", oRdy: "fo-o-rdy", oExt: "fo-o-ext" },
    hk: { stay: "#sv-stay", sNo: "hk-s-off", sReq: "hk-s-todo", sX: "hk-s-off", sDone: "hk-s-done", out: "#sv-out", oPre: "hk-o-pre", oIng: "hk-o-todo", oRdy: "hk-o-done", oExt: "hk-o-ext" }
  };
  function jumpTo(el, block) {
    if (!el) return false;
    const d = el.closest("details.secd"); if (d && !d.open) d.open = true;
    el.scrollIntoView({ block: block || "start", behavior: "smooth" });
    el.classList.remove("jump"); void el.offsetWidth; el.classList.add("jump");
    setTimeout(() => el.classList.remove("jump"), 1600);
    return true;
  }
  function svGo(k) {
    if (k === "ack") { jumpTo(document.querySelector("#view .srow.pend")); return; }
    const t = SV_GO[st.role === "HK" ? "hk" : "fo"][k]; if (!t) return;
    if (t[0] === "#") { jumpTo(document.querySelector(t)); return; }
    const d = document.querySelector(`details.secd[data-sec="${CSS.escape(t)}"]`);
    if (!d) { flash("해당하는 객실이 없습니다."); return; }
    if (!d.open) { d.open = true; mem.set("sec:" + t, "1"); }
    jumpTo(d);
  }

  function svcView() {
    const M = boardM();
    if (M === DEMO && st.store !== "db") return connCard("청소·재실");
    if (M === DEMO) return `<section class="card later-box"><h2>청소·재실</h2><p class="sub">객실이 등록되어야 씁니다. 관리자 역할의 설정 탭에서 객실을 등록하거나 예약표·청소표를 올려 주십시오.</p></section>`;
    const today = OPS.ymd(Date.now());
    const dates = weekChips();
    const d = dayDoc(st.rdate) || (manualOn(st.rdate) ? {} : null);
    let list = svcRows();
    // [web] 본관·신관을 한 목록에 섞지 않는다. 기본은 본관(첫 동)
    if (multiB()) { if (!st.svcB || !M.buildings.some(b => b.id === st.svcB)) st.svcB = M.buildings[0].id; list = list.filter(x => x.r.b === st.svcB); }
    const sm = OPS.Svc.summary(list);
    // [web] 요약: 재실 줄 · 퇴실 줄로 나누고, 숫자를 누르면 아래 그 단락으로 바로 간다(접혀 있으면 펼침)
    const sv = svcCounts(list);
    const go = (k, label, n, cls) => `<button type="button" class="svn ${cls || ""}" data-svgo="${k}" ${n ? "" : "disabled"}>${esc(label)} <b>${n}</b></button>`;
    const head = `<section class="card"><div class="rbar" style="margin-bottom:6px"><h2 style="margin:0">청소·재실</h2>
        <div class="chips dates">${dates.map(x => `<button type="button" data-rdate="${esc(x)}" aria-pressed="${x === st.rdate}">${esc(x.slice(5).replace("-", "/"))}${x === today ? " 오늘" : ""}</button>`).join("")}</div>
        ${multiB() ? `<div class="chips bldc">${M.buildings.map(b => { const n = svcRows().filter(x => x.r.b === b.id).length; return `<button type="button" data-svcb="${esc(b.id)}" aria-pressed="${b.id === st.svcB}">${esc(b.name)}${n ? ` <b>${n}</b>` : ""}</button>`; }).join("")}</div>` : ""}</div>
      ${d ? `<div class="svsum">
        <div class="svl"><button type="button" class="svh stay" data-svgo="stay">재실 <b>${sv.stay}</b></button><div class="svi">${go("sNo", "요청 없음", sv.sNo, "nreq")}${go("sReq", "청소 요청", sv.sReq, "stay")}${go("sX", "청소 X", sv.sX)}${go("sDone", "완료", sv.sDone, "in")}${sv.sForce ? go("stay", (+OPS.CTX.forceDays || 7) + "일 점검", sv.sForce, "force") : ""}</div></div>
        <div class="svl"><button type="button" class="svh out" data-svgo="out">퇴실 <b>${sv.out}</b></button><div class="svi">${go("oPre", "퇴실 전", sv.oPre)}${go("oIng", "퇴실 완료·청소 중", sv.oIng, "out")}${go("oRdy", "입실 가능", sv.oRdy, "in")}${sv.oExt ? go("oExt", "연장", sv.oExt) : ""}</div></div>
        ${sm.ack ? `<button type="button" class="needbtn svack" data-svgo="ack">키핑 미확인 <b>${sm.ack}</b> 보기</button>` : ""}
      </div>` : ""}
      ${d ? houseLine(multiB() ? st.svcB : null) : ""}${staleLine()}
      <details class="svhelp"><summary>처리 순서·청소 종류 설명</summary><p class="sub" style="margin:6px 0 0"><span class="kd full">전체 청소</span> 체크인 후 ${(+OPS.CTX.stayCycle || 3) - 1}박 지난 날부터 ${+OPS.CTX.stayCycle || 3}일마다(지난 청소표의 마지막 전체 청소 날 기준, 못 하면 다음 날로 이월) · <span class="kd force">${+OPS.CTX.forceDays || 7}일 점검</span> 요청이 없어도 ${+OPS.CTX.forceDays || 7}일째마다 전체 청소 · <span class="kd lite">일반 청소</span> 그 사이 날 쓰레기·수건·정리. 청소표를 올리면 청소표 값이 우선입니다.</p>
        <ul class="sub svsteps"><li><b>재실</b> 요청 시간대(시작~끝)·청소 종류 입력 → 키핑 확인 → 완료. 요청이 없으면 청소하지 않습니다.</li><li><b>퇴실</b> 퇴실 완료 → 키핑 확인 → 완료. 비밀번호를 제공한 객실은 퇴실 완료 때 비번 변경 업무가 생깁니다.</li></ul></details>
    </section>`;
    const tools = (st.role === "FO" || OPS.isMgr(st.role)) ? frontTools(M) : "";
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
  function delivRow(d) {
    const D = OPS.Desk, role = st.role, fo = role === "FO" || OPS.isMgr(role), hk = role === "HK" || OPS.isMgr(role);
    const lbl = x => (multiB() ? (x.building || "") + " " : "") + x.no;
      const stt = D.status(d), age = mins(d.at), slow = D.isOpen(d) && age >= 30;
      return `<div class="srow ${D.isOpen(d) && hk && !d.go ? "pend" : ""}">
        <div class="sh"><b class="sn">${esc(lbl(d))}</b>${D.isOpen(d) ? carryChip(d.at) : ""}<span class="chip ${D_CLS[stt] || ""}">${esc(stt)}</span>${d.urgent ? `<span class="chip warn">긴급</span>` : ""}${d.due ? `<span class="chip k">${esc(d.due)}까지</span>` : ""}<span>${esc(D.line(d))}</span></div>
        <div class="sx">${esc(D.methodName(d.method))}${d.guestIn ? " · 손님 객실 안" : ""}${hk ? ` <span class="w" style="display:inline">/ ${esc(D.line(d, true))} · ${esc(D.methodName(d.method, true))}${d.guestIn ? " · guest in room" : ""}</span>` : ""}</div>
        <div class="sa"><span class="w ${slow ? "warnt" : ""}">요청 ${esc(whoLine(d, { short: true }))} (${age < 60 ? age + "분" : durTxt(age * 60000)} 전)${d.go ? ` · 출발 ${esc(whoLine(d.go, { short: true }))}` : ""}${d.done ? ` · 완료 ${esc(whoLine(d.done, { short: true }))}${d.done.note ? " (" + esc(d.done.note) + ")" : ""}` : ""}${d.fail ? ` · 불가(${esc(whoLine(d.fail, { short: true }))}): ${esc(d.fail.why)}` : ""}</span>
          ${D.isOpen(d) && hk ? `${d.go ? "" : `<button type="button" class="btn sm" data-desk="go" data-id="${esc(d.id)}">가는 중</button>`}<button type="button" class="btn sm main" data-desk="done" data-id="${esc(d.id)}">완료</button><button type="button" class="btn sm" data-desk="part" data-id="${esc(d.id)}">일부만</button><button type="button" class="btn sm" data-desk="fail" data-id="${esc(d.id)}">못 함</button>` : ""}
          ${D.isOpen(d) && fo ? `<button type="button" class="lnk" data-desk="cancel" data-id="${esc(d.id)}">취소</button>` : ""}
          ${!D.isOpen(d) && !d.cancel && fo ? `<button type="button" class="lnk" data-desk="reopen" data-id="${esc(d.id)}">다시 요청</button>` : ""}</div>
        ${st.dNote === d.id ? `<div class="sedit"><input id="dn-${esc(d.id)}" maxlength="80" placeholder="${st.dNoteKind === "fail" ? "이유 예: 큰수건 재고 없음 / no large towel" : "한 것 예: 큰수건 대신 작은수건 4"}"><div class="acts" style="margin:0"><button type="button" class="btn sm main" data-desk="${st.dNoteKind === "fail" ? "failok" : "partok"}" data-id="${esc(d.id)}">저장</button><button type="button" class="btn sm" data-desk="noteclose" data-id="${esc(d.id)}">닫기</button></div></div>` : ""}
      </div>`;
    }
  // [web] 불출 칸(작업대 보내기 안). 품목·수량·방법은 한/영으로 키핑 화면에 뜬다
  function delivForm(M) {
    const D = OPS.Desk;
    const num = (id, label, en) => `<label class="qcell" title="${esc(en)}"><span>${esc(label)}</span><input type="number" id="${id}" min="0" max="99" value="" placeholder="0" inputmode="numeric"></label>`;
    return `<p class="sub">객실 → 품목·수량 → 방법. 키핑 화면에 한/영으로 뜨고, 키핑이 완료를 누르면 보관함으로 갑니다.</p>
      <form id="dForm" class="new" data-keep autocomplete="off">
        <div class="row2">${roomPick("dq", M, st.sendRoom || null)}</div>
        <div class="qgrid">${D.ITEMS.map(i => num("di-" + i.id, i.ko, i.en)).join("")}</div>
        <div class="acts" style="flex-wrap:wrap;gap:6px 14px">${D.TASKS.map(t => `<label class="tg"><input type="checkbox" id="dt-${t.id}"> ${esc(t.ko)}</label>`).join("")}</div>
        <div class="row2"><label class="f">방법<select id="dMethod">${D.METHODS.map(m => `<option value="${m.id}">${esc(m.ko)}</option>`).join("")}</select></label>
          <label class="f">기한(선택)<input type="time" id="dDue" step="600"></label></div>
        <label class="f">기타(선택)<input id="dOther" maxlength="80" placeholder="예: 퀸 이불 시트 1"></label>
        <div class="acts" style="flex-wrap:wrap;gap:6px 14px"><label class="tg"><input type="checkbox" id="dIn"> 손님 객실 안</label><label class="tg"><input type="checkbox" id="dUrg"> 긴급</label></div>
        <button class="btn main" type="submit">${st.dForce ? "그래도 보내기" : "불출 보내기"}</button>
        <div class="msg ${st.dForce ? "err" : ""}" id="dMsg" aria-live="polite">${esc(st.dMsg)}</div></form>`;
  }
  function deskView() {
    const M = boardM();
    if (M === DEMO && st.store !== "db") return connCard("불출·분실물");
    if (M === DEMO) return `<section class="card later-box"><h2>불출·분실물</h2><p class="sub">객실이 등록되어야 씁니다. 관리자 설정에서 객실을 등록하거나 예약표를 올려 주십시오.</p></section>`;
    const D = OPS.Desk, role = st.role, fo = role === "FO" || OPS.isMgr(role), hk = role === "HK" || OPS.isMgr(role);
    const lbl = d => (multiB() ? (d.building || "") + " " : "") + d.no;
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
    // [web] 불출 요청·처리는 작업대로 옮겼다. 여기는 재고와 분실물(보관 대장)만
    const dOpen = st.deliv.filter(D.isOpen).length;
    const toHub = `<p class="sub" style="margin:0 0 12px">불출 요청과 처리는 <button type="button" class="lnk" data-tab="work">작업대</button>에서 합니다${dOpen ? ` · 지금 진행 중 ${dOpen}건` : ""}. 끝난 불출은 <button type="button" class="lnk" data-tab="rooms" data-ak="deliv">보관함</button>에 모입니다.</p>`;
    return toHub + stock + lostCard;
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
        st.dForce = null; st.dMsg = `${r.no}호 불출을 보냈습니다.`; st.sendRoom = null;
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
  function houseLine(bOnly) {   // [web] bOnly: 청소·재실에서 고른 동만 센다(목록과 숫자를 맞춘다)
    const M = boardM(); let stay = 0, out = 0, inn = 0;
    const bf = bOnly || st.rb;
    Object.keys(M.rooms).forEach(id => {
      if (bf && bf !== "all" && M.rooms[id].b !== bf) return;
      const x = roomState(id, st.rdate); if (!x) return;
      if (x.stay === "연박") stay++;
      if (x.stay === "퇴실" || x.stay === "퇴실·입실") out++;
      if (x.stay === "입실" || x.stay === "퇴실·입실") inn++;
    });
    const tomorrow = st.rdate > OPS.ymd(Date.now());
    const bn = bOnly ? ((M.buildings || []).find(b => b.id === bOnly) || {}).name || "" : "";
    return `<p class="sub houseln" title="프로그램(PMS) 재실 수와 다르면 예약표를 확인해 주십시오.">${tomorrow ? "예정 · " : ""}${bn ? esc(bn) + " " : ""}투숙 <b>${stay + out}</b>실(전날 밤) → <b>${stay + inn}</b>실(오늘 밤) <span class="hlx">= 재실 ${stay} · 퇴실 ${out} · 입실 ${inn} · PMS와 다르면 예약표 확인</span></p>`;
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
  // [web] 읽음 표시: 프론트→키핑(퇴실 완료·재실 요청)은 "키핑 읽음", 키핑→프론트(입실 가능)는 "프론트 읽음"
  const rdWho = o => `${tAt(o)} ${nameOf(o.uid, o.by && o.by !== "(이름 없음)" ? o.by : "") || ""}`.trim();
  function foRead(x) {
    const s = x.s || {};
    if (x.type !== "out" || !s.done || s.ext) return "";
    if (OPS.Svc.foNeedsAck(x)) return `<span class="rdy-r no">프론트 읽지 않음</span>`;
    return s.foAck && s.foAck.at >= s.done.at ? `<span class="rdy-r yes">프론트 읽음 ${esc(rdWho(s.foAck))}</span>` : "";
  }
  function ackLine(x) {
    const s = x.s || {};
    if (OPS.Svc.hkNeedsAck(x)) return `<span class="rdy-r no">키핑 읽지 않음</span>`;
    if (s.done) return `<span class="w">완료 ${esc(whoLine(s.done, { short: true }))}${s.done.small || s.done.large ? ` · 수건 작${s.done.small} 큰${s.done.large}` : ""}</span>${foRead(x)}`;
    if (s.hkAck) return `<span class="rdy-r yes">키핑 읽음 ${esc(rdWho(s.hkAck))}</span>`;
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
        <div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${kindChip(x.kind)}${forceChip(x)}${chip(x)}${r.window ? `<span class="chip k">${esc(r.window)}</span>` : ""}${rt ? `<span class="w" style="display:inline">${esc(rt)}</span>` : ""}</div>
        <div class="sa">${stageMenuBtn(x, ro)}${ro ? "" : `<button type="button" class="btn sm ${s.reply ? "" : "main"}" data-svc="edit" data-id="${esc(x.id)}">${s.reply ? "요청 수정" : "요청 입력"}</button>`}${s.reply ? `<span class="w">${esc(whoLine(s.reply, { short: true }))}</span>` : ""}${ackLine(x)}</div>
        ${editing ? `<div class="sedit req">
          <div class="acts" style="margin:0"><label class="tw">시작<input type="time" id="rf-${esc(x.id)}" value="${esc(r.from || "")}" step="1800"></label><span aria-hidden="true">~</span><label class="tw">끝<input type="time" id="rt-${esc(x.id)}" value="${esc(r.to || "")}" step="1800"></label></div>
          <div class="reqk" role="group" aria-label="요청한 청소">${OPS.Svc.REQ_KINDS.map(k => `<label class="tg"><input type="checkbox" name="rk-${esc(x.id)}" value="${esc(k)}" ${sel.includes(k) ? "checked" : ""}> ${esc(k === "정비" ? x.kind : k)}</label>`).join("")}</div>
          <input id="rm-${esc(x.id)}" placeholder="메모(선택) 예: 생수 2" value="${esc(r.items || "")}" maxlength="100">
          <div class="acts" style="margin:0"><button type="button" class="btn sm main" data-svc="req" data-id="${esc(x.id)}">저장</button><button type="button" class="btn sm" data-svc="refuse" data-id="${esc(x.id)}">청소 X</button>${s.reply ? `<button type="button" class="btn sm" data-svc="clear" data-id="${esc(x.id)}">지우기</button>` : ""}<button type="button" class="btn sm" data-svc="close" data-id="${esc(x.id)}">닫기</button></div></div>` : ""}
      </div>`;
    };
    const outRow = x => {
      const s = x.s, need = OPS.Svc.foNeeds(x), editing = (st.svcEdit === x.id || need) && !ro;
      const foA = !ro && st.role === "FO" && OPS.Svc.foNeedsAck(x);   // [web] 입실 가능을 프론트가 아직 안 읽음
      const foC = !ro && st.role === "FO" && OPS.Svc.foCoNeedsAck(x);   // [web] 키핑이 직접 퇴실 확인
      const hkCo = s.co && s.co.role && s.co.role !== "FO", coDept = hkCo ? OPS.deptName(s.co.role) : "";
      const stage = s.done ? "" : s.cleaned ? `청소 끝 ${tAt(s.cleaned)}` : s.start ? `청소 시작 ${tAt(s.start)}` : "";
      return `<div class="srow ${need || foA || foC ? "pend blinkrow" : OPS.Svc.hkNeedsAck(x) ? "pend" : ""}">
        ${hkCo && !s.done ? `<div class="sx">${esc(coDept)}에서 손님 퇴실을 확인했습니다(${esc(tAt(s.co))} · ${esc(nameOf(s.co.uid, s.co.by) || coDept)}). 프론트 퇴실 완료는 따로 누르지 않아도 됩니다.</div>` : ""}
        <div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${x.sameDayIn ? `<span class="chip in">당일 입실</span>` : ""}${chip(x)}${s.prio ? `<span class="chip k">우선 ${esc(s.prio.time)}</span>` : ""}${s.late && s.co ? `<span class="chip k">레이트 ${esc(s.late.time)}</span>` : ""}${s.pwGiven ? `<span class="chip warn">비번 제공</span>` : ""}${stage ? `<span class="w" style="display:inline">${esc(stage)}</span>` : ""}</div>${miniSteps(x)}
        ${need ? `<div class="sx warnt">키핑이 ${esc(tAt(s.stillIn))}에 방문했는데 아직 손님이 있습니다. 레이트·연장·퇴실 완료 중 하나로 답해 주십시오.</div>` : ""}
        <div class="sa">${stageMenuBtn(x, ro)}${foC ? `<button type="button" class="btn sm main" data-svc="foco" data-id="${esc(x.id)}">${esc(coDept)} 퇴실 확인 읽음</button>` : ""}${foA ? `<button type="button" class="btn sm main" data-svc="foack" data-id="${esc(x.id)}">입실 가능 확인</button>` : ""}${ro ? "" : `<label class="tg"><input type="checkbox" data-svc="pw" data-id="${esc(x.id)}" ${s.pwGiven ? "checked" : ""}> 비번 제공</label>
          ${s.co ? `<button type="button" class="btn sm" data-svc="unco" data-id="${esc(x.id)}" title="누르면 퇴실 완료 취소">${hkCo ? coDept + " 퇴실 확인" : "퇴실 완료"} ${esc(tAt(s.co))}</button>` : s.ext ? `<button type="button" class="btn sm" data-svc="unext" data-id="${esc(x.id)}">연장 취소</button>` : `<button type="button" class="btn sm main" data-svc="co" data-id="${esc(x.id)}">퇴실 완료</button>`}
          ${need ? "" : `<button type="button" class="btn sm" data-svc="edit" data-id="${esc(x.id)}">레이트·연장·우선</button>`}`}${ackLine(x)}</div>
        ${editing ? `<div class="sedit"><div class="acts" style="margin:0;flex-wrap:wrap">
            ${s.co ? "" : `<label class="tw">레이트<input type="time" id="lt-${esc(x.id)}" value="${esc(s.late ? s.late.time : "13:00")}" step="600"></label><button type="button" class="btn sm main" data-svc="late" data-id="${esc(x.id)}">레이트 지정</button>
            <button type="button" class="btn sm" data-svc="ext" data-id="${esc(x.id)}">연장(오늘 청소 없음)</button>`}
            <label class="tw">입실<input type="time" id="pt-${esc(x.id)}" value="${esc(s.prio ? s.prio.time : "15:00")}" step="600"></label><button type="button" class="btn sm" data-svc="prio" data-id="${esc(x.id)}">우선 준비</button>${s.prio ? `<button type="button" class="btn sm" data-svc="unprio" data-id="${esc(x.id)}">우선 해제</button>` : ""}
            ${need ? "" : `<button type="button" class="btn sm" data-svc="close" data-id="${esc(x.id)}">닫기</button>`}</div>
          <p class="sub" style="margin:6px 0 0">연장은 예약표에도 반영해야 다음 날부터 연박으로 잡힙니다(예약 추가 또는 예약표 다시 올리기).</p></div>` : ""}
      </div>`;
    };
    // [web] 단락별로 나눠 제목을 누르면 펼치고 접는다
    const fo = st.role === "FO" && !ro;
    const sNo = stay.filter(x => !x.s.reply && !x.s.done), sReq = stay.filter(x => x.s.reply && !x.s.done), sDn = stay.filter(x => x.s.done);
    const oAns = out.filter(x => OPS.Svc.foNeeds(x)), oPre = out.filter(x => !x.s.co && !x.s.ext && !x.s.done && !OPS.Svc.foNeeds(x));
    const oIng = out.filter(x => x.s.co && !x.s.done && !x.s.ext), oRdy = out.filter(x => x.s.done && !x.s.ext), oExt = out.filter(x => x.s.ext);
    return `<section class="card" id="sv-stay"><h2>재실 청소 요청 <span class="c">${stay.length}</span></h2><p class="sub">청소표의 재실 객실입니다. 손님이 요청한 시간대(시작~끝)와 청소 종류를 적으면 키핑 화면에 바로 뜹니다. 적지 않은 객실은 청소하지 않습니다. 단락 제목을 누르면 펼치고 접습니다.</p>${stay.length
        ? secBlock("fo-s-no", "요청 없음(입력 전)", sNo, stayRow) + secBlock("fo-s-req", "요청함·정비 대기", sReq, stayRow) + secBlock("fo-s-done", "청소 완료", sDn, stayRow, { open: false })
        : `<div class="empty">재실 객실이 없습니다.</div>`}</section>
      <section class="card" id="sv-out"><h2>퇴실 <span class="c">${out.length}</span></h2><p class="sub">입실 가능 <b>${ready}</b>실 · 청소 중 ${ing}실. 먼저 필요한 객실은 "우선 준비"로 입실 시각을 걸면 키핑 목록 맨 위로 갑니다. 단락 제목을 누르면 펼치고 접습니다.</p>${out.length
        ? secBlock("fo-o-ans", "답할 것(손님 아직 있음)", oAns, outRow) + secBlock("fo-o-pre", "퇴실 전", oPre, outRow) + secBlock("fo-o-ing", "청소 중(퇴실 확인~점검 대기)", oIng, outRow, fo ? { unread: OPS.Svc.foCoNeedsAck, ackAct: "fo" } : {})
          + secBlock("fo-o-rdy", "입실 가능", oRdy, outRow, fo ? { open: false, unread: OPS.Svc.foNeedsAck, ackAct: "fo" } : { open: false }) + secBlock("fo-o-ext", "연장·청소 없음", oExt, outRow, { open: false })
        : `<div class="empty">퇴실 객실이 없습니다.</div>`}</section>`;
  }

  function hkView(list) {
    // v0.20: 단락(퇴실 청소·재실 청소) 안에서 할 것·퇴실 전·완료·요청 없음을 모두 보인다. 완료해도 사라지지 않는다.
    const n = [0, 1, 2, 3, 4, 5, 6, 8], byNo = (a, b) => (+a.r.no - +b.r.no);
    const row = x => {
      const s = x.s, need = OPS.Svc.hkNeedsAck(x);
      const what = x.type === "out" ? `퇴실 ${esc(tAt(s.co))}${s.prio ? ` · <b class="warnt">${esc(s.prio.time)} 입실 우선</b>` : x.sameDayIn ? ` · <b class="warnt">당일 입실</b>` : ""}${s.cleaned ? ` · 청소 끝 ${esc(tAt(s.cleaned))}` : s.start ? ` · 청소 중` : ""}` : !s.reply ? `${kindChip(x.kind)} · <b class="warnt">${esc(String(x.day))}일째 점검(요청 없음, 프론트와 시간 맞추기)</b>` : s.reply.type === "time" ? `<b>${esc(s.reply.window)}</b> · ${s.reply.kinds ? esc(OPS.Svc.reqText(x)) : kindChip(x.kind)}` : "청소 X · 요청만";
      const stageBtn = x.type !== "out" || need ? "" : !s.start ? `<button type="button" class="btn sm main" data-svc="start" data-id="${esc(x.id)}">청소 시작</button>` : !s.cleaned ? `<button type="button" class="btn sm main" data-svc="cleaned" data-id="${esc(x.id)}">청소 끝 → 점검 대기</button>` : "";
      return `<div class="srow ${need ? "pend blinkrow" : ""}">
        <div class="sh"><b class="sn">${esc(rLabel(x.r))}</b><span>${what}</span></div>${miniSteps(x)}
        ${s.reply && s.reply.items && !s.reply.kinds ? `<div class="sx">요청: ${esc(s.reply.items)}</div>` : ""}${s.memo && s.memo.text ? `<div class="sx">추가: ${esc(s.memo.text)}</div>` : ""}
        <div class="sa">${need ? `<button type="button" class="btn sm main" data-svc="ack" data-id="${esc(x.id)}">확인</button>` : `<span class="w">확인 ${esc(tAt(s.hkAck))}</span>`}
          <label class="tw">작<select id="ts-${esc(x.id)}">${n.map(v => `<option>${v}</option>`).join("")}</select></label><label class="tw">큰<select id="tl-${esc(x.id)}">${n.map(v => `<option>${v}</option>`).join("")}</select></label>
          ${stageBtn}<button type="button" class="btn sm ${x.type === "out" && s.cleaned ? "main" : ""}" data-svc="done" data-id="${esc(x.id)}">${x.type === "out" ? "점검 완료 → 입실 가능" : "청소 완료"}</button></div>
      </div>`;
    };
    // 퇴실 완료 전: 방문했는데 손님이 있으면 프론트에 알린다(톡방의 "아직 퇴실 안 하셨다고 합니다")
    const preRow = x => `<div class="srow"><div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${chip(x)}${x.s.prio ? `<span class="chip k">${esc(x.s.prio.time)} 입실 우선</span>` : ""}</div>${miniSteps(x)}
      <div class="sa">${x.s.ext ? "" : `<button type="button" class="btn sm main" data-svc="hkcostart" data-id="${esc(x.id)}" title="손님이 나간 것을 확인했을 때만. 프론트에 알림이 갑니다">퇴실 확인·청소 시작</button>`}${x.s.stillIn && OPS.Svc.foNeeds(x) ? `<span class="w warnt">프론트 답 기다리는 중 (${esc(tAt(x.s.stillIn))} 알림)</span>` : `<button type="button" class="btn sm" data-svc="stillin" data-id="${esc(x.id)}">아직 손님 있음 → 프론트에 알림</button>`}</div></div>`;   // [web] 키핑 퇴실 확인
    const doneRow = x => { const r = x.s.reply; const what = x.type === "out" ? "퇴실" : r && r.window ? r.window + " · " + (r.kinds ? OPS.Svc.reqText(x) : x.kind) : x.kind;
      return `<div class="srow donerow"><div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${chip(x)}<span class="w" style="display:inline">${esc(what)}</span>${ackLine(x)}<button type="button" class="lnk" data-svc="undone" data-id="${esc(x.id)}">완료 취소</button></div></div>`; };
    const offRow = x => `<div class="srow donerow"><div class="sh"><b class="sn">${esc(rLabel(x.r))}</b>${chip(x)}${x.type === "stay" ? kindChip(x.kind) : ""}</div></div>`;
    const outs = list.filter(x => x.type === "out"), stays = list.filter(x => x.type === "stay");
    const oTodo = OPS.Svc.hkSort(outs.filter(OPS.Svc.hkTodo));
    const oPre = outs.filter(x => !x.s.co && !x.s.ext && !x.s.done).sort(byNo);
    const oExt = outs.filter(x => x.s.ext && !x.s.done).sort(byNo);
    const oDone = outs.filter(x => x.s.done).sort((a, b) => b.s.done.at - a.s.done.at);
    const sTodo = OPS.Svc.hkSort(stays.filter(OPS.Svc.hkTodo));
    const sDone = stays.filter(x => x.s.done).sort((a, b) => b.s.done.at - a.s.done.at);
    const sOff = stays.filter(x => !x.s.done && !OPS.Svc.hkTodo(x)).sort(byNo);
    const prog = (d, all) => `<span class="prog" aria-label="완료 ${d} / ${all}"><i style="width:${all ? Math.round(d / all * 100) : 0}%"></i></span><span class="c">완료 ${d} / ${all}</span>`;
    return `<section class="card" id="sv-out"><h2>퇴실 청소 ${prog(oDone.length, outs.length)}</h2><p class="sub">당일 입실·우선 준비 객실이 맨 위입니다. 깜빡이는 줄은 새로 들어온 내용이니 확인을 눌러 주십시오. 완료한 객실도 아래에 남습니다.</p>
        ${outs.length ? secBlock("hk-o-todo", "할 청소", oTodo, row, { unread: OPS.Svc.hkNeedsAck, ackAct: "ack" }) + secBlock("hk-o-pre", "퇴실 전", oPre, preRow, { note: "손님이 나간 것을 확인했으면 \"퇴실 확인·청소 시작\"을 누르십시오. 프론트가 퇴실 완료를 눌러도 할 청소로 올라갑니다" }) + secBlock("hk-o-done", "완료", oDone, doneRow, { open: false }) + secBlock("hk-o-ext", "연장·청소 없음", oExt, offRow, { open: false }) : `<div class="empty">오늘 퇴실 객실이 없습니다.</div>`}
        ${outs.length && !oTodo.length && !oPre.length && oDone.length ? `<p class="okline">퇴실 청소를 모두 마쳤습니다.</p>` : ""}</section>
      <section class="card" id="sv-stay"><h2>재실 청소 ${prog(sDone.length, sTodo.length + sDone.length)}</h2><p class="sub">프론트가 적은 요청 시간순입니다. 요청이 없는 객실은 청소하지 않습니다.</p>
        ${stays.length ? secBlock("hk-s-todo", "할 재실 청소", sTodo, row, { unread: OPS.Svc.hkNeedsAck, ackAct: "ack" }) + secBlock("hk-s-done", "완료", sDone, doneRow, { open: false }) + secBlock("hk-s-off", "요청 없음·청소 X", sOff, offRow, { open: false, note: "청소하지 않는 재실 객실" }) : `<div class="empty">오늘 재실 객실이 없습니다.</div>`}
        ${sTodo.length + sDone.length && !sTodo.length ? `<p class="okline">재실 청소 요청을 모두 마쳤습니다.</p>` : ""}</section>`;
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
      else if (act === "foack") doc = await S.foAck(T, id, cur, a);
      else if (act === "foco") doc = await S.foCoAck(T, id, cur, a);
      else if (act === "hkco" || act === "hkcostart") doc = await S.hkCheckout(T, id, cur, a, room, act === "hkcostart");
      else if (act === "done") doc = await S.done(T, id, cur, a, ($("ts-" + id) || {}).value, ($("tl-" + id) || {}).value);
      else if (act === "undone") doc = await S.undoDone(T, id, cur, a);
      else if (act === "stillin") doc = await S.stillIn(T, id, cur, a);
      else if (act === "kindfull" || act === "kindlite" || act === "kindauto") doc = await S.setKind(T, id, cur, a, act === "kindfull" ? "전체재실" : act === "kindlite" ? "재실청소" : "");
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

  // ---------- [web] 청소 단계: 현황판·배치도 띠(색만으로 구분하지 않게 기호와 글자를 함께) ----------
  const CS = { pre: ["○", "퇴실 전"], wait: ["●", "청소 대기"], ing: ["◐", "청소 중"], chk: ["◎", "점검 대기"], ok: ["✓", "입실 가능"], x: ["✕", "청소 X"] };
  function cleanStage(x) {
    if (!x) return null;
    const s = x.s || {};
    if (x.type === "out") {
      if (s.ext) return { k: "x", t: "연장" };
      if (s.done) return { k: "ok", t: "입실 가능" };
      if (s.cleaned) return { k: "chk", t: "점검 대기" };
      if (s.start) return { k: "ing", t: "청소 중" };
      if (s.co) return { k: "wait", t: "청소 대기" };
      if (OPS.Svc.foNeeds(x)) return { k: "pre", t: "손님 아직 있음" };
      return { k: "pre", t: s.late ? "레이트 " + s.late.time : "퇴실 전" };
    }
    if (s.done) return { k: "ok", t: "청소 완료" };
    if (OPS.Svc.stayWork(s)) return { k: "wait", t: s.reply.type === "time" ? "청소 대기" : "요청만" };
    if (OPS.Svc.forceDue(x)) return { k: "wait", t: x.day + "일 점검" };   // [web] 장기 투숙 점검(요청 없어도 전체 청소)
    if (!s.reply) return { k: "pre", t: "요청 전" };   // [web] 아직 손님 요청을 안 받은 재실(청소 안 함과 구분)
    return { k: "x", t: "청소 X" };
  }
  const csBand = c => c ? `<span class="cband cs-${c.k}" aria-hidden="true"><b>${CS[c.k][0]}</b>${esc(c.t)}</span>` : "";

  // ---------- [web] 우클릭·길게 누르기로 청소 단계 바꾸기(키핑만) + 되돌리기 ----------
  // 청소 단계를 바꿀 수 있는 사람: 키핑과 관리자(관리자 화면·지배인)
  function canStage() { return st.role === "HK" || OPS.isMgr(st.role); }
  // 관리자는 청소·재실(프론트 화면 모양)에서 줄마다 "청소 단계" 버튼으로 같은 메뉴를 연다
  function stageMenuBtn(x, ro) { return !ro && st.role !== "HK" && canStage() ? `<button type="button" class="btn sm" data-stagemenu="${esc(x.id)}" aria-haspopup="menu">청소 단계 ▾</button>` : ""; }
  // ---------- [web] 청소·재실 단락: 제목을 누르면 펼치고 접는다(기기마다 기억). 새로 온 줄이 있으면 펼쳐 두고 "이 단락 모두 확인" ----------
  function secBlock(key, title, arr, fn, o) {
    o = o || {};
    if (!arr.length) return "";
    const un = o.unread ? arr.filter(o.unread) : [];
    const saved = mem.get("sec:" + key, "");
    const open = un.length || (st.svcEdit && arr.some(x => x.id === st.svcEdit)) ? true : saved ? saved === "1" : o.open !== false;   // [web] 입력 중인 줄이 있으면 늘 펼친다
    return `<details class="secd" data-sec="${esc(key)}" ${open ? "open" : ""}><summary class="sech"><span class="sect">${esc(title)}</span><span class="c">${arr.length}</span>${un.length ? `<span class="unread">새 ${un.length}</span>` : ""}${o.note ? `<small>${esc(o.note)}</small>` : ""}</summary>`
      + (un.length && o.ackAct ? `<div class="secacts"><button type="button" class="btn sm main" data-secack="${esc(o.ackAct)}" data-ids="${esc(un.map(x => x.id).join(","))}">이 단락 모두 확인 (${un.length})</button></div>` : "")
      + `<div class="slist">${arr.map(fn).join("")}</div></details>`;
  }
  document.addEventListener("click", e => {
    const s = e.target.closest("details.secd > summary");
    if (s) { const d = s.parentNode; mem.set("sec:" + d.dataset.sec, d.open ? "0" : "1"); return; }   // 누른 뒤 상태(펼침↔접힘)를 기억
    const b = e.target.closest("[data-secack]");
    if (b) {
      b.disabled = true;
      const ids = String(b.dataset.ids || "").split(",").filter(Boolean), act = b.dataset.secack;
      (async () => { for (const id of ids) {
        const x = svcRows().find(y => y.id === id); if (!x) continue;
        if (act === "fo") { if (OPS.Svc.foCoNeedsAck(x)) await svcAct("foco", id); if (OPS.Svc.foNeedsAck(x)) await svcAct("foack", id); }
        else if (OPS.Svc.hkNeedsAck(x)) await svcAct(act, id);
      } })();
      return;
    }
    const m = e.target.closest("[data-stagemenu]");
    if (m) { const rc = m.getBoundingClientRect(); openCm(m.dataset.stagemenu, rc.left, rc.bottom + 4); e.stopPropagation(); }
  });
  // 프론트가 읽어야 할 청소 소식: 입실 가능 + 키핑이 직접 확인한 퇴실
  function foSvcNeed(x) { return OPS.Svc.foNeedsAck(x) || OPS.Svc.foCoNeedsAck(x); }
  const STAGE_ACTS = { hkcostart: "퇴실 확인·청소 시작으로 바꿨습니다. 프론트에 알림이 갑니다", hkco: "퇴실 확인으로 바꿨습니다. 프론트에 알림이 갑니다", start: "청소 시작으로 바꿨습니다", cleaned: "점검 대기로 바꿨습니다", done: "입실 가능으로 바꿨습니다. 프론트에 바로 알림이 갑니다", undone: "완료를 취소했습니다" };
  function stageMenu(x) {
    const s = x.s || {}, it = [];
    if (x.type === "out") {
      if (s.ext) return { it, note: "연장 객실은 오늘 청소하지 않습니다." };
      if (!s.co) return { it: [["hkcostart", "◐", "퇴실 확인 + 청소 시작"], ["hkco", "●", "퇴실 확인(청소는 나중에)"]], note: "프론트 퇴실 완료 전입니다. 손님이 나간 것을 확인했을 때만 누르십시오. 프론트에 알림이 갑니다." };
      if (s.done) it.push(["undone", "↺", "완료 취소"]);
      else {
        if (!s.start && !s.cleaned) it.push(["start", "◐", "청소 시작"]);
        if (!s.cleaned) it.push(["cleaned", "◎", "청소 끝(점검 대기)"]);
        it.push(["done", "✓", "입실 가능"]);
      }
    } else {
      if (s.done) it.push(["undone", "↺", "완료 취소"]);
      else if (OPS.Svc.hkTodo(x)) it.push(["done", "✓", "청소 완료"]);
      else return { it, note: "프론트 청소 요청이 없는 객실입니다." };
    }
    return { it };
  }
  let cmEl = null, lpT = 0, lpXY = null, lpFired = false;
  const closeCm = () => { if (cmEl) { cmEl.remove(); cmEl = null; } };
  function openCm(id, px, py) {
    closeCm();
    const M = boardM(), r = M && M.rooms[id]; if (!r) return;
    const x = svcRows().find(y => y.id === id), cs = cleanStage(x);
    const m = x ? stageMenu(x) : { it: [], note: "오늘 청소 대상 객실이 아닙니다." };
    cmEl = document.createElement("div"); cmEl.className = "cmenu"; cmEl.setAttribute("role", "menu"); cmEl.dataset.id = id;
    cmEl.innerHTML = `<p class="cmh">${esc(rLabel(r))}호${cs ? ` · 지금 <span class="lgc cs-${cs.k}"><b>${CS[cs.k][0]}</b>${esc(cs.t)}</span>` : ""}</p>`
      + m.it.map(([a, i, t]) => `<button type="button" role="menuitem" data-cm="${a}"><b aria-hidden="true">${i}</b>${esc(t)}</button>`).join("")
      + (m.note ? `<p class="cmn">${esc(m.note)}</p>` : "") + `<button type="button" role="menuitem" data-cm="close" class="cmx">닫기</button>`;
    document.body.appendChild(cmEl);
    const w = cmEl.offsetWidth, h = cmEl.offsetHeight;
    cmEl.style.left = Math.max(8, Math.min(px, innerWidth - w - 8)) + "px";
    cmEl.style.top = Math.max(8, Math.min(py, innerHeight - h - 8)) + "px";
    const f = cmEl.querySelector("[data-cm]"); if (f) f.focus({ preventScroll: true });
  }
  const cmTarget = el => {
    if (!canStage() || boardM() === DEMO || !el || !el.closest) return null;
    const t = el.closest("#view .rt[data-room], #view g.pr[data-room], #view .sk[data-room], #view .srow"); if (!t) return null;
    if (t.dataset && t.dataset.room) return t.dataset.room;
    const b = t.querySelector("[data-id]"); return b ? b.dataset.id : null;
  };
  document.addEventListener("contextmenu", e => {
    const id = cmTarget(e.target); if (!id) return;
    e.preventDefault(); clearTimeout(lpT);
    if (cmEl && cmEl.dataset.id === id) return;
    let px = e.clientX, py = e.clientY;
    if (!px && !py) { const rc = e.target.closest("[data-room], .srow").getBoundingClientRect(); px = rc.left + 20; py = rc.top + 20; }   // 키보드(메뉴 키·Shift+F10)
    if (lpXY) lpFired = true;
    openCm(id, px, py);
  });
  // 아이폰은 길게 눌러도 contextmenu가 오지 않아 직접 잰다
  document.addEventListener("touchstart", e => {
    const id = cmTarget(e.target); lpFired = false; clearTimeout(lpT); lpXY = null;
    if (!id || e.touches.length !== 1) return;
    lpXY = [e.touches[0].clientX, e.touches[0].clientY];
    lpT = setTimeout(() => { lpFired = true; if (!cmEl) { openCm(id, lpXY[0], lpXY[1]); try { navigator.vibrate && navigator.vibrate(15); } catch (err) {} } }, 550);
  }, { passive: true });
  document.addEventListener("touchmove", e => { if (lpXY && Math.hypot(e.touches[0].clientX - lpXY[0], e.touches[0].clientY - lpXY[1]) > 10) { clearTimeout(lpT); lpXY = null; } }, { passive: true });
  document.addEventListener("touchend", e => { clearTimeout(lpT); lpXY = null; if (lpFired && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener("click", e => {
    if (lpFired) { lpFired = false; if (!e.target.closest(".cmenu")) { e.preventDefault(); e.stopPropagation(); return; } }
    const b = e.target.closest(".cmenu [data-cm]");
    if (b) { e.preventDefault(); e.stopPropagation(); const id = cmEl.dataset.id, a = b.dataset.cm; closeCm(); if (a !== "close") stageAct(a, id); return; }
    if (cmEl && !e.target.closest(".cmenu")) { closeCm(); e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.closest("#undoBtn")) { e.preventDefault(); e.stopPropagation(); undoStage(); }
  }, true);
  document.addEventListener("keydown", e => {
    if (!cmEl) return;
    if (e.key === "Escape") { closeCm(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { const bs = [...cmEl.querySelectorAll("[data-cm]")], i = bs.indexOf(document.activeElement); const n = bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length]; if (n) { n.focus(); e.preventDefault(); } }
  });
  addEventListener("scroll", () => closeCm(), true);
  addEventListener("resize", () => closeCm());

  let undoT = 0;
  async function stageAct(act, id) {
    if (!canStage()) { flash("청소 단계는 키핑과 관리자만 바꿀 수 있습니다."); return; }
    const before = st.svc[id] || null;
    await svcAct(act, id);
    const after = st.svc[id];
    if (!after || after === before) return;   // 저장 실패는 svcAct가 알린다
    st.undo = { id, before, act };
    let n = 6;
    let el = $("undoBar");
    if (!el) { el = document.createElement("div"); el.id = "undoBar"; el.className = "undobar"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    const r = boardM().rooms[id];
    const paint = () => { el.innerHTML = `<span><b>${esc(rLabel(r))}호</b> ${esc(STAGE_ACTS[act])}</span><button type="button" id="undoBtn">되돌리기 ${n}</button>`; };
    paint(); el.hidden = false; clearInterval(undoT);
    undoT = setInterval(() => { n--; if (n <= 0) { clearInterval(undoT); el.hidden = true; st.undo = null; } else paint(); }, 1000);
  }
  async function undoStage() {
    const u = st.undo; if (!u) return;
    st.undo = null; clearInterval(undoT); if ($("undoBar")) $("undoBar").hidden = true;
    const cur = st.svc[u.id] || {}, a = actor(), now = Date.now(), sid = OPS.Svc.sid(st.rdate, u.id);
    const doc = Object.assign({}, u.before || { date: st.rdate, roomId: u.id, propertyId: OPS.CTX.propertyId }); delete doc.id;
    doc.updatedAt = now;
    doc.log = [{ at: now, by: a.name || "", uid: a.uid || "", role: a.role, act: "되돌리기(" + (cur.log && cur.log[0] ? cur.log[0].act : u.act) + ")" }].concat(cur.log || []).slice(0, 12);
    try { await Store.set(COL.roomSvc, sid, doc); st.svc[u.id] = Object.assign({ id: sid }, doc); render(); }
    catch (e) { flash(e.message || String(e)); }
  }

  // ---------- [web] 받은 편지함: 우리 부서가 받은 것을 시간순으로 + 읽음/안 읽음 ----------
  // 읽음 기록은 그대로 쓴다: 업무 = 부서 확인(ack), 퇴실 완료·재실 요청 = 키핑 확인(hkAck), 입실 가능 = 프론트 확인(foAck)
  // 불출은 읽음 칸이 없어 hkSeen(키핑)·foSeen(프론트)을 더한다
  function inboxItems(role) {
    const R = role || st.role, out = [], M = boardM(), demo = !M || M === DEMO;
    const nm = o => o ? (nameOf(o.uid, o.by && o.by !== "(이름 없음)" ? o.by : "") || "") : "";
    st.tasks.forEach(t => {
      const rep = t.status === "완료 대기" && t.fromDept === R && t.toDept !== R;
      if (!rep && !(t.toDept === R && t.fromDept !== R)) return;
      const ackAt = (t.ack && t.ack[R]) || 0, open = OPS.OPEN.has(t.status);
      out.push({ key: "t:" + t.id, at: rep ? t.updatedAt : t.createdAt, kind: rep ? "완료 보고" : OPS.kindName(t.kind), hot: t.priority === "긴급" && open,
        room: t.roomId || "", roomTxt: t.room ? (bTag(t) ? bTag(t) + " " : "") + t.room : "", text: t.title + (open ? "" : " (" + t.status + ")"),
        from: rep ? OPS.deptName(t.toDept) : (nm({ uid: t.createdUid, by: t.createdBy }) || OPS.deptName(t.fromDept)) + " · " + OPS.deptName(t.fromDept),
        read: !!ackAt || !open, readAt: ackAt, task: t, ack: open && !ackAt ? { task: t } : null, go: { task: t.id } });
    });
    if (!demo && (R === "HK" || R === "FO")) svcRows().forEach(x => {
      const s = x.s || {}, lab = rLabel(x.r);
      if (R === "HK") {
        const hk = (s.hkAck && s.hkAck.at) || 0;
        const push = (o, kind, text) => { if (!o || !o.at) return; const rd = !!s.done || hk >= o.at;
          out.push({ key: "s:" + x.id + ":" + kind, at: o.at, kind, room: x.id, roomTxt: lab, text, from: (nm(o) || "프론트") + " · 프론트", read: rd, readAt: rd && hk >= o.at ? hk : 0, readBy: rd ? s.hkAck : null, ack: rd ? null : { svc: x.id, act: "ack" }, go: { room: x.id } }); };
        if (x.type === "out" && !s.ext) {
          if (!(s.co && s.co.role === "HK")) push(s.co, "퇴실 완료", "퇴실 완료" + (x.sameDayIn ? " · 당일 입실" : "") + (s.pwGiven ? " · 비번 제공(변경 필요)" : ""));
          push(s.prio, "우선 준비", (s.prio ? s.prio.time : "") + " 입실 · 먼저 준비");
          push(s.late, "레이트", (s.late ? s.late.time : "") + " 레이트 체크아웃");
          if (s.co && s.memo && s.memo.text) push(s.memo, "추가 요청", s.memo.text);
        } else if (x.type === "stay" && OPS.Svc.stayWork(s)) push(s.reply, "재실 요청", (s.reply.window ? s.reply.window + " · " : "") + OPS.Svc.reqText(x));
      } else {
        if (x.type === "out" && s.done && !s.ext && s.done.at) {
          const need = OPS.Svc.foNeedsAck(x), fa = s.foAck && s.foAck.at >= s.done.at ? s.foAck : null;
          out.push({ key: "s:" + x.id + ":ready", at: s.done.at, kind: "입실 가능", room: x.id, roomTxt: lab, text: "점검 완료 · 입실 가능" + (x.sameDayIn ? " · 당일 입실 객실" : ""), from: (nm(s.done) || "키핑") + " · 키핑", read: !need, readAt: fa ? fa.at : 0, readBy: fa, ack: need ? { svc: x.id, act: "foack" } : null, go: { room: x.id } });
        }
        if (x.type === "out" && s.co && s.co.role && s.co.role !== "FO" && !s.ext) {
          const need = OPS.Svc.foCoNeedsAck(x), fc = s.foCoAck && s.foCoAck.at >= s.co.at ? s.foCoAck : null, cd = OPS.deptName(s.co.role);
          out.push({ key: "s:" + x.id + ":hkco", at: s.co.at, kind: cd + " 퇴실 확인", room: x.id, roomTxt: lab, text: cd + "에서 손님 퇴실을 확인했습니다" + (s.start ? " · 청소 시작" : "") + (x.sameDayIn ? " · 당일 입실 객실" : ""), from: (nm(s.co) || cd) + " · " + cd, read: !need, readAt: fc ? fc.at : 0, readBy: fc, ack: need ? { svc: x.id, act: "foco" } : null, go: { room: x.id } });
        }
        if (s.stillIn && s.stillIn.at) {
          const need = OPS.Svc.foNeeds(x);
          out.push({ key: "s:" + x.id + ":still", at: s.stillIn.at, kind: "손님 아직 있음", room: x.id, roomTxt: lab, text: need ? "키핑 방문 때 손님이 있었습니다. 레이트·연장·퇴실 완료 중 하나로 답하십시오." : "키핑 방문 때 손님 있음(답함)", from: (nm(s.stillIn) || "키핑") + " · 키핑", read: !need, answer: need, go: { tab: "svc" } });
        }
      }
    });
    st.deliv.forEach(d => {
      const where = ((d.building ? d.building + " " : "") + (d.no || "")).trim();
      if (R === "HK" && !d.cancel) {
        const rd = d.hkSeen || d.go || d.done || d.fail;
        out.push({ key: "d:" + d.id, at: d.at, kind: "불출 요청", hot: !!d.urgent, room: d.roomId || "", roomTxt: where, text: OPS.Desk.line(d) + (d.due ? " · " + d.due + "까지" : ""), from: (nm(d) || "프론트") + " · " + OPS.deptName(d.role || "FO"), read: !!rd, readAt: rd ? rd.at : 0, readBy: rd || null, ack: rd ? null : { deliv: d, f: "hkSeen" }, go: { tab: "desk" } });
      }
      if (R === "FO" && d.fail) {
        const rd = d.foSeen || d.cancel || d.reopened;
        out.push({ key: "d:" + d.id + ":fail", at: d.fail.at, kind: "불출 못 함", hot: true, room: d.roomId || "", roomTxt: where, text: OPS.Desk.line(d) + (d.fail.why ? " · 이유: " + d.fail.why : ""), from: (nm(d.fail) || "키핑") + " · 키핑", read: !!rd, readAt: rd ? rd.at : 0, readBy: rd || null, ack: rd ? null : { deliv: d, f: "foSeen" }, go: { tab: "desk" } });
      }
    });
    return out;
  }
  const inboxUnread = () => { const t0 = OPS.ymd(Date.now()); return inboxItems().filter(x => !x.read && OPS.ymd(x.at) === t0).length; };
  async function inboxAck(x) {
    const a = actor();
    if (!x || !x.ack) return;
    try {
      if (x.ack.task) await Core.ack(x.ack.task, a);
      else if (x.ack.svc) await svcAct(x.ack.act, x.ack.svc);
      else if (x.ack.deliv) await Store.update(COL.deliveries, x.ack.deliv.id, { [x.ack.f]: { at: Date.now(), by: a.name || "", uid: a.uid || "", role: a.role } });
    } catch (e) { flash(e.message || String(e)); }
  }
  function inboxView() {
    const now = Date.now(), today = OPS.ymd(now), since = now - 7 * 864e5, q = String(st.ibQ || "").trim();
    // 업무별로 기록을 미리 묶어 둔다(읽은 사람 찾기)
    const evBy = new Map(); st.events.forEach(e => { if (e.at >= since - 864e5) { const l = evBy.get(e.taskId); if (l) l.push(e); else evBy.set(e.taskId, [e]); } });
    const all = inboxItems();
    let list = all.filter(x => st.ib7 ? x.at >= since : OPS.ymd(x.at) === today);
    const unread = list.filter(x => !x.read).length;
    if (st.ibUn) list = list.filter(x => !x.read);
    if (q) list = list.filter(x => String(x.roomTxt || "").includes(q));
    list.sort((a, b) => b.at - a.at);
    const ackable = list.filter(x => !x.read && x.ack).length;
    const who = x => {
      if (x.readBy) return nameOf(x.readBy.uid, x.readBy.by) || "";
      if (x.task && x.readAt) { const r = Core.readState(x.task, evBy.get(x.task.id) || []); if (r && r.dept === st.role && r.by) return nameOf(r.uid, r.by); }
      return "";
    };
    const row = x => `<button type="button" class="ib ${x.read ? "" : "un"} ${x.hot ? "hot" : ""}" data-ib="${esc(x.key)}">
        <span class="ibt">${esc(rdTime(x.at))}</span>
        <span class="ibm"><span class="ibk">${esc(x.kind)}</span>${x.roomTxt ? `<b class="ibroom">${esc(x.roomTxt)}</b>` : ""}<span class="ibx">${esc(x.text)}</span><small>${esc(x.from)}</small></span>
        <span class="ibr">${x.answer ? `<span class="unread">답 필요</span>` : !x.read ? `<span class="unread">안 읽음</span>` : x.readAt ? `<span class="rdy-r yes">읽음 ${esc(rdTime(x.readAt))}${who(x) ? " " + esc(who(x)) : ""}</span>` : `<span class="rdy-r yes">처리됨</span>`}</span>
      </button>`;
    const dn = OPS.deptName(st.role), lc = dn.charCodeAt(dn.length - 1) - 0xAC00, jb = lc >= 0 && lc < 11172 ? lc % 28 : 0;
    return `<section class="card ibhead">
        <div class="rbar" style="margin-bottom:6px"><h2 style="margin:0">${esc(dn)}${jb ? "이" : "가"} 받은 것</h2>${unread ? `<span class="unread">안 읽음 ${unread}</span>` : `<span class="rdy-r yes">모두 읽음</span>`}</div>
        <p class="sub">다른 부서가 ${esc(dn)}${jb && jb !== 8 ? "으로" : "로"} 보낸 업무·청소 요청·입실 가능·불출을 시간순으로 모았습니다. 줄을 누르면 읽음으로 바뀌고 그 업무나 객실로 갑니다.</p>
        <div class="rbar ibbar">
          <button type="button" class="tg2" data-ibf="un" aria-pressed="${!!st.ibUn}">안 읽음만</button>
          <div class="chips"><button type="button" data-ibf="today" aria-pressed="${!st.ib7}">오늘</button><button type="button" data-ibf="7" aria-pressed="${!!st.ib7}">최근 7일</button></div>
          <input id="ibQ" type="search" inputmode="numeric" placeholder="호수로 거르기" value="${esc(st.ibQ || "")}" aria-label="호수로 거르기">
          <button type="button" class="btn ${ackable ? "main" : ""}" data-ibf="all" ${ackable ? "" : "disabled"}>모두 읽음${ackable ? " (" + ackable + ")" : ""}</button>
        </div>
        ${st.rdate !== today ? `<p class="sub warnt">청소·재실 항목은 ${esc(st.rdate.slice(5).replace("-", "/"))} 기준입니다. 오늘 것을 보려면 현황판에서 오늘 날짜를 고르십시오.</p>` : ""}
      </section>
      <section class="card">${list.length ? `<div class="iblist">${list.map(row).join("")}</div>` : `<div class="empty">${st.ibUn ? "안 읽은 것이 없습니다." : "받은 것이 없습니다."}</div>`}</section>`;
  }
  document.addEventListener("click", e => {
    const f = e.target.closest("[data-ibf]");
    if (f) {
      const k = f.dataset.ibf;
      if (k === "un") st.ibUn = !st.ibUn; else if (k === "today") st.ib7 = false; else if (k === "7") st.ib7 = true;
      else if (k === "all") {
        const now = Date.now(), since = now - 7 * 864e5, t0 = OPS.ymd(now), q = String(st.ibQ || "").trim();
        const list = inboxItems().filter(x => !x.read && x.ack && (st.ib7 ? x.at >= since : OPS.ymd(x.at) === t0) && (!q || String(x.roomTxt || "").includes(q)));
        (async () => { for (const x of list) await inboxAck(x); render(); })();
        return;
      }
      render(); return;
    }
    const b = e.target.closest("[data-ib]");
    if (b) {
      const x = inboxItems().find(y => y.key === b.dataset.ib); if (!x) return;
      if (x.ack && !x.go.task) inboxAck(x);   // 업무는 열면 자동으로 읽음
      if (x.go.task) { st.backRoom = null; openTask(x.go.task); }
      else if (x.go.room) { st.backRoom = null; st.noteEdit = null; openRoom(x.go.room); }
      else if (x.go.tab) { st.tab = x.go.tab; st.bf = ""; render(); toTop(); }
    }
  });

  // ---------- [web] 판매 / 비판매 객실 ----------
  // 객실 목록은 예약표에 줄이 있는 호수를 모두 담는다(창고·판매불가·직원 기숙사도 들어온다).
  // 비판매 = 예약표 타입이 창고·판매불가이거나, 룸 믹스에서 기숙사·타 운영사로 된 객실. 지우지 않고 따로 보여 주며 숫자에서 뺀다.
  const NS_TYPE = /창고|판매\s*불가/;
  function computeNS() {
    const out = new Map(), M = st.master; st.ns = out;
    if (!M || !M.rooms) return;
    const at = {}; (st.mix && st.mix.buildings || []).forEach(mb => { const m = at[mb.name] = new Map(); mb.floors.forEach(f => f.rooms.forEach(x => m.set(x.no, { x, mb }))); });
    Object.entries(M.rooms).forEach(([id, r]) => {
      const t = String(r.type || "");
      if (NS_TYPE.test(t)) { out.set(id, /창고/.test(t) ? "창고" : "판매불가"); return; }
      const hit = at[r.building] && at[r.building].get(r.no);
      if (hit && hit.x.own === "other") out.set(id, opName(hit.mb, hit.x.code));
    });
  }
  const nsOf = id => (st.ns && st.ns.get(id)) || "";
  const saleCount = (M, b) => Object.keys(M.rooms).filter(id => M.rooms[id].b === b && !nsOf(id)).length;
  // ---------- [web] 룸 믹스: 건물 전체 객실 중 누가 운영하는지(설정에서 올린 엑셀) ----------
  const mixOf = name => (st.mix && st.mix.buildings || []).find(x => x.name === name) || null;
  const opName = (mb, code) => (mb.ops[code] && mb.ops[code].name) || code || "?";
  // 범례: 우리 객실 수, 운영사별 수, 객실 목록과 엑셀이 다른 객실
  function mixLegend(mb, rooms, b) {
    const M = st.master, ours = rooms.filter(x => M.rooms[OPS.Rooms.roomId(b, x.no)]);
    const cnt = {}; rooms.forEach(x => { if (M.rooms[OPS.Rooms.roomId(b, x.no)]) return; const k = x.own === "ours" ? "목록 없음" : opName(mb, x.code); cnt[k] = (cnt[k] || 0) + 1; });
    const warn = ours.filter(x => x.own !== "ours");
    const acc = rooms.filter(x => x.acc);
    return `<div class="mixl"><span class="mk ours">우리 객실 <b>${ours.length}</b></span>${Object.entries(cnt).sort((a, c) => c[1] - a[1]).map(([k, n]) => `<span class="mk other">${esc(k)} <b>${n}</b></span>`).join("")}${acc.length ? `<span class="mk">♿ 장애인 객실 ${acc.map(x => esc(x.no)).join("·")}</span>` : ""}</div>
      ${warn.length ? `<p class="mixw">! 객실 목록(예약표)에는 있는데 룸 믹스에서는 우리 객실이 아닌 곳: ${warn.map(x => `${esc(x.no)}(${esc(opName(mb, x.code))})`).join(", ")}. 어느 쪽이 맞는지 확인해 주십시오.</p>` : ""}`;
  }
  // 건물 배치도: 층(위→아래) × 라인 표. 우리 객실은 오늘 상태, 타 운영사는 흐리게
  function stackView(M, by, needIds, hotIds, q) {
    if (!st.mix) return `<section class="card later-box"><h2>건물 배치도</h2><p class="sub">건물 전체(타 운영사 포함) 그림은 룸 믹스가 있어야 그립니다. 관리자 설정의 "룸 믹스"에서 Room_Mix 엑셀을 올려 주십시오.</p></section>`;
    const withMix = M.buildings.filter(x => mixOf(x.name));
    if (!st.pb || !withMix.some(x => x.id === st.pb)) st.pb = (withMix[0] || M.buildings[0] || {}).id;
    const b = st.pb, bn = (M.buildings.find(x => x.id === b) || {}).name || "", mb = mixOf(bn);
    const chips = `<div class="chips">${M.buildings.map(x => `<button type="button" data-pb="${esc(x.id)}" aria-pressed="${x.id === b}">${esc(x.name)}</button>`).join("")}</div>`;
    if (!mb) return `<section class="card">${chips}<p class="sub">${esc(bn)}은(는) 룸 믹스에 없습니다. 엑셀 시트 이름이 "${esc(bn)}"인지 확인해 주십시오.</p></section>`;
    const svcBy = new Map(); svcRows().forEach(x => svcBy.set(x.id, x));
    const L = mb.lines;
    const span = key => { const out = []; L.forEach(l => { const v = l[key] || ""; const last = out[out.length - 1]; if (last && last.v === v) last.n++; else out.push({ v, n: 1 }); }); return out; };
    const head = (key, cls) => `<tr class="${cls}"><th></th>${span(key).map(g => `<th colspan="${g.n}">${esc(g.v)}</th>`).join("")}</tr>`;
    const hasWing = L.some(l => l.wing);
    const cell = x => {
      if (!x) return `<td class="sk none"></td>`;
      const id = OPS.Rooms.roomId(b, x.no);
      if (!M.rooms[id]) return `<td class="sk other ${x.own === "ours" ? "lost" : ""}" title="${esc(x.no)}호 · ${esc(x.own === "ours" ? "우리 타입인데 객실 목록에 없음" : opName(mb, x.code))}${x.acc ? " · 장애인 객실" : ""}"><b>${esc(x.no)}</b><small>${esc(x.own === "ours" ? "?" : x.code)}</small></td>`;
      const s = roomState(id, st.rdate), ts = by.get(id) || [], sv = svcBy.get(id), cs = sv ? cleanStage(sv) : null;
      const cls = ["sk", "ours", s && s.stay ? "st-" + (STAY_CLS[s.stay] || "") : "", cs ? "cs-" + cs.k : "", ts.length ? "has" : "", needIds.has(id) ? "need" : "", hotIds.has(id) ? "hot" : "", q && x.no.startsWith(q) ? "hit" : "", x.own !== "ours" ? "mixwarn" : ""].join(" ");
      return `<td class="${cls}" data-room="${esc(id)}" tabindex="0" title="${esc(x.no)}호 · ${esc(x.code)}${s && s.stay ? " · " + esc(stayName(s.stay)) : ""}${cs ? " · " + esc(cs.t) : ""}${ts.length ? " · 열린 업무 " + ts.length : ""}"><b>${esc(x.no)}</b><small>${cs ? CS[cs.k][0] : ""}${s && s.stay ? esc(STAY_SHORT[s.stay] || s.stay) : esc(x.code)}</small>${ts.length ? `<i class="skb">${ts.length}</i>` : ""}${x.acc ? `<i class="ska">♿</i>` : ""}</td>`;
    };
    const rows = mb.floors.map(f => { const at = new Map(f.rooms.map(x => [x.line, x])); return `<tr><th>${esc(f.f)}F</th>${L.map(l => cell(at.get(l.n))).join("")}</tr>`; }).join("");
    const fac = (mb.facilities || []).map(x => `<tr class="fac"><th>${esc(x.f)}</th><td colspan="${L.length}">${esc(x.text)}</td></tr>`).join("");
    const all = mb.floors.flatMap(f => f.rooms);
    return `<section class="card">${chips}
      <div class="skwrap"><table class="stack">
        <thead>${hasWing ? head("wing", "wg") : ""}${head("dir", "dr")}<tr class="ln"><th></th>${L.map(l => `<th>${l.n}<small>${esc(l.type)}</small></th>`).join("")}</tr>
          <tr class="ar"><th>㎡</th>${L.map(l => `<th>${l.area != null ? esc(String(l.area)) : ""}</th>`).join("")}</tr></thead>
        <tbody>${rows}${fac}</tbody></table></div>
      ${mixLegend(mb, all, b)}
      <p class="sub" style="margin-top:6px">진한 칸 = 우리 객실(오늘 숙박·청소 단계, 누르면 상세). 흐린 칸 = 타 운영사(약자: ${Object.entries(mb.ops).map(([k, v]) => esc(k) + " " + esc(v.name)).join(" · ")}). 라인 머리 글자는 분양 평면 타입입니다. 룸 믹스: ${esc(st.mix.file || "")} ${st.mix.at ? "· " + esc(hm(st.mix.at)) + " 올림" : ""}</p>
    </section>`;
  }
  // ---------- 배치도 ----------
  function planView(M, by, needIds, hotIds, q) {
    const needIn = (b, f) => Array.from(needIds).filter(id => { const r = M.rooms[id]; return r && r.b === b && (f == null || OPS.Layout.floorOf(r.no) === f); }).length;
    if (!st.pb || !M.buildings.some(b => b.id === st.pb)) st.pb = (M.buildings.slice().sort((a, c) => needIn(c.id) - needIn(a.id))[0] || {}).id;
    const b = st.pb;
    // [web] 룸 믹스·도면 위치가 있으면 그 동의 모든 층·모든 라인을 그린다(타 운영사는 흐리게)
    const bn = (M.buildings.find(x => x.id === b) || {}).name || "", mb = mixOf(bn), geo = OPS.PlanGeo && OPS.PlanGeo[bn];
    const floors = Array.from(new Set(OPS.Layout.floors(M, b).concat(mb ? mb.floors.map(x => x.f) : []))).sort((x, y) => +y - +x);
    if (q) { const hit = Object.values(M.rooms).find(r => r.b === b && r.no.startsWith(q)); if (hit) st.pFloor[b] = OPS.Layout.floorOf(hit.no); }
    if (!st.pFloor[b] || !floors.includes(st.pFloor[b])) st.pFloor[b] = floors.slice().sort((x, y) => needIn(b, y) - needIn(b, x))[0];
    const f = st.pFloor[b];
    const L = geo ? OPS.Layout.get({ rooms: M.rooms, layouts: { [b]: { "기준": geo } } }, b, f) : OPS.Layout.get(M, b, f);
    const fr = mb ? (mb.floors.find(x => x.f === f) || { rooms: [] }) : { rooms: [] };
    const mixAt = new Map(fr.rooms.map(x => [x.no, x]));
    const others = geo ? fr.rooms.filter(x => !M.rooms[OPS.Rooms.roomId(b, x.no)] && geo.rooms[String(x.line).padStart(2, "0")]) : [];
    const svcBy = new Map(); svcRows().forEach(x => svcBy.set(x.id, x));   // [web] 청소 단계 띠
    const room = it => {
      const id = OPS.Rooms.roomId(b, it.no), s = roomState(id, st.rdate), ts = by.get(id) || [];
      const cs = svcBy.has(id) ? cleanStage(svcBy.get(id)) : null;
      const mx = mixAt.get(it.no), mixWarn = mx && mx.own !== "ours";   // [web] 객실 목록에는 있는데 룸 믹스에서는 우리 객실이 아님
      const cls = ["pr", s && s.stay ? "st-" + (STAY_CLS[s.stay] || "") : "", ts.length ? "has" : "", needIds.has(id) ? "need" : "", hotIds.has(id) ? "hot" : "", q && it.no.startsWith(q) ? "hit" : "", it.stray ? "stray" : "", cs ? "cs-" + cs.k : "", mixWarn ? "mixwarn" : ""].join(" ");
      const cx = it.x + it.w / 2;
      return `<g class="${cls}" data-room="${esc(id)}" role="button" aria-label="${esc(it.no)}호${ts.length ? ", 열린 업무 " + ts.length + "건" : ""}${needIds.has(id) ? ", 확인 필요" : ""}${cs ? ", 청소 " + esc(cs.t) : ""}">
        <rect class="bg" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="6"/>
        <rect class="bar" x="${it.x + 1}" y="${it.y + it.h - (cs ? 10 : 6)}" width="${it.w - 2}" height="${cs ? 9 : 5}" rx="2"/>
        <text class="no" x="${cx}" y="${it.y + it.h / 2 - 3}" text-anchor="middle">${esc(it.no)}</text>
        <text class="sy" x="${cx}" y="${it.y + it.h / 2 + 11}" text-anchor="middle">${cs ? CS[cs.k][0] + " " : ""}${s && s.stay ? esc(STAY_SHORT[s.stay] || s.stay) : ""}</text>
        ${ts.length ? `<circle class="bd" cx="${it.x + it.w - 4}" cy="${it.y + 4}" r="9"/><text class="bdt" x="${it.x + it.w - 4}" y="${it.y + 8}" text-anchor="middle">${ts.length}</text>` : ""}
        ${hasNote(id) ? `<circle class="nd" cx="${it.x + 8}" cy="${it.y + 8}" r="3.5"/>` : ""}
        ${mixWarn ? `<text class="mw" x="${it.x + 6}" y="${it.y + 16}">!</text>` : ""}${mx && mx.acc ? `<text class="acc" x="${it.x + it.w - 6}" y="${it.y + it.h - 14}" text-anchor="end">♿</text>` : ""}
      </g>`;
    };
    // [web] 타 운영사 칸: 흐리게, 누를 수 없음, 운영사 이름
    const other = x => {
      const g = geo.rooms[String(x.line).padStart(2, "0")], cx = g.x + g.w / 2;
      const nm = x.own === "ours" ? "목록 없음" : (mb.ops[x.code] && mb.ops[x.code].name) || x.code || "?";
      return `<g class="pr other ${x.own === "ours" ? "lost" : ""}" aria-label="${esc(x.no)}호 ${esc(nm)}"><title>${esc(x.no)}호 · ${esc(nm)}${x.acc ? " · 장애인 객실" : ""}</title>
        <rect class="bg" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="6"/>
        <text class="no" x="${cx}" y="${g.y + g.h / 2 - 3}" text-anchor="middle">${esc(x.no)}</text>
        <text class="sy" x="${cx}" y="${g.y + g.h / 2 + 12}" text-anchor="middle">${esc(g.w < 70 ? x.code : nm)}</text></g>`;
    };
    const feat = x => `<g class="pf ${esc(x.type || "")}"><rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" rx="4"/>${x.label ? `<text x="${x.x + x.w / 2}" y="${x.y + x.h / 2 + 4}" text-anchor="middle">${esc(x.label)}</text>` : ""}</g>`;
    return `<section class="card">
      <div class="rbar">
        ${multiB() ? `<div class="chips">${M.buildings.map(x => `<button type="button" data-pb="${esc(x.id)}" aria-pressed="${x.id === b}">${esc(x.name)}${needIn(x.id) ? ` <b class="nb">${needIn(x.id)}</b>` : ""}</button>`).join("")}</div>` : ""}
      </div>
      <div class="chips fls">${floors.map(x => `<button type="button" data-pf="${esc(x)}" aria-pressed="${x === f}">${esc(x)}F${needIn(b, x) ? ` <b class="nb">${needIn(b, x)}</b>` : ""}</button>`).join("")}</div>
      <div class="pv" id="pv" data-key="${esc(b + "|" + f)}" data-w="${L.w}" data-h="${L.h}">
        <div class="pz" id="pz"><svg width="${L.w}" height="${L.h}" viewBox="0 0 ${L.w} ${L.h}" xmlns="http://www.w3.org/2000/svg">${L.features.map(feat).join("")}${others.map(other).join("")}${L.items.map(room).join("")}</svg></div>
        <div class="zb"><button type="button" data-zoom="in" aria-label="확대">+</button><button type="button" data-zoom="out" aria-label="축소">−</button><button type="button" data-zoom="fit" aria-label="화면 맞춤">맞춤</button></div>
      </div>
      ${mb ? mixLegend(mb, fr.rooms, b) : ""}
      <p class="sub" style="margin-top:8px">${geo ? "분양 도면의 라인 위치입니다(본관 B동은 세로로 세워 그림). " : ""}${!mb && geo ? "설정에서 룸 믹스를 올리면 타 운영사 객실도 흐리게 함께 보입니다. " : ""}${L.auto ? "간이 배치(가운데 엘리베이터, 좌우 객실, 동별로 이어 붙임)입니다. 실제 배치도 사진을 받으면 이 층 모양으로 바뀝니다. " : ""}${L.stray ? `배치도에 없는 객실 ${L.stray}개는 아래쪽에 따로 놓았습니다. ` : ""}두 손가락으로 확대·축소, 끌어서 이동, 객실을 누르면 상세가 열립니다.</p>
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
    if (!idx && !L.length) return `<p class="w stay0">투숙 기간 정보 없음 · 예약표를 반영하면 입실일~퇴실일이 나옵니다.</p>`;
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
    const svx = demo ? null : svcRows().find(y => y.id === id);   // [web] 이 객실 오늘 청소
    const since = Date.now() - 864e5;
    const ids = new Set(all.map(t => t.id)), byId = new Map(all.map(t => [t.id, t]));
    const ev = st.events.filter(e => ids.has(e.taskId) && e.at >= since && e.action !== "확인").sort((a, b) => b.at - a.at).slice(0, 20);
    const n = st.notes[id] || {};
    const keepTxt = refresh && st.noteEdit && $("noteTxt") ? $("noteTxt").value : null;
    const canEdit = d => st.role === d && !demo;
    $("dlgBody").innerHTML = `<button type="button" class="x" id="dlgX" aria-label="닫기">×</button>
      ${demo ? `<p class="demo">예시 객실입니다. 실제 객실을 등록하면 이 자리에 그 객실 정보가 나옵니다.</p>` : ""}
      <h3>${multiB() ? esc(r.building) + " " : ""}${esc(r.no)}호 <span class="meta" style="font-weight:400">${esc(r.type || "")}${r.dong ? " · " + esc(r.dong) + "동" : ""}</span></h3>
      <div class="rs">${s && s.stay ? `<span class="chip ${STAY_CLS[s.stay] || ""}">${esc(stayName(s.stay))}</span>` : ""}${s && s.clean && !svx ? `<span class="chip k">${esc(kindName(s.clean))}${s.cleanFromSheet ? "" : " 예상"}</span>` : ""}${s && s.flags && s.flags.length ? s.flags.map(f => `<span class="chip warn">${esc(f)}</span>`).join("") : ""}</div>
      ${demo ? "" : (() => { const h = staySection(id, st.rdate); return `<div class="stayb ${h.includes("stay0") ? "empty" : ""}">${h}</div>`; })()}
      <div class="acts">
        ${!demo ? `<button type="button" class="btn" id="roomNew">이 객실로 보내기</button>` : ""}
        ${(st.role === "FO" || OPS.isMgr(st.role)) && !demo ? `<button type="button" class="btn" id="roomAdd">이 객실 예약 추가</button>` : ""}
      </div>
      ${demo ? "" : roomStepper(svx, r)}
      <h4>열린 업무 <span class="c">${open.length}</span>${open.length ? ` <button type="button" class="lnk" data-tab="work" style="font-weight:600">작업대에서 처리</button>` : ""}</h4>
      ${open.length ? `<div class="list">${open.map(t => { const nd = Core.needsAck(t, st.role), rc = readChip(t, st.events); return `<div class="task ${t.priority === "긴급" ? "hot" : ""} ${nd ? "need" : ""}" tabindex="0" data-open="${esc(t.id)}"><span class="t">${nd ? `<span class="unread">확인 필요</span> ` : ""}<span class="pri ${esc(t.priority)}">${esc(t.priority)}</span>${esc(t.title)}</span><span class="meta">${esc(OPS.kindName(t.kind))} · ${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · ${esc(t.status)} · ${esc(ago(t.createdAt))}${Core.isOverdue(t) ? ` · <span class="late">기한 초과</span>` : ""}${rc ? " · " + rc : ""}</span></div>`; }).join("")}</div>` : `<div class="w">열린 업무가 없습니다.</div>`}
      ${demo ? "" : roomHistory(id, all)}
      <h4>부서별 비고</h4>
      <div class="notes">${NOTE_DEPTS.map(d => { const x = n[d] || {}; const editing = st.noteEdit === d && canEdit(d);
        return `<div class="note ${canEdit(d) ? "mine" : ""}"><div class="nh"><b>${esc(OPS.deptName(d))}</b>${x.at ? `<span class="w" style="display:inline"> · ${esc(whoLine(Object.assign({ role: d }, x)))}</span>` : ""}${canEdit(d) && !editing ? `<button type="button" class="lnk" data-note-edit="${d}">${x.text ? "수정" : "쓰기"}</button>` : ""}</div>
        ${editing ? `<form id="noteForm" data-dept="${d}"><textarea id="noteTxt" maxlength="1000" rows="4">${esc(keepTxt != null ? keepTxt : x.text || "")}</textarea><div class="acts" style="margin:6px 0 0"><button class="btn main" type="submit">저장</button><button type="button" class="btn" data-note-cancel="1">취소</button></div></form>`
          : `<div class="nt">${x.text ? esc(x.text) : `<span class="w">비어 있음</span>`}</div>`}</div>`; }).join("")}</div>
      <p class="sub nguide">세 부서 모두 볼 수 있고, 각 부서는 자기 칸만 고칠 수 있습니다. 카드번호·비밀번호는 자동으로 가려집니다. 투숙객 이름·연락처는 적지 마십시오.</p>
      <h4>인수인계 정리 <span class="sub" style="font-weight:400">최근 24시간</span></h4>
      ${ev.length ? `<ol class="tl">${ev.map(e => { const t = byId.get(e.taskId); return `<li><b>${esc(e.action)}</b> ${esc(t ? t.title : "")}${e.to && e.action !== "댓글" ? ` <span class="w" style="display:inline">${esc(e.from ? e.from + " → " : "")}${esc(e.to)}</span>` : ""}${e.note ? `<br>${esc(e.note)}` : ""}<br><span class="w">${esc(whoLine(e))}</span></li>`; }).join("")}</ol>` : `<div class="w">최근 24시간 동안 이 객실의 처리 기록이 없습니다.</div>`}`;
    if (!$("dlg").open) $("dlg").showModal();
    if (st.noteEdit && $("noteTxt") && !refresh) $("noteTxt").focus();
  }
  // [web] 객실 이력: 이 객실의 끝난 업무(90일)·분실물·오늘 불출을 시간순으로. 30일 안에 같은 분류가 2번 이상이면 경고
  function roomHistory(id, all) {
    const now = Date.now(), d90 = now - 90 * 864e5, d30 = now - 30 * 864e5;
    const items = [];
    all.filter(t => !Core.isOpen(t) && (t.createdAt || 0) >= d90).forEach(t => items.push({ at: t.doneAt || t.updatedAt || t.createdAt, open: t.id,
      h: `<b>${esc(OPS.kindName(t.kind))}</b> ${esc(t.title)}${t.category ? ` <span class="chip k">${esc(t.category)}</span>` : ""} <span class="w" style="display:inline">${esc(t.status)}${t.doneAt ? " · " + esc(durTxt(t.doneAt - t.createdAt)) : ""}</span>` }));
    st.lost.filter(x => x.roomId === id).forEach(x => items.push({ at: x.at, h: `<b>분실물</b> ${esc(x.item)} <span class="w" style="display:inline">${esc(x.status)} · ${esc(x.place)}</span>` }));
    st.deliv.filter(d => d.roomId === id).forEach(d => items.push({ at: d.at, h: `<b>불출</b> ${esc(OPS.Desk.line(d))} <span class="w" style="display:inline">${esc(OPS.Desk.status(d))}</span>` }));
    items.sort((a, b) => b.at - a.at);
    const cats = {}; all.filter(t => t.category && (t.createdAt || 0) >= d30).forEach(t => { cats[t.category] = (cats[t.category] || 0) + 1; });
    const rep = Object.entries(cats).filter(([, n]) => n >= 2);
    return `<h4>객실 이력 <span class="sub" style="font-weight:400">끝난 업무 90일 · 분실물 · 오늘 불출</span></h4>
      ${rep.length ? `<p class="rhwarn">반복: 최근 30일 ${rep.map(([c, n]) => esc(c) + " " + n + "회").join(", ")}. 근본 원인 점검이 필요할 수 있습니다.</p>` : ""}
      ${items.length ? `<ol class="tl rhist">${items.slice(0, 30).map(x => `<li ${x.open ? `data-open="${esc(x.open)}" tabindex="0" class="rhl"` : ""}>${x.h}<br><span class="w">${esc(hm(x.at))}</span></li>`).join("")}</ol>` : `<div class="w">기록이 없습니다.</div>`}`;
  }
  // [web] 객실 상세의 단계 바: 지금 단계가 어디인지 보이고, 내 부서가 할 "다음 단계" 버튼 하나만 크게.
  // 같은 동작(퇴실 완료·청소 시작·점검 대기·입실 가능)을 청소·재실 목록과 똑같이 쓴다(따로 만든 흐름이 아님).
  // [web] 목록 줄에 붙이는 작은 단계 바(지금 어디인지만). 버튼은 그 줄의 버튼을 그대로 쓴다
  const OUT_STEPS = [["pre", "퇴실 전"], ["wait", "퇴실 완료"], ["ing", "청소 중"], ["chk", "점검 대기"], ["ok", "입실 가능"]];
  const outCur = s => s.done ? "ok" : s.cleaned ? "chk" : s.start ? "ing" : s.co ? "wait" : "pre";
  function miniSteps(x) {
    if (!x || x.type !== "out" || (x.s && x.s.ext)) return "";
    const ci = OUT_STEPS.findIndex(z => z[0] === outCur(x.s || {}));
    return `<ol class="steps mini" aria-label="단계 ${ci + 1}/5 ${esc(OUT_STEPS[ci][1])}">${OUT_STEPS.map(([k, t], i) => `<li class="${i < ci ? "past" : i === ci ? "now" : ""}"><i>${i < ci ? "✓" : i + 1}</i><span>${esc(t)}</span></li>`).join("")}</ol>`;
  }
  function roomStepper(x, r) {
    if (!x) return `<div class="stepw"><p class="sub" style="margin:0">${esc(st.rdate.slice(5).replace("-", "/"))} 이 객실은 청소 대상이 아닙니다(공실·입실만).</p></div>`;
    const s = x.s || {}, role = st.role, mg = OPS.isMgr(role), fo = role === "FO" || mg, hk = role === "HK" || mg, id = x.id;
    const btn = (act, label, main, extra) => `<button type="button" class="btn ${main ? "main big" : "sm"}" data-svc="${act}" data-id="${esc(id)}"${extra || ""}>${esc(label)}</button>`;
    let steps, cur, next = "", side = [], note = "";
    if (x.type === "out") {
      steps = OUT_STEPS; cur = outCur(s);
      if (s.ext) { note = "연장 객실입니다. 오늘은 청소하지 않습니다."; if (fo) side.push(btn("unext", "연장 취소")); }
      else if (cur === "pre") {
        if (fo) { next = btn("co", "손님 퇴실 → 퇴실 완료", true); side.push(`<span class="lt"><input type="time" id="lt-${esc(id)}" step="600" aria-label="레이트 체크아웃 시각">${btn("late", "레이트 체크아웃")}</span>`, btn("ext", "연장(오늘 청소 없음)")); }
        else if (hk) { next = btn("hkcostart", "손님 나감 확인 → 청소 시작", true); side.push(btn("stillin", "손님이 아직 있음")); }
        if (s.late) note = `레이트 체크아웃 ${s.late.time}`;
      } else if (cur === "wait") {
        if (hk) next = btn("start", "청소 시작", true); else note = "키핑이 청소를 시작하면 다음 단계로 넘어갑니다.";
        if (fo && !s.start) side.push(btn("unco", "퇴실 완료 취소"));
      } else if (cur === "ing") { if (hk) next = btn("cleaned", "청소 끝 → 점검 대기", true); else note = "청소 중입니다."; }
      else if (cur === "chk") { if (hk) next = btn("done", "점검 완료 → 입실 가능", true); else note = "점검을 기다리고 있습니다."; }
      else { note = "입실 가능합니다."; if (hk) side.push(btn("undone", "입실 가능 취소")); }
    } else {
      steps = [["req", "요청 입력"], ["todo", kindName(x.kind)], ["ok", "청소 완료"]];
      cur = s.done ? "ok" : OPS.Svc.hkTodo(x) ? "todo" : "req";
      if (!s.done && (fo || hk)) side.push(x.kind === "전체재실" ? btn("kindlite", "일반 청소로 바꾸기") : btn("kindfull", "전체 청소로 바꾸기"));
      if (s.kindSet && (fo || hk)) side.push(btn("kindauto", "자동(주기)으로 되돌리기"));
      if (x.force && !s.done) side.push(`<span class="kd force">${esc(String(x.day))}일째 장기 투숙 점검</span>`);
      if (cur === "req") { note = "손님 요청(시간대)이 없으면 청소하지 않습니다."; if (fo) next = `<button type="button" class="btn main big" data-stepreq="${esc(id)}">청소 요청 입력하기</button>`; }
      else if (cur === "todo") { note = s.reply && s.reply.window ? "요청 시간 " + s.reply.window : ""; if (hk) next = btn("done", kindName(x.kind) + " 끝 → 청소 완료", true); }
      else if (hk) side.push(btn("undone", "청소 완료 취소"));
    }
    const ci = steps.findIndex(z => z[0] === cur);
    return `<div class="stepw"><div class="steph"><b>${esc(st.rdate.slice(5).replace("-", "/"))} ${x.type === "out" ? "퇴실 청소" : "재실 · " + esc(kindName(x.kind))}</b>${ackLine(x) ? `<span class="svcl">${ackLine(x)}</span>` : ""}</div>
      <ol class="steps">${steps.map(([k, t], i) => `<li class="${i < ci ? "past" : i === ci ? "now" : ""}"><i>${i < ci ? "✓" : i + 1}</i><span>${esc(t)}</span></li>`).join("")}</ol>
      ${next ? `<div class="stepn">${next}</div>` : ""}${note ? `<p class="sub stepnote">${esc(note)}</p>` : ""}${side.length ? `<div class="steps2">${side.join("")}</div>` : ""}
      <p class="sub" style="margin:6px 0 0">잘못 누르면 화면 아래 "되돌리기"를 6초 안에 누르십시오. 목록으로 한꺼번에 처리하려면 <button type="button" class="lnk" id="goSvc">청소·재실</button>.</p></div>`;
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
    if (st.role !== "MG") return `<section class="card later-box"><h2>설정</h2><p class="sub">SYSTEM OWNER에서만 열립니다. 지점·객실·직원·분류 설정은 프로그램 관리자(소유자) 전용입니다${st.role === "MN" ? ". 매니지먼트는 업무·통계·청소·불출은 모두 다룰 수 있습니다" : ""}.</p></section>`;
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
          <div class="row2"><label class="f">주간 근무 시작(자동 밝기·인수 기준)<input id="sDay" type="time" value="${esc(S.dayStart || OPS.CTX.dayStart)}"></label>
          <label class="f">어두운 화면 시작(자동 밝기)<input id="sNight" type="time" value="${esc(S.nightStart || OPS.CTX.nightStart)}"></label></div>
          <div class="row2"><label class="f">재실 전체 청소 주기(일)<input id="sCycle" type="number" min="2" max="14" value="${esc(String(S.stayCycle || 3))}"></label>
          <label class="f">장기 투숙 점검(요청 없어도 전체 청소, 일)<input id="sForce" type="number" min="3" max="30" value="${esc(String(S.forceDays || 7))}"></label></div>
          <p class="sub" style="margin:-4px 0 8px">주기는 다음에 예약표를 올릴 때부터 적용됩니다. 처음 쓸 때는 지난 청소표를 몇 장 올려 두면 그 날짜를 기준으로 전체 청소 날이 맞춰집니다.</p>
          <label class="f">비번 변경 담당 (비밀번호 제공 객실 퇴실 시)<select id="sPw">${OPS.DEPTS.filter(d => d.id !== "MG").map(d => `<option value="${d.id}" ${(S.pwDept || OPS.CTX.pwDept) === d.id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></label>
          <button class="btn main" type="submit">저장</button>
        </form></section>
      ${mixCard()}
      <section class="card"><h2>동과 객실 <span class="c">${M ? Object.keys(M.rooms).length : 0}실</span></h2>
        <p class="sub">${blds.length ? blds.map(b => { const n = Object.values(M.rooms).filter(r => r.b === b.id).length, sale = saleCount(M, b.id); return `${esc(b.name)} ${n}실(판매 ${sale}${n - sale ? " · 비판매 " + (n - sale) : ""})`; }).join(" · ") : "등록된 동이 없습니다."}${M && M.src && M.src.reservation ? ` · 예약표 ${esc(M.src.reservation.file)} (${esc(hm(M.src.reservation.at))})` : ""}</p>
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
  // [web] 설정: 룸 믹스 올리기(관리자). 파일 내용은 DB(property 모음의 mix 문서)에만 저장한다
  function mixCard() {
    const X = st.mix, M = st.master;
    const cmp = X && M ? OPS.RoomMix.compare(X, M) : [];
    return `<section class="card"><h2>룸 믹스 (건물 전체 운영 현황)</h2>
      <p class="sub">본관·신관 시트가 있는 Room_Mix 엑셀을 올리면 층 배치도와 건물 배치도에 타 운영사 객실이 흐리게 함께 보입니다. 위탁 객실이 바뀌면 새 파일을 다시 올려 주십시오(이전 것을 덮어씁니다).</p>
      ${X ? `<p class="sub">지금: <b>${esc(X.file || "")}</b> · ${esc(hm(X.at))} · ${esc(X.by || "")}<br>${X.buildings.map(b => `${esc(b.name)} 전체 ${b.count.ours + b.count.other + b.count.unknown}실 = 우리 ${b.count.ours} + 타 운영사 ${b.count.other}${b.count.unknown ? ` + 모르는 코드 ${b.count.unknown}` : ""}`).join(" / ")}</p>
        ${cmp.map(c => c.missingBuilding ? `<p class="mixw">${esc(c.name)}: 객실 목록에 같은 이름의 동이 없습니다.</p>` : (c.notInList.length || c.notOurs.length) ? `<p class="mixw">${esc(c.name)} 대조: 객실 목록 ${c.listed}실 / 룸 믹스 우리 객실 ${c.ours}실.${c.notOurs.length ? ` 목록에만 있음(엑셀에선 타 운영사): ${c.notOurs.map(x => esc(x.no) + (x.code ? "(" + esc(x.code) + ")" : "")).join(", ")}.` : ""}${c.notInList.length ? ` 엑셀에만 있음: ${c.notInList.map(esc).join(", ")}.` : ""}</p>` : `<p class="sub">${esc(c.name)}: 객실 목록 ${c.listed}실과 룸 믹스 우리 객실이 일치합니다.</p>`).join("")}` : ""}
      <label class="btn">${X ? "새 룸 믹스 올리기" : "룸 믹스 엑셀 고르기"}<input type="file" id="mixFile" accept=".xlsx,.xls" hidden></label>
      <div class="msg" id="mixMsg" aria-live="polite">${esc(st.mixMsg || "")}</div></section>`;
  }
  async function loadMix(file) {
    const say = t => { st.mixMsg = t; const m = $("mixMsg"); if (m) m.textContent = t; };
    try {
      say("읽는 중…");
      const r = await OPS.RoomMix.readFile(file), a = actor();
      const doc = { file: r.file, at: Date.now(), by: a.name || "", uid: a.uid || "", propertyId: OPS.CTX.propertyId, buildings: r.buildings };
      await Store.set(COL.property, "mix", doc);
      st.mix = Object.assign({ id: "mix" }, doc);
      say("올렸습니다: " + r.buildings.map(b => `${b.name} 우리 ${b.count.ours} · 타 운영사 ${b.count.other}`).join(" / "));
    } catch (e) { say("룸 믹스를 읽지 못했습니다: " + (e && e.message || e)); }
    render();
  }
  function applySettings(S) {
    st.settings = S || null;
    S = S || {};
    OPS.CTX.propertyId = S.propertyId || "p1";
    OPS.CTX.propertyName = S.propertyName || "";
    OPS.CTX.dayStart = S.dayStart || "08:00";   // [web] 주간 근무 시작 08:00
    OPS.CTX.nightStart = S.nightStart || "22:00";
    OPS.CTX.pwDept = S.pwDept || "FM";
    OPS.CTX.stayCycle = +S.stayCycle || 3; OPS.CTX.forceDays = +S.forceDays || 7;   // [web] 재실 전체 청소 주기 · 장기 투숙 점검
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
    const mineT = t => OPS.isMgr(st.role) || (t && (t.fromDept === st.role || t.toDept === st.role));
    const ev = st.events.filter(e => mineT(byId.get(e.taskId))).sort((a, b) => b.at - a.at).slice(0, 150);
    const rows = ev.map(e => {
      const t = byId.get(e.taskId);
      const what = e.field ? `${esc(e.field)}: ${esc(e.from)} → ${esc(e.to)}` : e.from || e.to ? `${esc(e.from || "")}${e.from ? " → " : ""}${esc(e.to)}` : "";
      return `<tr><td class="st">${esc(hm(e.at))}</td><td>${esc(nameOf(e.uid, e.by))}<br><span class="sub">${esc(OPS.deptName(e.role))}</span></td><td>${esc(e.action)}</td><td>${t ? `<a href="#${esc(st.role.toLowerCase())}" data-open="${esc(t.id)}">${esc(t.room ? t.room + " · " : "")}${esc(t.title)}</a>` : "(삭제된 업무)"}</td><td>${what}${e.note ? `<br><span class="sub">${esc(e.note)}</span>` : ""}</td></tr>`;
    }).join("");
    return `<section class="card"><h2>변경 이력 <span class="c">${st.events.length}</span></h2><p class="sub">${OPS.isMgr(st.role) ? "모든 등록·상태 이동·수정·댓글. 최근 150건." : esc(OPS.deptName(st.role)) + "가 요청했거나 받은 업무의 이력만 보입니다. 최근 150건."}</p>
      ${ev.length ? `<div class="scroll"><table><thead><tr><th>시각</th><th>작성자</th><th>동작</th><th>업무</th><th>내용</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">아직 기록이 없습니다.</div>`}</section>`;
  }

  function laterView(id) {
    const t = TABS.find(x => x.id === id);
    return `<section class="card later-box"><h2>${esc(t.name)}</h2><p class="sub">${esc(t.later)}에서 구현합니다. 데이터 자리는 이미 잡혀 있습니다.</p><ul>${LATER[id].map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>`;
  }

  // ---------- 그리기 ----------
  // ---------- 잠금 화면(v0.20) ----------
  // 로그인 화면으로 돌아가지 않는다. 큰 시계와 부서별 할 일 숫자만 보이고, 객실 번호·내용은 가린다.
  // 풀 때 "누가 씁니까"에서 부서를 고르면 바로 그 부서 화면으로 열린다. 보안 장치가 아니라 공용 기기 가림막이다.
  function lockOn(on) {
    if (on && OPS.Auth) { OPS.Auth.lock(); return; }   // [web] 잠금은 로그아웃(PIN 화면으로)
    st.locked = !!on; mem.set("locked", on ? "1" : "");
    if (on) { drawer(false); try { if ($("dlg").open) $("dlg").close(); } catch (e) {} st.svcEdit = null; }
    lockView(); if (!on) render();
  }
  function lockView() {
    const L = $("lock"), sh = document.querySelector(".shell"), hd = document.querySelector("header"), ft = document.querySelector("footer");
    if (!L) return;
    [sh, hd, ft].forEach(x => { if (x) x.inert = !!st.locked; });
    document.body.classList.toggle("locked", !!st.locked);
    if (!st.locked) { L.hidden = true; L.innerHTML = ""; return; }
    // v0.21: 첫 화면은 부서 고르기만. 숫자·객실 정보는 없다. 관리자는 오른쪽 위 전용 입구
    const showAdmin = adminOk();
    L.innerHTML = `<div class="lkbar">${showAdmin ? `<button type="button" class="lkadmin" data-unlock="MG">${icon("MG", 20)}<span>관리자</span></button>` : ""}</div>
      <div class="lk">
      <div class="lkhead"><b>OPS</b><span>${esc(OPS.CTX.propertyName ? OPS.CTX.propertyName + " · " : "")}통합 업무 시스템</span><span class="lkt" data-noi18n id="lockD"></span></div>
      <p class="lkq">부서를 선택해 주십시오</p>
      <div class="lkd">${STAFF_DEPTS().map(d => `<button type="button" data-unlock="${d.id}" class="lk-${d.id}"><span class="ic">${icon(d.id, 48)}</span><b>${esc(d.name)}</b><small>${esc(d.en)}</small></button>`).join("")}</div>
      ${st.me ? `<p class="lkf">로그인: ${esc(nameOf(st.me.id, "") || "계정")}</p>` : ""}
    </div>`;
    L.hidden = false;
    tickClock();
  }
  function enterAs(r) {
    if (r === "MG" && !adminOk()) { flash("관리자 화면은 이 시스템 소유자만 들어갈 수 있습니다."); return; }
    st.locked = false; mem.set("locked", ""); try { sessionStorage.setItem("opsEntered", "1"); } catch (e) {}
    lockView(); switchRole(r);
  }
  // 실시간 수신이 한꺼번에 여러 번 와도 화면은 한 프레임에 한 번만 다시 그린다(v0.20). 숨긴 탭에서는 돌아올 때 그린다.
  let soonId = 0;
  function soon() { if (soonId) return; const f = () => { soonId = 0; render(); }; soonId = (window.requestAnimationFrame || (fn => setTimeout(fn, 16)))(f); }
  function switchRole(r) { if (!canRole(r)) { flash(OPS.deptName(OPS.Auth.dept) + " 로그인은 다른 부서로 바꿀 수 없습니다. 잠금 후 해당 부서 계정으로 들어오십시오."); return; } st.role = r;   /* [web] */ fitTab(); mem.set("role", st.role); history.replaceState(null, "", "#" + st.role.toLowerCase()); st.formTo = null; render(); toTop(); }

  // ---------- 야간 검수(NIGHT AUDIT) 연결(v0.20) ----------
  // 프론트·관리자 = 서초 직원용. 이 시스템 소유자에게는 관리자용도 보인다. 열리는지는 각 화면의 공유 설정이 정한다.
  const NA_LINKS = { staff: "https://claude.ai/artifact/B4G15SSoyixAr1EscfmZtn", admin: "https://claude.ai/artifact/Ju83Y5zkPHigfGubuHL7ZS" };
  function extLinks() {
    const box = $("extLinks"), h = $("extH"); if (!box) return;
    const show = st.role === "FO" || OPS.isMgr(st.role);
    box.hidden = !show; if (h) h.hidden = !show;
    if (!show) { box.innerHTML = ""; return; }
    const a = (url, t, sub) => `<a class="extlink" href="${url}" target="_blank" rel="noopener noreferrer"><span>${esc(t)}<small>${esc(sub)}</small></span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>`;
    box.innerHTML = a(NA_LINKS.staff, "야간 검수 (직원용)", "UHC NIGHT AUDIT SEOCHO · 새 창") + (st.owner ? a(NA_LINKS.admin, "야간 검수 (관리자용)", "소유자에게만 보임 · 새 창") : "");
  }

  function render() {
    renderHead();
    extLinks();
    connBanner();
    const mine = t => OPS.isMgr(st.role) || (t.toDept === st.role && t.status !== "완료 대기") || (t.fromDept === st.role && t.status === "완료 대기");
    const hot = st.tasks.filter(t => Core.isOpen(t) && t.priority === "긴급" && t.status !== "보류" && mine(t));
    const a = $("alert");
    a.style.display = hot.length ? "block" : "none";
    a.textContent = hot.length ? `긴급 ${hot.length}건: ` + hot.slice(0, 3).map(t => (t.room ? t.room + " " : "") + t.title).join(" / ") + (hot.length > 3 ? " 외" : "") : "";
    const keep = document.activeElement && document.activeElement.closest && document.activeElement.closest("#newForm") ? captureForm() : null;
    const rqFocus = document.activeElement && (document.activeElement.id === "rq" || document.activeElement.id === "lSearch" || document.activeElement.id === "ibQ" || document.activeElement.id === "aq") ? document.activeElement.id : null;
    svcSubscribe();
    const keepD = keepInputs();
    // 현황판이 바탕화면. 다른 화면은 위에 "현황판" 돌아가기 줄을 붙인다
    const tabName = (TABS.find(t => t.id === st.tab) || {}).name || "";
    const back = st.tab === "board" ? "" : `<div class="backbar"><button type="button" class="home" data-tab="board"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>현황판</button><h1>${esc(tabName)}</h1></div>`;
    $("view").innerHTML = dropMsgHtml() + back + (st.tab === "dash" ? dashView() : st.tab === "board" ? boardView() : st.tab === "inbox" ? inboxView() : st.tab === "svc" ? svcView() : st.tab === "desk" ? deskView() : st.tab === "work" ? hubView() : st.tab === "log" ? logView() : st.tab === "rooms" ? archView() : st.tab === "settings" ? settingsView() : laterView(st.tab));
    if (keep) restoreForm(keep);
    restoreInputs(keepD);
    if (rqFocus && $(rqFocus)) { const i = $(rqFocus); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (st.tab === "board" && st.bMode === "plan" && !st.bf) initPlan();
    if ($("dlg").open && st.openId) openTask(st.openId, true);
    else if ($("dlg").open && st.openRoomId) openRoom(st.openRoomId, true);
    if (st.prefill && st.tab === "work" && ($("fRoom") || $("dqNo"))) {
      if ($("fRoom")) { if ($("fBld") && st.prefill.b) $("fBld").value = st.prefill.b; $("fRoom").value = st.prefill.no; $("fTitle").focus(); }
      else { if ($("dqB") && st.prefill.b) $("dqB").value = st.prefill.b; $("dqNo").value = st.prefill.no; }
      st.prefill = null;
    }
    if (st.locked) lockView();
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
      <div class="meta">${esc(OPS.kindName(t.kind))}${t.category ? " · " + esc(t.category) : ""} · ${esc(OPS.deptName(t.fromDept))} → ${esc(OPS.deptName(t.toDept))} · <b>${esc(t.status)}</b> · 등록 ${esc(whoLine({ uid: t.createdUid, by: t.createdBy, role: t.createdRole || t.fromDept, at: t.createdAt }))}${t.doneAt ? " · 완료 " + esc(hm(t.doneAt)) : ""}${readChip(t, st.events) ? " · " + readChip(t, st.events) : ""}</div>
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
    { const ak = e.target.closest("[data-ak]"); if (ak && ak.dataset.tab) { st.ak = ak.dataset.ak; st.as = "all"; st.ac = ""; } }
    const ul = e.target.closest("[data-unlock]");
    if (ul) { enterAs(ul.dataset.unlock); return; }
    if (e.target.closest("#adminBtn")) { if (st.role === "MG") return; enterAs("MG"); return; }
    if (e.target.closest("#lockBtn")) { lockOn(true); return; }
    const r = e.target.closest("[data-role]");
    if (r) { if (r.dataset.role === "MG" && !adminOk()) { flash("관리자 화면은 이 시스템 소유자만 들어갈 수 있습니다."); return; } switchRole(r.dataset.role); return; }
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
    if (sv && sv.tagName !== "INPUT") { if (STAGE_ACTS[sv.dataset.svc] && canStage()) stageAct(sv.dataset.svc, sv.dataset.id); else svcAct(sv.dataset.svc, sv.dataset.id, sv); return; }   // [web] 청소 단계는 되돌리기와 함께
    if (e.target.id === "goSvc") { st.openRoomId = null; $("dlg").close(); st.tab = "svc"; render(); return; }
    const sq = e.target.closest("[data-stepreq]");
    // [web] 청소 요청 입력하기: 청소·재실로 가서 그 호실 입력 칸을 펼쳐(단락이 접혀 있어도) 가운데로 올리고 시작 시각에 커서를 둔다
    if (sq) {
      const id = sq.dataset.stepreq, rr = boardM().rooms[id];
      st.openRoomId = null; $("dlg").close(); st.tab = "svc"; if (rr) st.svcB = rr.b; st.svcEdit = id; render();
      setTimeout(() => {
        const inp = $("rf-" + id), row = inp && inp.closest(".srow");
        if (!row) { flash((rr ? rr.no + "호 " : "") + "청소 요청 입력 칸을 찾지 못했습니다. 목록에서 직접 눌러 주십시오."); return; }
        jumpTo(row, "center");
        try { inp.focus({ preventScroll: true }); } catch (e2) {}
      }, 50);
      return;
    }
    const sg = e.target.closest("[data-svgo]");
    if (sg) { svGo(sg.dataset.svgo); return; }
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
    const svb = e.target.closest("[data-svcb]"); if (svb) { st.svcB = svb.dataset.svcb; render(); return; }
    const rbb = e.target.closest("[data-rb]");
    if (rbb) { st.rb = rbb.dataset.rb; render(); return; }
    const ch = e.target.closest("[data-filter]");
    if (ch) { st.filter = ch.dataset.filter; render(); return; }
    // [web] 작업대: 종류 거르기 · 보낼 종류 고르기(적던 객실·내용은 그대로 옮긴다)
    // [web] 보관함 거르기
    const akb = e.target.closest("[data-ak]");
    if (akb && !akb.dataset.tab) { st.ak = akb.dataset.ak; st.ac = ""; st.aMore = false; render(); return; }
    const apb = e.target.closest("[data-ap]"); if (apb) { st.ap = apb.dataset.ap; st.aMore = false; render(); return; }
    const asb = e.target.closest("[data-as]"); if (asb) { st.as = asb.dataset.as; render(); return; }
    const acb = e.target.closest("[data-ac]"); if (acb) { st.ac = st.ac === acb.dataset.ac ? "" : acb.dataset.ac; render(); return; }
    const arb = e.target.closest("[data-aroom]"); if (arb) { st.aq = arb.dataset.aroom; render(); return; }
    if (e.target.closest("[data-amore]")) { st.aMore = true; render(); return; }
    const hf = e.target.closest("[data-hf]");
    if (hf) { st.hf = hf.dataset.hf; render(); return; }
    if (e.target.closest("[data-handoff]")) { handoff(); return; }
    const sd = e.target.closest("[data-send]");
    if (sd) { switchSend(sd.dataset.send, true); return; }
    const p = e.target.closest("[data-pri]");
    if (p) { st.formPri = p.dataset.pri; document.querySelectorAll("#fPri button").forEach(b => b.setAttribute("aria-pressed", b.dataset.pri === st.formPri)); return; }
    const act = e.target.closest("[data-act]");
    if (act) { e.stopPropagation(); doMove(act.dataset.id, act.dataset.act, act); return; }
    if (e.target.id === "dlgX") { $("dlg").close(); return; }
    const op = e.target.closest("[data-open]");
    if (op) { e.preventDefault(); openTask(op.dataset.open); }
  });
  document.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".task, .arow[data-open], .rhl")) { e.preventDefault(); openTask(e.target.dataset.open); }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "mixFile" && e.target.files.length) { const f = e.target.files[0]; e.target.value = ""; loadMix(f); return; }
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
    // 자동 잠금: 이 기기에서 정한 시간 동안 아무도 만지지 않으면(입력 중·창 열림이면 기다림)
    const al = +mem.get("autoLock", "0");
    if (al && !st.locked && Date.now() - lastTouch > al * 60000 && !($("dlg") && $("dlg").open) && !st.svcEdit) {
      const ae = document.activeElement;
      if (!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) lockOn(true);
    }
    if ($("lockD")) { $("lockD").textContent = p2(d.getHours()) + ":" + p2(d.getMinutes()) + " · " + (en ? (WD_EN[d.getDay()] + ", " + (d.getMonth() + 1) + "/" + d.getDate()) : ((d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + WD_KO[d.getDay()] + ")")); }
    const day = (d.getMonth() + 1) + "/" + d.getDate() + " (" + (en ? WD_EN : WD_KO)[d.getDay()] + ")";
    const rolled = OPS.ymd(d) !== openDay;
    const cd = $("clockD");
    if (cd) {
      const key = day + rolled + en;
      if (cd.dataset.k !== key) {
        cd.dataset.k = key;
        cd.innerHTML = esc(day) + (rolled ? `<button type="button" class="roll" id="clockRoll" title="${en ? "The date changed. Reload to switch today's lists to the new day." : "날짜가 바뀌었습니다. 다시 열면 오늘 기준 목록으로 바뀝니다."}">${en ? "Reload" : "다시 열기"}</button>` : "");
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
  document.addEventListener("input", e => { if (e.target.id === "fTitle" && st.tab === "work") sendHint(e.target.value); if (e.target.id === "aq") { st.aq = e.target.value; render(); } if (e.target.id === "rq") { st.rq = e.target.value; render(); } if (e.target.id === "lSearch") { st.lq = e.target.value; render(); } if (e.target.id === "ibQ") { st.ibQ = e.target.value; render(); } });
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
        st.fErr = false; st.fMsg = st.tab === "work" ? "보냈습니다. 받는 부서 작업대에 바로 뜹니다." : "등록했습니다.";   // [web] 다시 그려도 남게
        msg.className = "msg"; msg.textContent = st.fMsg;
        st.sendPicked = false; st.sendRoom = null; sendHint("");
        $("fTitle").focus();
      } catch (err) { st.fErr = true; st.fMsg = err.message; msg.className = "msg err"; msg.textContent = err.message; }
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
        await saveSettings({ propertyName: $("sName").value.trim().slice(0, 40), propertyId: pid, dayStart: $("sDay").value, nightStart: $("sNight").value, pwDept: $("sPw").value, stayCycle: Math.max(2, Math.min(14, +$("sCycle").value || 3)), forceDays: Math.max(3, Math.min(30, +$("sForce").value || 7)) });
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
    if (OPS.DEPTS.some(d => d.id === h) && h !== st.role && (h !== "MG" || adminOk()) && canRole(h)) { st.role = h; fitTab(); render(); }
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
  if ($("autoLock")) { $("autoLock").value = mem.get("autoLock", "0"); $("autoLock").addEventListener("change", e => { mem.set("autoLock", e.target.value); }); }
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
        try { st.owner = typeof UAPI.isOwner === "function" ? !!(await UAPI.isOwner()) : false; } catch (e) { st.owner = false; }
        if (st.role === "MG" && !st.owner) { st.role = "FO"; mem.set("role", "FO"); history.replaceState(null, "", "#fo"); }
        extLinks(); renderHead(); if (st.locked) lockView();
      }
    } catch (e) { UAPI = null; }
    st.uReady = true;
    if (st.role === "MG" && !adminOk()) { st.role = "FO"; mem.set("role", "FO"); history.replaceState(null, "", "#fo"); }
    renderHead(); if (st.locked) lockView();
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
    Store.watch(COL.tasks, list => { st.tasks = list; soon(); }, err);
    Store.watch(COL.events, list => { st.events = list; if (st.tab === "log" || st.openId) soon(); }, err);
    Store.watch(COL.settings, list => { applySettings(list.find(x => x.id === "main")); soon(); }, err);
    Store.watch(COL.manualStays, list => { st.manual = list; soon(); }, err);
    Store.watch(COL.stayIndex, list => { st.stayIdx = list.find(x => x.id === "main") || null; if (st.openRoomId && $("dlg").open) openRoom(st.openRoomId, true); }, err);
    // [web] 불출 = 오늘 것 + 날짜가 지나도 안 끝난 것(어젯밤 요청이 자정에 사라지지 않게). 재고 = 오늘 문서. 분실물은 전체(건수가 적다)
    // "오늘"은 앱을 켠 시각에 고정하지 않는다: 1분마다 날짜를 보고 바뀌면 다시 거른다
    Store.watch(COL.deliveries, list => { st.delivAll = list; dayFilter(); if (st.tab === "work" || st.tab === "rooms" || st.tab === "board" || st.tab === "dash") soon(); }, err);
    Store.watch(COL.stock, list => { st.stockAll = list; dayFilter(); if (st.tab === "desk" || st.tab === "svc") soon(); }, err);
    Store.watch(COL_HO, list => { st.handoffs = list; if (st.tab === "work") soon(); }, err);   // [web] 인수 확인 기록
    setInterval(() => {
      const t = OPS.ymd(Date.now());
      if (t !== st.today) { const old = st.today; st.today = t; if (st.rdate === old) st.rdate = t; dayFilter(); render(); }
      else if (st.tab === "work") soon();   // "넘어온 것"은 근무 시작 시각이 지나면 바뀐다
    }, 60000);
    Store.watch(COL.lostFound, list => { st.lost = list; if (st.tab === "desk" || st.tab === "dash" || st.openRoomId) soon(); }, err);
    Store.watch(COL.roomNotes, list => { const o = {}; list.forEach(x => { o[x.id] = x; }); st.notes = o; if (st.tab === "board" || st.openRoomId) soon(); }, err);
    Store.watch(COL.staff, list => { st.staff = list; soon(); }, err);
    Store.watch(COL.property, list => { const m = list.find(x => x.id === "main"); st.master = m && m.rooms ? m : null; st.mix = list.find(x => x.id === "mix") || null; computeNS(); soon(); }, err);   // [web] mix = 룸 믹스(건물 전체 운영 현황)
    Store.watch(COL.roomDays, list => { const o = {}; list.forEach(x => { o[x.id] = x; }); st.days = o; if (st.tab === "rooms" || st.tab === "board" || st.tab === "dash") soon(); }, err);
  })();
}
