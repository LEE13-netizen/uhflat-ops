/* 일반 설정 · 직원·권한 (관리자 전용 창)
   - 프로그램 관리자: 모든 직원, 부서 관리자 지정·해제, 부서 이동, 일반 설정, 감사 로그
   - 부서 관리자: 자기 부서 일반 직원(추가·정보 수정·PIN 초기화·잠금 해제·비활성화)
   - 부서 공용 '프로그램 관리자' 계정: 개인 프로그램 관리자 계정을 처음 한 번 만들기
   권한 검사는 서버 함수(staff-admin)가 한다. 이 화면은 결과만 보여 준다. */
(function () {
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ROLE = { super_admin: "프로그램 관리자", dept_admin: "부서 관리자", staff: "직원" };
  const ACTION = { login: "로그인", login_locked: "로그인 잠금", pin_changed: "PIN 변경", pin_reset: "PIN 초기화", unlock: "잠금 해제", staff_create: "직원 추가", staff_update: "직원 정보 수정", staff_activate: "재활성화", staff_deactivate: "비활성화", staff_move_dept: "부서 이동", staff_delete: "직원 삭제", staff_set_role: "권한 변경", settings_update: "설정 변경", bootstrap_super_admin: "프로그램 관리자 계정 생성" };
  // 부서별 직급 목록(고르거나 직접 적을 수 있음)
  const TITLES = {
    FO: ["인턴", "프론트 사원", "주임", "대리", "프론트 매니저", "프론트 팀장"],
    HK: ["룸메이드", "하우스맨", "인스펙터", "주임", "하우스키핑 팀장"],
    FM: ["시설 기사", "주임", "시설 팀장"],
    MN: ["매니저", "부지배인", "지배인", "총지배인"],
    MG: ["대표", "관리자"]
  };
  const titleLists = () => Object.keys(TITLES).map(c => `<datalist id="spT-${c}">${TITLES[c].map(t => `<option value="${esc(t)}">`).join("")}</datalist>`).join("");
  const st = { open: false, data: null, depts: [], logs: null, msg: "", err: false, shown: null, tab: "staff" };
  const fmt = t => { if (!t) return ""; const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const A = () => window.OPS.Auth;

  async function call(body) {
    const r = await window.OPS.callFn("staff-admin", body);
    if (r.status !== 200) throw new Error(r.data && r.data.error || "처리하지 못했습니다.");
    return r.data;
  }
  async function load() {
    if (A().kind !== "personal") { st.data = null; return; }
    st.data = await call({ action: "list" });
    const { data } = await window.OPS.SB.from("departments").select("id, code, name").order("sort");
    st.depts = data || [];
  }
  async function loadLogs() {
    const { data, error } = await window.OPS.SB.from("audit_logs").select("at, actor_id, action, target_id, before, after").order("at", { ascending: false }).limit(60);
    if (error) throw new Error("감사 로그를 읽지 못했습니다.");
    st.logs = data || [];
  }
  const deptName = id => (st.depts.find(d => d.id === id) || {}).name || "";
  const deptCode = id => (st.depts.find(d => d.id === id) || {}).code || "";
  const nameOf = id => { const s = st.data && st.data.staff.find(x => x.user_id === id); return s ? s.name : (id ? id.slice(0, 8) : "시스템"); };

  function status(s) {
    const g = s.guard || {};
    if (!s.active) return `<span class="sx off">비활성</span>`;
    if (g.admin_lock) return `<span class="sx hot">잠김(관리자 해제)</span>`;
    if (g.locked_until && new Date(g.locked_until) > new Date()) return `<span class="sx hot">잠김 ~${fmt(g.locked_until)}</span>`;
    if (s.must_change_pin) return `<span class="sx wait">임시 PIN</span>`;
    return `<span class="sx ok">사용 중</span>`;
  }

  function render() {
    const box = document.getElementById("staffPanel"); if (!box) return;
    const me = A(), sup = me.owner && me.kind === "personal";
    let body = "";
    if (me.kind === "legacy" && me.legacyOwner) {
      body = `<section class="sp-card"><h3>개인 프로그램 관리자 계정 만들기</h3>
        <p class="sp-g">처음 한 번만 합니다. 만든 뒤에는 이 계정(부서 공용)이 아니라 <b>개인 아이디</b>로 로그인해 직원을 등록합니다. 임시 PIN은 한 번만 보이니 바로 적어 두십시오.</p>
        <form id="spBoot" class="sp-form"><label>이름 <span class="sp-c">로그인 아이디</span><input name="name" required maxlength="20" placeholder="예: 홍길동"></label><label>직급<input name="title" required maxlength="30" list="spT-MG"></label><button class="btn main">만들기</button></form>${titleLists()}</section>`;
    } else if (st.data) {
      const tabs = [["staff", "직원·권한"]].concat(sup ? [["settings", "일반 설정"], ["audit", "감사 로그"]] : []);
      body = `<div class="sp-tabs">${tabs.map(([k, n]) => `<button type="button" data-sptab="${k}" aria-pressed="${st.tab === k}">${n}</button>`).join("")}</div>`;
      if (st.tab === "staff") {
        body += `<section class="sp-card"><h3>직원 추가</h3>
          <p class="sp-g">직원은 <b>자기 이름</b>으로 로그인합니다. 업무 기록의 작성자도 이 이름으로 자동으로 남습니다. 저장하면 <b>임시 PIN이 한 번만</b> 나옵니다 — 직원에게 직접 전하고, 직원은 첫 로그인 때 자기 PIN으로 바꿉니다.</p>
          <form id="spAdd" class="sp-form">
            ${sup ? `<label>부서<select name="dept_code" id="spDept">${st.depts.map(d => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join("")}</select></label>` : `<label>부서<input value="${esc(deptName(st.data.me.dept_id))}" disabled></label>`}
            <label>이름<input name="name" required maxlength="20" placeholder="예: 홍길동"></label>
            <label>직급<input name="title" id="spTitle" required maxlength="30" list="spT-${esc(sup ? (st.depts[0] || {}).code || "FO" : deptCode(st.data.me.dept_id))}" placeholder="골라 주십시오"></label>
            ${sup ? `<label>권한<select name="role"><option value="staff">직원</option><option value="dept_admin">부서 관리자</option></select></label>` : ""}
            <label>아이디 <span class="sp-c">같은 이름이 있을 때만</span><input name="login_id" maxlength="20" placeholder="비우면 이름 (예: 홍길동2)"></label>
            <button class="btn main">추가</button></form>${titleLists()}</section>
          <section class="sp-card"><h3>직원 목록 <span class="sp-c">${st.data.staff.length}명</span></h3>
          <div class="scroll"><table class="sp-t"><thead><tr><th>이름</th><th>아이디</th><th>부서</th><th>권한</th><th>상태</th><th>최근 로그인</th><th></th></tr></thead><tbody>
          ${st.data.staff.map(s => {
            const self = s.user_id === st.data.me.user_id, isSup = s.role === "super_admin";
            const locked = s.guard && (s.guard.admin_lock || (s.guard.locked_until && new Date(s.guard.locked_until) > new Date()));
            const acts = isSup ? "" : [
              `<button type="button" class="btn sm" data-sp="edit" data-u="${s.user_id}">정보 수정</button>`,
              `<button type="button" class="btn sm" data-sp="reset_pin" data-u="${s.user_id}">PIN 초기화</button>`,
              locked ? `<button type="button" class="btn sm" data-sp="unlock" data-u="${s.user_id}">잠금 해제</button>` : "",
              self ? "" : `<button type="button" class="btn sm" data-sp="set_active" data-u="${s.user_id}" data-v="${!s.active}">${s.active ? "비활성화" : "재활성화"}</button>`,
              sup && !self ? `<button type="button" class="btn sm" data-sp="set_role" data-u="${s.user_id}" data-v="${s.role === "dept_admin" ? "staff" : "dept_admin"}">${s.role === "dept_admin" ? "부서 관리자 해제" : "부서 관리자 지정"}</button>` : "",
              self ? "" : `<button type="button" class="btn sm sp-del" data-sp="delete" data-u="${s.user_id}">삭제</button>`,
              sup && !self ? `<select class="sp-mv" data-sp="move_dept" data-u="${s.user_id}" aria-label="부서 이동">${st.depts.map(d => `<option value="${esc(d.code)}" ${d.id === s.dept_id ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select>` : ""
            ].join("");
            return `<tr class="${s.active ? "" : "sp-off"}"><td><b>${esc(s.name)}</b>${s.title ? ` <span class="sp-c">${esc(s.title)}</span>` : ""}</td><td>${esc(s.login_id)}</td><td>${esc(deptName(s.dept_id))}</td><td>${ROLE[s.role]}</td><td>${status(s)}${s.guard && s.guard.failed_count ? ` <span class="sp-c">실패 ${s.guard.failed_count}</span>` : ""}</td><td>${fmt(s.guard && s.guard.last_login_at)}</td><td class="sp-a">${acts}</td></tr>`;
          }).join("")}</tbody></table></div>
          <p class="sp-g">비활성화해도 그 직원이 남긴 업무 기록은 지워지지 않습니다. 잠금: 누적 10회 실패 15분, 15회 30분, 그 이상은 여기서 잠금 해제.</p></section>`;
      } else if (st.tab === "settings") {
        const s = st.data.settings || {};
        body += `<section class="sp-card"><h3>일반 설정</h3><form id="spSet" class="sp-form">
          <label>자동 로그아웃(분)<input name="idle_logout_min" type="number" min="1" max="1440" value="${esc(s.idle_logout_min || 30)}"></label>
          <label class="sp-chk"><input type="checkbox" name="legacy_dept_login" ${s.legacy_dept_login ? "checked" : ""}> 부서 공용 PIN 병행 사용(기록용 — 실제 종료는 배포 설정과 함께)</label>
          <label class="sp-chk"><input type="checkbox" disabled ${s.otp_required ? "checked" : ""}> 관리자 2단계 인증(OTP) — 보류</label>
          <button class="btn main">저장</button></form>
          <p class="sp-g">부서 관리자는 직원·권한 탭에서 직원별로 지정·해제합니다. 화면 조작이 없으면 설정한 시간 뒤 자동으로 로그인 화면으로 돌아갑니다.</p></section>`;
      } else {
        body += `<section class="sp-card"><h3>감사 로그 <span class="sp-c">최근 60건</span></h3>${st.logs ? `<div class="scroll"><table class="sp-t"><thead><tr><th>시각</th><th>누가</th><th>무엇을</th><th>대상</th></tr></thead><tbody>
          ${st.logs.map(l => `<tr><td>${fmt(l.at)}</td><td>${esc(nameOf(l.actor_id))}</td><td>${esc(ACTION[l.action] || l.action)}</td><td>${esc(l.target_id && l.target_id !== l.actor_id ? (l.before && l.before.name && l.action === "staff_delete" ? l.before.name : nameOf(l.target_id)) : "")}${l.after && l.after.login_id ? " (" + esc(l.after.login_id) + ")" : ""}</td></tr>`).join("")}</tbody></table></div>` : "불러오는 중…"}</section>`;
      }
    } else body = `<p class="sp-g">불러오는 중…</p>`;
    box.innerHTML = `<div class="sp-head"><b>일반 설정 · 직원·권한</b><button type="button" class="x2" data-sp="close" aria-label="닫기">×</button></div>
      ${st.msg ? `<p class="sp-msg ${st.err ? "err" : ""}">${esc(st.msg)}</p>` : ""}
      ${st.shown ? `<div class="sp-pin"><span>${esc(st.shown.name)} 임시 PIN</span><b>${esc(st.shown.pin)}</b><span>아이디 <b>${esc(st.shown.login_id || "")}</b> · 이 화면을 닫으면 다시 볼 수 없습니다</span><button type="button" class="btn sm" data-sp="hidepin">확인했습니다</button></div>` : ""}
      ${body}`;
  }

  async function act(fn, okMsg) {
    st.msg = "처리 중…"; st.err = false; render();
    try { const r = await fn(); st.msg = okMsg || "처리했습니다."; await load(); if (st.tab === "audit") await loadLogs(); return r; }
    catch (e) { st.msg = e.message; st.err = true; }
    finally { render(); }
  }

  function open() {
    let box = document.getElementById("staffPanel");
    if (!box) { box = document.createElement("div"); box.id = "staffPanel"; box.className = "sp"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "일반 설정 · 직원·권한"); document.body.appendChild(box); }
    box.hidden = false; st.open = true; st.msg = ""; render();
    load().then(render).catch(e => { st.msg = e.message; st.err = true; render(); });
  }

  document.addEventListener("click", async e => {
    const box = document.getElementById("staffPanel");
    if (e.target.closest("#staffBtn")) { open(); return; }
    if (!box || box.hidden || !box.contains(e.target)) return;
    const t = e.target.closest("[data-sptab]");
    if (t) { st.tab = t.dataset.sptab; st.msg = ""; render(); if (st.tab === "audit") { await loadLogs().catch(err => { st.msg = err.message; st.err = true; }); render(); } return; }
    const b = e.target.closest("button[data-sp]"); if (!b) return;
    const a = b.dataset.sp, u = b.dataset.u;
    if (a === "close") { box.hidden = true; st.open = false; st.shown = null; return; }
    if (a === "hidepin") { st.shown = null; render(); return; }
    const s = st.data && st.data.staff.find(x => x.user_id === u);
    if (a === "reset_pin") {
      if (!confirm((s ? s.name : "") + " 직원의 PIN을 초기화합니다. 지금 PIN은 쓸 수 없게 됩니다.")) return;
      const r = await act(() => call({ action: "reset_pin", user_id: u }), "PIN을 초기화했습니다.");
      if (r && r.temp_pin) { st.shown = { name: s ? s.name : "", pin: r.temp_pin, login_id: s && s.login_id }; render(); }
    } else if (a === "unlock") await act(() => call({ action: "unlock", user_id: u }), "잠금을 풀었습니다.");
    else if (a === "set_active") { const v = b.dataset.v === "true"; if (!v && !confirm((s ? s.name : "") + " 직원을 비활성화합니다. 로그인된 기기도 끊깁니다. 기록은 남습니다.")) return; await act(() => call({ action: "set_active", user_id: u, active: v }), v ? "다시 쓸 수 있게 했습니다." : "비활성화했습니다."); }
    else if (a === "delete") {
      if (!confirm((s ? s.name : "") + " 직원을 삭제합니다.\n\n· 로그인 계정과 직원 정보가 지워지며 되돌릴 수 없습니다.\n· 그동안 남긴 업무 기록과 작성자 이름은 그대로 남습니다.\n· 잠시 쉬는 직원이면 삭제 대신 '비활성화'를 쓰십시오.")) return;
      await act(() => call({ action: "delete", user_id: u }), "삭제했습니다.");
    }
    else if (a === "set_role") await act(() => call({ action: "set_role", user_id: u, role: b.dataset.v }), "권한을 바꿨습니다.");
    else if (a === "edit") {
      const name = prompt("이름", s ? s.name : ""); if (name === null) return;
      const opts = TITLES[deptCode(s && s.dept_id)] || [];
      const title = prompt("직급" + (opts.length ? " (예: " + opts.join(", ") + ")" : ""), s ? s.title : ""); if (title === null) return;
      const login_id = prompt("로그인 아이디(보통 이름과 같게. 같은 이름이 있으면 홍길동2처럼)", s ? (s.login_id === (s.name || "").replace(/\s+/g, "") ? name.replace(/\s+/g, "") : s.login_id) : ""); if (login_id === null) return;
      await act(() => call({ action: "update", user_id: u, name, title, login_id }), "정보를 바꿨습니다.");
    }
  });
  document.addEventListener("change", async e => {
    if (e.target.id === "spDept") { const t = document.getElementById("spTitle"); if (t) { t.setAttribute("list", "spT-" + e.target.value); t.value = ""; } return; }
    const sel = e.target.closest && e.target.closest("select[data-sp=move_dept]"); if (!sel) return;
    if (!confirm("부서를 옮깁니다.")) { render(); return; }
    await act(() => call({ action: "move_dept", user_id: sel.dataset.u, dept_code: sel.value }), "부서를 옮겼습니다.");
  });
  document.addEventListener("submit", async e => {
    const f = e.target; if (!f.closest || !f.closest("#staffPanel")) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    if (f.id === "spAdd" || f.id === "spBoot") {
      const r = await act(() => call(Object.assign({ action: f.id === "spBoot" ? "bootstrap" : "create" }, v)), f.id === "spBoot" ? "프로그램 관리자 계정을 만들었습니다. 잠금 후 개인 아이디로 로그인하십시오." : "직원을 추가했습니다.");
      if (r && r.temp_pin) { st.shown = { name: v.name, pin: r.temp_pin, login_id: r.login_id }; render(); }
    } else if (f.id === "spSet") {
      await act(() => call({ action: "settings", idle_logout_min: Number(v.idle_logout_min), legacy_dept_login: !!v.legacy_dept_login }), "설정을 저장했습니다.");
    }
  });

  window.OPS_STAFF = {
    mount() {
      const me = document.querySelector(".me");
      if (!me) { setTimeout(() => this.mount(), 300); return; }
      if (document.getElementById("staffBtn")) return;
      const b = document.createElement("button"); b.type = "button"; b.className = "tgl"; b.id = "staffBtn";
      b.textContent = A().kind === "legacy" ? "관리자 계정 만들기" : "직원·권한";
      const lb = document.getElementById("lockBtn");
      if (lb && lb.parentNode) lb.parentNode.insertBefore(b, lb); else me.appendChild(b);
    }
  };
})();
