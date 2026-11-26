/* 웹 전용: 상단 메뉴 정리 (아티팩트 화면 위에 덧입힘. 아티팩트 반영 때 지워지지 않는다)
   - 내 이름 메뉴: PIN 변경 / 직원·권한(관리자) / 로그아웃
   - 화면 설정: 밝기 · 글자 크게 · English (휴대폰은 메뉴 안 "이 기기" 칸)
   - 연결 상태: 점만. 끊기거나 저장 실패면 빨간색 글자
   - "관리자" 버튼 → "관리자 화면", 버전 표시는 프로그램 관리자 이름 메뉴 안에만
   아티팩트의 버튼(themeBtn·langBtn·sizeBtn·lockBtn)은 지우지 않고 옮기기만 한다(동작은 아티팩트 그대로). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON = {
    user: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>'
  };

  function dd(id, btnHtml, label) {
    const w = document.createElement("div"); w.className = "wdd"; w.id = id;
    w.innerHTML = `<button type="button" class="tgl wddb" aria-expanded="false" aria-label="${esc(label)}">${btnHtml}${ICON.down}</button><div class="wpop" role="menu"><p class="wph">${esc(label)}</p></div>`;
    return w;
  }

  // 연결 상태 점: 실시간 연결(web/store-supabase.js의 OPS.Conn) + 아티팩트 저장 표시(#where)
  function connState() {
    const C = window.OPS && OPS.Conn;
    const w = ($("where") && $("where").textContent) || "";
    if (!navigator.onLine || (C && C.state === "down")) return { c: "down", t: "연결 끊김", tip: "인터넷이나 실시간 연결이 끊겼습니다. 다시 연결되면 자동으로 이어집니다." };
    if (/저장 실패/.test(w)) return { c: "down", t: "저장 실패", tip: "방금 기록이 저장되지 않았습니다. 다시 시도하십시오." };
    if (/보기 전용/.test(w)) return { c: "warn", t: "보기 전용", tip: "이 계정은 기록할 수 없습니다." };
    if (/저장 중/.test(w)) return { c: "busy", t: "", tip: "저장 중" };
    if (!C || C.state !== "ok") return { c: "busy", t: "", tip: "연결 중" };
    return { c: "ok", t: "", tip: "실시간 연결됨" + (w.match(/\d{1,2}:\d{2}/) ? " · 마지막 변경 " + w.match(/\d{1,2}:\d{2}/)[0] : "") };
  }
  function paintConn() {
    const d = $("connDot"); if (!d) return;
    const s = connState();
    d.className = "conndot " + s.c; d.title = s.tip; d.setAttribute("aria-label", s.tip);
    d.innerHTML = `<i aria-hidden="true"></i>${s.t ? `<span>${esc(s.t)}</span>` : ""}`;
  }

  function mount() {
    const A = window.OPS && OPS.Auth; if (!A) return;
    const me = document.querySelector(".me"), top = document.querySelector(".top");
    if (!me || !top || !$("loginWho")) { setTimeout(mount, 300); return; }
    if ($("acctDD")) return;
    document.body.classList.add("webhead");

    // 연결 점은 상단 줄(휴대폰에서도 보이게)
    const dot = document.createElement("span"); dot.id = "connDot"; dot.setAttribute("role", "status");
    const ab = $("adminBtn");
    top.insertBefore(dot, ab && ab.parentNode === top ? ab : null);
    paintConn();
    if ($("where")) new MutationObserver(paintConn).observe($("where"), { childList: true, characterData: true, subtree: true });
    addEventListener("ops-conn", paintConn); addEventListener("online", paintConn); addEventListener("offline", paintConn);
    setInterval(paintConn, 15000);

    // "관리자" → "관리자 화면"
    if (ab) { const s = ab.querySelector("span"); if (s) s.textContent = "SYSTEM OWNER"; ab.title = "SYSTEM OWNER 화면(설정·통계 등)"; }

    // 화면 설정
    const set = dd("setDD", ICON.sliders + "<span>화면 설정</span>", "화면 설정");
    const sp = set.querySelector(".wpop"); sp.querySelector(".wph").textContent = "이 기기 화면";
    ["themeBtn", "sizeBtn", "langBtn"].forEach(id => { const b = $(id); if (b) sp.appendChild(b); });
    if ($("themeBtn")) $("themeBtn").title = "화면 밝기: 자동(시간에 따라) → 밝게 → 어둡게";

    // 내 계정
    const name = A.kind === "personal" ? A.name : (A.label || "부서") + " 공용";
    const acct = dd("acctDD", ICON.user + `<span>${esc(name)}</span>`, "내 계정");
    const ap = acct.querySelector(".wpop");
    const who = A.kind === "personal"
      ? `<div><b>${esc(A.name)}</b>${A.title ? " " + esc(A.title) : ""}</div><span>${esc(A.deptName)}${A.owner ? " · 프로그램 관리자" : A.role === "dept_admin" ? " · 부서 관리자" : ""}</span>`
      : `<b>부서 공용</b><span>${esc(A.label || "")}${A.owner ? " · 모든 부서" : ""}</span>`;
    ap.querySelector(".wph").outerHTML = `<div class="wacct">${who}${A.owner && window.OPS.VERSION ? `<small>OPS ${esc(OPS.VERSION)} · 웹</small>` : ""}</div>`;
    const pin = [...me.querySelectorAll("button")].find(b => b.textContent.trim() === "PIN 변경");
    if (pin) ap.appendChild(pin);
    const staff = $("staffBtn"); if (staff) ap.appendChild(staff);
    const lb = $("lockBtn");
    if (lb) { lb.innerHTML = ICON.out + "로그아웃"; lb.title = "로그아웃하고 로그인 화면으로"; lb.classList.add("wout"); ap.appendChild(lb); }

    me.appendChild(set); me.appendChild(acct);

    // 아티팩트 "자동 잠금"(이 기기)은 웹에서 숨긴다 — 자동 로그아웃은 관리자 일반 설정 하나로
    const al = $("autoLock");
    if (al) {
      if (al.value !== "0") { al.value = "0"; al.dispatchEvent(new Event("change", { bubbles: true })); }
      const lab = al.closest("label"); if (lab) { lab.hidden = true; const h = lab.previousElementSibling; if (h && h.classList.contains("sideh")) h.hidden = true; }
    }

    // 펼치기/닫기 (PC). 휴대폰 메뉴 안에서는 늘 펼쳐 보인다(CSS)
    const close = except => document.querySelectorAll(".wdd.open").forEach(x => { if (x !== except) { x.classList.remove("open"); x.querySelector(".wddb").setAttribute("aria-expanded", "false"); } });
    document.addEventListener("click", e => {
      const b = e.target.closest(".wddb");
      if (b) { const w = b.parentNode, on = !w.classList.contains("open"); close(w); w.classList.toggle("open", on); b.setAttribute("aria-expanded", String(on)); return; }
      if (!e.target.closest(".wpop") || e.target.closest("#lockBtn,#staffBtn") || [...document.querySelectorAll(".wpop button")].some(x => x === e.target.closest("button") && /PIN 변경/.test(x.textContent))) close();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  }

  window.OPS_HEADER = { mount };
})();
