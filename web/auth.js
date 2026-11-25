/* 부서 PIN 로그인. 로그인 전에는 업무 화면 스크립트를 불러오지 않는다.
   - 부서를 고르고 PIN 4자리를 누르면 Supabase 계정으로 로그인한다.
   - 부서 계정은 그 부서로 고정되고, 프로그램 관리자(OWNER)만 부서를 바꿀 수 있다.
   - 로그인은 이 기기에 유지되며, 화면 위 '잠금'으로 언제든 다시 PIN 화면으로 돌아간다. */
(function () {
  const CFG = window.OPS_CONFIG;
  const OPS = window.OPS = window.OPS || {};
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "ops-auth" } });
  OPS.SB = sb;

  // 아티팩트 index.html의 스크립트 순서를 빌드(sync.ps1)가 window.OPS_APP_SCRIPTS로 넣어 준다
  const APP_SCRIPTS = window.OPS_APP_SCRIPTS || [];
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function setSession(user) {
    const m = user.app_metadata || {};
    const owner = m.owner === true;
    const dept = ["FO", "HK", "FM", "MG"].includes(m.dept) ? m.dept : "FO";
    const acc = CFG.accounts.find(a => a.email === user.email) || {};
    OPS.Auth = { uid: user.id, email: user.email, dept, owner, label: acc.label || dept, allowed: owner ? ["FO", "HK", "FM", "MG"] : [dept], lock };
    // 부서 계정은 그 부서로 시작한다(관리자는 마지막 선택 유지)
    try {
      const cur = (localStorage.getItem("opsFrameUi:role") || "").toUpperCase();
      if (!owner || !["FO", "HK", "FM", "MG"].includes(cur)) localStorage.setItem("opsFrameUi:role", dept);
    } catch (e) {}
    const h = location.hash.slice(1).toUpperCase();
    if (!owner && h && h !== dept) history.replaceState(null, "", "#" + dept.toLowerCase());
  }

  let started = false;
  function startApp() {
    if (started) return; started = true;
    document.getElementById("gate").hidden = true;
    document.body.classList.remove("locked");
    (function next(i) {
      if (i >= APP_SCRIPTS.length) { addLockButton(); return; }
      const s = document.createElement("script");
      s.src = APP_SCRIPTS[i];
      s.onload = () => next(i + 1);
      s.onerror = () => { alert("화면 파일을 불러오지 못했습니다: " + s.src); };
      document.body.appendChild(s);
    })(0);
  }

  function addLockButton() {
    // 좁은 화면에서는 앱이 .me를 메뉴 서랍으로 옮긴다 — 어디에 있든 찾는다
    const me = document.querySelector(".me");
    if (document.getElementById("lockBtn")) return;
    if (!me) { setTimeout(addLockButton, 300); return; }
    const who = document.createElement("span");
    who.className = "badge"; who.id = "loginWho";
    who.textContent = "로그인: " + OPS.Auth.label + (OPS.Auth.owner ? " (모든 부서)" : "");
    const b = document.createElement("button");
    b.type = "button"; b.className = "tgl"; b.id = "lockBtn"; b.textContent = "잠금";
    b.title = "로그아웃하고 PIN 화면으로";
    b.addEventListener("click", lock);
    me.prepend(who); me.appendChild(b);
  }

  async function lock() {
    try { await sb.auth.signOut(); } catch (e) {}
    try { localStorage.removeItem("opsFrameUi:role"); } catch (e) {}
    location.replace(location.pathname);
  }

  // ---------- PIN 화면 ----------
  let pick = null, pin = "", busy = false, fails = 0, waitUntil = 0;
  function renderGate(msg, err) {
    const g = document.getElementById("gate");
    g.innerHTML = `<div class="gbox">
      <div class="glogo">OPS<small>통합 업무 시스템</small></div>
      ${pick ? `<button type="button" class="gback" id="gBack">← 부서 다시 고르기</button>
        <div class="gdept">${esc(pick.label)} <span>${esc(pick.en)}</span></div>
        <div class="gdots" aria-label="PIN ${pin.length}자리 입력됨">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? "on" : ""}"></i>`).join("")}</div>
        <div class="gmsg ${err ? "err" : ""}" role="status">${esc(msg || "PIN 4자리를 눌러 주십시오")}</div>
        <div class="gpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}<button type="button" data-k="C" class="sm">지움</button><button type="button" data-k="0">0</button><button type="button" data-k="B" class="sm" aria-label="한 자리 지우기">←</button></div>`
      : `<div class="gmsg" role="status">${esc(msg || "근무 부서를 고르십시오")}</div>
        <div class="gdepts">${CFG.accounts.map(a => `<button type="button" data-acc="${a.id}" class="${a.id === "OWNER" ? "own" : ""}" data-role="${a.id}"><b>${esc(a.label)}</b><span>${esc(a.en)}</span></button>`).join("")}</div>`}
      <p class="gfoot">로그인은 이 기기에 유지됩니다. 공용 기기는 사용 후 <b>잠금</b>을 눌러 주십시오.</p>
    </div>`;
  }

  async function tryLogin() {
    if (Date.now() < waitUntil) { pin = ""; renderGate(`잠시 후 다시 시도해 주십시오 (${Math.ceil((waitUntil - Date.now()) / 1000)}초)`, true); return; }
    busy = true; renderGate("확인 중…");
    const { data, error } = await sb.auth.signInWithPassword({ email: pick.email, password: "uhops-" + pin });
    busy = false;
    if (error || !data || !data.user) {
      fails++; pin = "";
      if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; }
      renderGate(error && /fetch|network/i.test(error.message) ? "인터넷 연결을 확인해 주십시오" : "PIN이 맞지 않습니다", true);
      return;
    }
    setSession(data.user); startApp();
  }

  document.addEventListener("click", e => {
    const g = document.getElementById("gate");
    if (!g || g.hidden || busy) return;
    const a = e.target.closest("[data-acc]");
    if (a) { pick = CFG.accounts.find(x => x.id === a.dataset.acc); pin = ""; renderGate(); return; }
    if (e.target.closest("#gBack")) { pick = null; pin = ""; renderGate(); return; }
    const k = e.target.closest("[data-k]");
    if (k && pick) {
      const v = k.dataset.k;
      if (v === "C") pin = ""; else if (v === "B") pin = pin.slice(0, -1); else if (pin.length < 4) pin += v;
      renderGate();
      if (pin.length === 4) tryLogin();
    }
  });
  document.addEventListener("keydown", e => {
    const g = document.getElementById("gate");
    if (!g || g.hidden || busy || !pick) return;
    if (/^\d$/.test(e.key) && pin.length < 4) { pin += e.key; renderGate(); if (pin.length === 4) tryLogin(); }
    else if (e.key === "Backspace") { pin = pin.slice(0, -1); renderGate(); }
    else if (e.key === "Escape") { pick = null; pin = ""; renderGate(); }
  });

  // 저장된 로그인이 있으면 바로 시작
  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      const u = data && data.session && data.session.user;
      if (u) { setSession(u); startApp(); return; }
    } catch (e) {}
    renderGate();
  })();
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && started) location.replace(location.pathname); });
})();
