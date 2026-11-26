/* 로그인. 로그인 전에는 업무 화면 스크립트를 불러오지 않는다.
   1) 개인 계정: 아이디 + PIN 6자리 → 서버 함수 login(잠금 검사) → 세션
      첫 로그인(임시 PIN)이면 새 PIN을 정하기 전에는 다른 화면을 쓸 수 없다.
   2) 부서 공용 PIN(4자리): 병행 기간에만(config.legacyDeptLogin)
   - 프로그램 관리자는 모든 부서, 나머지는 자기 부서로 고정
   - 화면 조작이 없으면 설정한 시간 뒤 자동 잠금 */
(function () {
  const CFG = window.OPS_CONFIG;
  const OPS = window.OPS = window.OPS || {};
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "ops-auth-" + CFG.env } });
  OPS.SB = sb;
  const FN = CFG.supabaseUrl + "/functions/v1/";
  const APP_SCRIPTS = window.OPS_APP_SCRIPTS || [];
  // 앱 부서(v0.23): 프론트·키핑·시설·매니지먼트(MN) + 관리자(MG = 프로그램 관리자 전용)
  const DEPTS = ["FO", "HK", "FM", "MN", "MG"];
  // 시험 환경은 화면 맨 위에 늘 경고 띠를 보인다(운영과 헷갈리지 않게)
  if (CFG.env !== "prod") {
    const strip = document.createElement("div");
    strip.className = "envstrip"; strip.textContent = "시험 환경 — 실제 운영 데이터가 아닙니다. 운영 주소: lee13-netizen.github.io/uhflat-ops";
    document.body.prepend(strip); document.body.classList.add("has-envstrip");
  }
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = id => document.getElementById(id);

  async function callFn(name, body, token) {
    const h = { "Content-Type": "application/json", apikey: CFG.supabaseKey };
    if (token) h.Authorization = "Bearer " + token;
    let r;
    try { r = await fetch(FN + name, { method: "POST", headers: h, body: JSON.stringify(body || {}) }); }
    catch (e) { return { status: 0, data: { error: "인터넷 연결을 확인해 주십시오." } }; }
    let data = {}; try { data = await r.json(); } catch (e) {}
    return { status: r.status, data };
  }
  OPS.callFn = async (name, body) => { const { data: s } = await sb.auth.getSession(); return callFn(name, body, s && s.session && s.session.access_token); };

  // ---------- 세션 → OPS.Auth ----------
  async function personalProfile(user) {
    const { data } = await sb.from("profiles").select("user_id, login_id, name, title, role, active, must_change_pin, dept_id, departments(code, name)").eq("user_id", user.id).maybeSingle();
    return data && data.active ? data : null;
  }
  async function setSession(user) {
    const prof = await personalProfile(user);
    if (prof) {
      const owner = prof.role === "super_admin";
      let dept = prof.departments && DEPTS.includes(prof.departments.code) ? prof.departments.code : "FO";
      if (dept === "MG" && !owner) dept = "MN";              // 관리자(MG) 화면은 프로그램 관리자만
      OPS.Auth = { kind: "personal", uid: user.id, login_id: prof.login_id, name: prof.name, title: prof.title, role: prof.role, dept, deptName: prof.departments ? prof.departments.name : dept, owner, admin: owner || prof.role === "dept_admin", allowed: owner ? DEPTS.slice() : [dept], mustChangePin: prof.must_change_pin, lock };
      installUserApi(prof);
    } else {
      const m = user.app_metadata || {};
      if (!["FO", "HK", "FM", "MG"].includes(m.dept)) return false;   // 부서 계정도 개인 계정도 아님
      const owner = m.owner === true;
      const dept = m.dept === "MG" ? (owner ? "MG" : "MN") : m.dept;    // 공용 '관리' 계정 = 매니지먼트
      const acc = CFG.accounts.find(a => a.email === user.email) || {};
      OPS.Auth = { kind: "legacy", uid: user.id, dept, owner, admin: false, legacyOwner: owner, label: acc.label || dept, allowed: owner ? DEPTS.slice() : [dept], lock };
    }
    const A = OPS.Auth;
    try {
      const cur = (localStorage.getItem("opsFrameUi:role") || "").toUpperCase();
      if (!A.owner || !DEPTS.includes(cur)) localStorage.setItem("opsFrameUi:role", A.dept);
    } catch (e) {}
    const h = location.hash.slice(1).toUpperCase();
    if (!A.owner && h && h !== A.dept) history.replaceState(null, "", "#" + A.dept.toLowerCase());
    return true;
  }

  // 앱의 "로그인 사용자" 창구(원래 claude.ai용)를 직원 정보로 채운다 → 기록에 사용자 ID가 자동으로 남고 이름이 보인다
  function installUserApi(prof) {
    const cache = {};
    const api = {
      id: async () => prof.user_id,
      me: async () => ({ id: prof.user_id, name: prof.name }),
      profiles: async ids => {
        const need = (ids || []).filter(i => i && !(i in cache));
        if (need.length) {
          const { data } = await sb.from("profiles").select("user_id, name, title").in("user_id", need);
          need.forEach(i => { cache[i] = null; });
          (data || []).forEach(p => { cache[p.user_id] = { name: p.name + (p.title ? " " + p.title : "") }; });
        }
        const out = {}; (ids || []).forEach(i => { if (cache[i]) out[i] = cache[i]; }); return out;
      },
      can: async () => true,
      isOwner: async () => prof.role === "super_admin"     // 야간 검수 관리자용 바로가기 등
    };
    window.claude = { use: async k => (k === "user" ? api : null) };
  }

  // ---------- 앱 시작 ----------
  let started = false;
  function startApp() {
    if (started) return; started = true;
    $("gate").hidden = true;
    document.body.classList.remove("gated");
    (function next(i) {
      if (i >= APP_SCRIPTS.length) { afterApp(); return; }
      const s = document.createElement("script");
      s.src = APP_SCRIPTS[i];
      s.onload = () => next(i + 1);
      s.onerror = () => { alert("화면 파일을 불러오지 못했습니다: " + s.src); };
      document.body.appendChild(s);
    })(0);
  }
  function afterApp() {
    addHeader();
    startIdle();
    if (window.OPS_STAFF && (OPS.Auth.admin || OPS.Auth.legacyOwner)) window.OPS_STAFF.mount();
    if (window.OPS_HEADER) setTimeout(() => window.OPS_HEADER.mount(), 0);
  }
  function addHeader() {
    const me = document.querySelector(".me");
    if (document.getElementById("loginWho")) return;
    if (!me) { setTimeout(addHeader, 300); return; }
    const A = OPS.Auth;
    const who = document.createElement("span");
    who.className = "badge"; who.id = "loginWho";
    who.textContent = A.kind === "personal"
      ? A.name + (A.title ? " " + A.title : "") + " · " + A.deptName + (A.owner ? " (프로그램 관리자)" : A.role === "dept_admin" ? " (부서 관리자)" : "")
      : "부서 공용: " + A.label + (A.owner ? " (모든 부서)" : "");
    me.prepend(who);
    if (CFG.env !== "prod") { const e = document.createElement("span"); e.className = "badge envBadge"; e.textContent = CFG.name + " 환경"; me.prepend(e); }
    // 개인 계정은 작성자 이름을 계정 이름으로 고정
    const nm = $("myName");
    if (A.kind === "personal" && nm) { nm.value = A.name; nm.readOnly = true; nm.title = "로그인한 계정 이름"; nm.hidden = true; }
    if (A.kind === "personal") {
      const pb = document.createElement("button"); pb.type = "button"; pb.className = "tgl"; pb.textContent = "PIN 변경";
      pb.addEventListener("click", () => showChangePin(false)); me.appendChild(pb);
    }
    // 아티팩트 화면에 잠금 버튼이 있으면 그것을 쓴다(앱이 잠금 = 로그아웃으로 처리). 없을 때만 만든다
    const lb = $("lockBtn");
    if (lb) lb.title = "로그아웃하고 로그인 화면으로";
    else {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tgl"; b.id = "lockBtn"; b.textContent = "잠금"; b.title = "로그아웃하고 로그인 화면으로";
      b.addEventListener("click", lock);
      me.appendChild(b);
    }
  }

  // 잠금: 이 기기의 로그인 정보를 즉시 지운다(서버 응답을 기다리다 로그인이 남는 일이 없게)
  let locking = false;
  async function lock() {
    if (locking) return; locking = true;
    try { await Promise.race([sb.auth.signOut({ scope: "local" }), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
    try { localStorage.removeItem("ops-auth-" + CFG.env); localStorage.removeItem("opsFrameUi:role"); } catch (e) {}
    location.replace(location.pathname + location.search);
  }

  // ---------- 미사용 자동 잠금 ----------
  async function startIdle() {
    let min = 30;
    if (OPS.Auth.kind === "personal") {
      try { const { data } = await sb.from("app_settings").select("idle_logout_min").maybeSingle(); if (data && data.idle_logout_min) min = data.idle_logout_min; } catch (e) {}
    }
    let last = Date.now();
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach(ev => document.addEventListener(ev, () => { last = Date.now(); }, { passive: true, capture: true }));
    setInterval(() => { if (Date.now() - last > min * 60000) lock(); }, 30000);
  }

  // ---------- 로그인 화면 ----------
  const S = { mode: "personal", id: "", pin: "", busy: false, pick: null, msg: "", err: false };
  const PIN_LEN = () => (S.mode === "legacy" ? 4 : 6);

  function dots() { return `<div class="gdots" id="gDots" tabindex="0" role="textbox" aria-label="PIN ${S.pin.length}자리 입력됨">${Array.from({ length: PIN_LEN() }, (_, i) => `<i class="${i < S.pin.length ? "on" : ""}"></i>`).join("")}</div>`; }
  function pad() { return `<div class="gpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}<button type="button" data-k="C" class="sm">지움</button><button type="button" data-k="0">0</button><button type="button" data-k="B" class="sm" aria-label="한 자리 지우기">←</button></div>`; }
  function msg(d) { return `<div class="gmsg ${S.err ? "err" : ""}" role="status">${esc(S.msg || d)}</div>`; }
  const logo = () => `<div class="glogo">UHC<small>OPERATION SYSTEM · HOTEL INTEGRATED MANAGEMENT</small></div>${CFG.env !== "prod" ? `<div class="genv">${esc(CFG.name)} 환경</div>` : ""}`;

  function renderGate() {
    const g = $("gate");
    let body;
    if (S.mode === "personal") {
      body = `<form class="gform" id="gIdForm" autocomplete="off">
          <label class="gid"><span>이름</span><input id="gId" value="${esc(S.id)}" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="예: 홍길동" aria-label="이름(아이디)"></label>
        </form>
        ${dots()}${msg("이름을 적고 PIN 6자리를 누르십시오")}${pad()}
        ${CFG.legacyDeptLogin ? `<button type="button" class="gback" id="gLegacy">부서 공용 PIN으로 들어가기 (병행 기간)</button>` : ""}`;
    } else if (!S.pick) {
      body = `${msg("부서 공용 계정 — 근무 부서를 고르십시오")}
        <div class="gdepts">${CFG.accounts.map(a => `<button type="button" data-acc="${a.id}" class="${a.id === "OWNER" ? "own" : ""}" data-role="${a.id}"><b>${esc(a.label)}</b><span>${esc(a.en)}</span></button>`).join("")}</div>
        <button type="button" class="gback" id="gPersonal">← 개인 계정으로 로그인</button>`;
    } else {
      body = `<button type="button" class="gback" id="gBack">← 부서 다시 고르기</button>
        <div class="gdept">${esc(S.pick.label)} <span>${esc(S.pick.en)}</span></div>${dots()}${msg("부서 PIN 4자리를 누르십시오")}${pad()}`;
    }
    g.innerHTML = `<div class="gbox">${logo()}${body}<p class="gfoot">공용 기기는 사용 후 <b>잠금</b>을 눌러 주십시오.</p></div>`;
    // 이름이 비어 있으면 이름 칸, 아니면 PIN 칸(키보드 숫자 입력)에 커서
    const idEl = $("gId"), dEl = $("gDots");
    if (idEl && !S.id) idEl.focus(); else if (dEl && !S.busy) dEl.focus({ preventScroll: true });
  }

  async function tryLogin() {
    if (S.mode === "personal") {
      const id = ($("gId") ? $("gId").value : S.id).normalize("NFC").replace(/\s+/g, "").toLowerCase(); S.id = id;
      if (!/^[가-힣a-z0-9._-]{2,20}$/.test(id)) { S.pin = ""; S.msg = "이름(아이디)을 확인해 주십시오"; S.err = true; renderGate(); return; }
      S.busy = true; S.msg = "확인 중…"; S.err = false; renderGate();
      const r = await callFn("login", { login_id: id, pin: S.pin });
      S.busy = false; S.pin = "";
      if (r.status !== 200) { S.msg = (r.data && r.data.error || "로그인하지 못했습니다") + (r.data && r.data.remaining ? ` (잠금까지 ${r.data.remaining}회)` : ""); S.err = true; renderGate(); return; }
      const { data, error } = await sb.auth.setSession({ access_token: r.data.access_token, refresh_token: r.data.refresh_token });
      if (error || !data.user) { S.msg = "세션을 시작하지 못했습니다"; S.err = true; renderGate(); return; }
      if (!(await setSession(data.user))) { await sb.auth.signOut(); S.msg = "사용할 수 없는 계정입니다"; S.err = true; renderGate(); return; }
      if (OPS.Auth.mustChangePin) { showChangePin(true); return; }
      startApp();
    } else {
      S.busy = true; S.msg = "확인 중…"; S.err = false; renderGate();
      const { data, error } = await sb.auth.signInWithPassword({ email: S.pick.email, password: "uhops-" + S.pin });
      S.busy = false; S.pin = "";
      if (error || !data.user) { S.msg = error && /fetch|network/i.test(error.message) ? "인터넷 연결을 확인해 주십시오" : "PIN이 맞지 않습니다"; S.err = true; renderGate(); return; }
      if (!(await setSession(data.user))) { await sb.auth.signOut(); S.msg = "사용할 수 없는 계정입니다"; S.err = true; renderGate(); return; }
      startApp();
    }
  }

  // ---------- PIN 변경 (첫 로그인 강제 / 직접) ----------
  const C = { step: 0, cur: "", a: "", b: "", forced: false, msg: "", err: false };
  function showChangePin(forced) {
    // 지금 PIN(첫 로그인이면 받은 임시 PIN) → 새 PIN → 새 PIN 확인
    Object.assign(C, { step: 0, cur: "", a: "", b: "", forced, msg: "", err: false });
    const g = $("gate"); g.hidden = false; g.classList.toggle("over", !forced);
    renderChange();
  }
  function renderChange() {
    const labels = [C.forced ? "받은 임시 PIN 6자리" : "지금 PIN 6자리", "새 PIN 6자리", "새 PIN 한 번 더"];
    const v = [C.cur, C.a, C.b][C.step];
    $("gate").innerHTML = `<div class="gbox">${logo()}
      <div class="gdept">${C.forced ? "처음 로그인 — PIN을 바꿔 주십시오" : "PIN 변경"}</div>
      <div class="gmsg">${esc(labels[C.step])}</div>
      <div class="gdots">${Array.from({ length: 6 }, (_, i) => `<i class="${i < v.length ? "on" : ""}"></i>`).join("")}</div>
      <div class="gmsg ${C.err ? "err" : ""}" role="status">${esc(C.msg || "같은 숫자 반복(000000)·연속 숫자(123456)는 쓸 수 없습니다")}</div>
      ${pad()}
      ${C.forced ? `<button type="button" class="gback" id="cOut">로그아웃</button>` : `<button type="button" class="gback" id="cCancel">취소</button>`}
    </div>`;
  }
  async function changeKey(k) {
    const key = ["cur", "a", "b"][C.step];
    if (k === "C") C[key] = ""; else if (k === "B") C[key] = C[key].slice(0, -1); else if (C[key].length < 6) C[key] += k;
    C.msg = ""; C.err = false;
    if (C[key].length === 6) {
      if (C.step < 2) { C.step++; renderChange(); return; }
      if (C.a !== C.b) { Object.assign(C, { a: "", b: "", step: 1, msg: "두 번 입력한 PIN이 다릅니다", err: true }); renderChange(); return; }
      C.msg = "바꾸는 중…"; renderChange();
      const r = await OPS.callFn("change-pin", { current_pin: C.cur, new_pin: C.a });
      if (r.status !== 200) { Object.assign(C, { step: r.status === 401 ? 0 : 1, cur: r.status === 401 ? "" : C.cur, a: "", b: "", msg: r.data.error || "바꾸지 못했습니다", err: true }); renderChange(); return; }
      OPS.Auth.mustChangePin = false;
      if (C.forced) startApp(); else { $("gate").hidden = true; $("gate").classList.remove("over"); alert("PIN을 바꿨습니다."); }
      return;
    }
    renderChange();
  }

  // ---------- 입력 처리 ----------
  // 이름 입력 후 엔터 → PIN 칸으로. 한글 입력 중(조합 중) 엔터도 조합이 끝난 값을 읽도록 한 박자 늦춘다
  function toPin() {
    setTimeout(() => {
      const el = $("gId"); if (!el) return;
      S.id = el.value.trim();
      S.msg = S.id ? "PIN 6자리를 누르십시오" : "이름을 적어 주십시오"; S.err = !S.id;
      renderGate();
    }, 0);
  }
  document.addEventListener("submit", e => { if (e.target && e.target.id === "gIdForm") { e.preventDefault(); toPin(); } });
  function isChange() { return !!document.querySelector("#gate #cOut, #gate #cCancel"); }
  document.addEventListener("click", e => {
    const g = $("gate"); if (!g || g.hidden || S.busy) return;
    if (isChange()) {
      if (e.target.closest("#cOut")) { lock(); return; }
      if (e.target.closest("#cCancel")) { g.hidden = true; g.classList.remove("over"); return; }
      const k = e.target.closest("[data-k]"); if (k) changeKey(k.dataset.k);
      // 첫 로그인 강제 변경은 임시 PIN부터: step 0 으로 시작
      return;
    }
    if (e.target.closest("#gLegacy")) { S.mode = "legacy"; S.pick = null; S.pin = ""; S.msg = ""; S.err = false; renderGate(); return; }
    if (e.target.closest("#gPersonal")) { S.mode = "personal"; S.pin = ""; S.msg = ""; S.err = false; renderGate(); return; }
    const a = e.target.closest("[data-acc]");
    if (a) { S.pick = CFG.accounts.find(x => x.id === a.dataset.acc); S.pin = ""; S.msg = ""; renderGate(); return; }
    if (e.target.closest("#gBack")) { S.pick = null; S.pin = ""; S.msg = ""; renderGate(); return; }
    const k = e.target.closest("[data-k]");
    if (k && (S.mode === "personal" || S.pick)) {
      if ($("gId")) S.id = $("gId").value;
      const v = k.dataset.k;
      if (v === "C") S.pin = ""; else if (v === "B") S.pin = S.pin.slice(0, -1); else if (S.pin.length < PIN_LEN()) S.pin += v;
      S.msg = ""; S.err = false; renderGate();
      if (S.pin.length === PIN_LEN()) tryLogin();
    }
  });
  document.addEventListener("keydown", e => {
    const g = $("gate"); if (!g || g.hidden || S.busy) return;
    // 이름 칸: 엔터(또는 탭)를 누르면 PIN 칸으로 넘어간다. 그 밖의 입력은 그대로
    if (e.target && e.target.id === "gId") {
      if (e.key === "Enter") { e.preventDefault(); toPin(); }
      return;
    }
    if (isChange()) { if (/^\d$/.test(e.key)) changeKey(e.key); else if (e.key === "Backspace") changeKey("B"); return; }
    if (!(S.mode === "personal" || S.pick)) return;
    if (/^\d$/.test(e.key) && S.pin.length < PIN_LEN()) { if ($("gId")) S.id = $("gId").value; S.pin += e.key; renderGate(); if (S.pin.length === PIN_LEN()) tryLogin(); }
    else if (e.key === "Backspace") { S.pin = S.pin.slice(0, -1); renderGate(); }
  });

  // 저장된 로그인이 있으면 바로 시작
  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      const u = data && data.session && data.session.user;
      if (u && await setSession(u)) {
        if (OPS.Auth.mustChangePin) { showChangePin(true); return; }
        startApp(); return;
      }
    } catch (e) {}
    renderGate();
  })();
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT" && started) location.replace(location.pathname + location.search); });
})();
