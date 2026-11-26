/* 의견함 (웹 전용): 이 프로그램의 불편·오류 신고와 기능 제안
   - 내 계정 메뉴 "의견 보내기" → 종류 + 내용. 화면·부서·기기·버전·최근 오류는 자동으로 붙는다(사람에게 묻지 않는다)
   - 객실·시설 고장은 여기가 아니라 업무로 등록하도록 첫 선택지에서 나눈다
   - 직원: 내가 보낸 것과 처리 상태·답변을 본다. 답이 오면 메뉴에 점이 뜬다
   - SYSTEM OWNER: 전체 목록, 상태(접수·검토 중·반영됨·보류) + 답변. 보류는 사유 필수
   저장: Supabase 표 public.feedback (supabase/migrations/0007_feedback.sql). 권한 검사는 DB(RLS)가 한다. */
(function () {
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = id => document.getElementById(id);
  const A = () => (window.OPS && window.OPS.Auth) || {};
  const SB = () => window.OPS && window.OPS.SB;
  const KIND = { bug: "불편·오류", idea: "기능 제안" };
  const STATUS = { new: "접수", review: "검토 중", done: "반영됨", hold: "보류" };
  const st = { tab: "send", kind: "", mine: null, all: null, msg: "", err: false, busy: false, filter: "open" };
  const fmt = t => { if (!t) return ""; const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const owner = () => !!A().owner;
  const seenKey = () => "opsFb:seen:" + (A().uid || "");
  const getSeen = () => { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } };
  const setSeen = v => { try { localStorage.setItem(seenKey(), String(v)); } catch (e) {} };

  // 최근 오류(버그 재현용). 앱보다 먼저 불러오므로 화면 오류도 잡힌다
  const errs = [];
  const pushErr = (m, src, line) => { errs.unshift({ at: Date.now(), m: String(m || "").slice(0, 200), src: String(src || "").split("/").pop().slice(0, 60), line: line || 0 }); errs.length = Math.min(errs.length, 5); };
  addEventListener("error", e => pushErr(e.message, e.filename, e.lineno));
  addEventListener("unhandledrejection", e => pushErr(e.reason && (e.reason.message || e.reason)));

  function context() {
    const h1 = document.querySelector("#view .backbar h1");
    const scr = h1 ? h1.textContent.trim() : (document.querySelector("#view") ? "현황판" : "");
    const dlg = $("dlg"), dlgT = dlg && dlg.open ? (dlg.querySelector("h2,h3") || {}).textContent || "" : "";
    return {
      screen: scr.slice(0, 40), dialog: String(dlgT).trim().slice(0, 60), hash: location.hash.slice(0, 20),
      ver: (window.OPS && window.OPS.VERSION) || "", env: (window.OPS_CONFIG && window.OPS_CONFIG.env) || "",
      ua: navigator.userAgent.slice(0, 200), view: innerWidth + "x" + innerHeight,
      theme: document.documentElement.dataset.theme || "", online: navigator.onLine,
      conn: (window.OPS && window.OPS.Conn && window.OPS.Conn.state) || "", errors: errs.slice(0, 3)
    };
  }

  async function loadMine() {
    const { data, error } = await SB().from("feedback").select("id, created_at, kind, body, status, reply, replied_at").eq("author_id", A().uid).order("created_at", { ascending: false }).limit(50);
    if (error) throw dbErr(error);
    st.mine = data || [];
  }
  async function loadAll() {
    const { data, error } = await SB().from("feedback").select("id, created_at, author_name, dept, kind, body, ctx, status, reply, replied_at").order("created_at", { ascending: false }).limit(200);
    if (error) throw dbErr(error);
    st.all = data || [];
  }
  function dbErr(e) {
    const m = String(e && e.message || e);
    if (/relation .*feedback.* does not exist|Could not find the table/i.test(m)) return new Error("의견함이 아직 준비되지 않았습니다(DB 반영 전). 프로그램 관리자에게 알려 주십시오.");
    return new Error("처리하지 못했습니다: " + m);
  }

  // 메뉴 점: 직원 = 새 답변, OWNER = 접수 상태 의견 수
  async function refreshDot() {
    const b = $("fbBtn"); if (!b || !SB()) return;
    let n = 0;
    try {
      if (owner()) { const { count } = await SB().from("feedback").select("id", { count: "exact", head: true }).eq("status", "new"); n = count || 0; }
      else { await loadMine(); n = st.mine.filter(x => x.replied_at && Date.parse(x.replied_at) > getSeen()).length; }
    } catch (e) { n = 0; }
    b.innerHTML = `의견 보내기${n ? ` <b class="fbdot" aria-label="${owner() ? "새 의견" : "새 답변"} ${n}건">${n}</b>` : ""}`;
  }

  function card(x, all) {
    const c = x.ctx || {};
    return `<article class="fb-item">
      <div class="fb-top"><span class="fb-k ${x.kind}">${esc(KIND[x.kind] || x.kind)}</span><span class="fb-s ${x.status}">${esc(STATUS[x.status] || x.status)}</span><span class="sp-c">${esc(fmt(x.created_at))}${all ? ` · ${esc(x.author_name || "")} ${esc(x.dept || "")}` : ""}</span></div>
      <p class="fb-body">${esc(x.body)}</p>
      ${all ? `<p class="sp-c fb-ctx">화면 ${esc(c.screen || "-")}${c.dialog ? " · " + esc(c.dialog) : ""} · ${esc(c.ver || "")} ${esc(c.env || "")} · ${esc(c.view || "")}${c.errors && c.errors.length ? ` · 최근 오류: ${esc(c.errors.map(e => e.m + (e.src ? " (" + e.src + ":" + e.line + ")" : "")).join(" / "))}` : ""}</p>` : ""}
      ${all ? `<form class="sp-form fb-rep" data-fbid="${x.id}">
          <label>상태<select name="status">${Object.keys(STATUS).map(k => `<option value="${k}" ${k === x.status ? "selected" : ""}>${STATUS[k]}</option>`).join("")}</select></label>
          <label class="fb-grow">답변 <span class="sp-c">보낸 사람에게 보입니다. 보류는 사유 필수</span><input name="reply" maxlength="1000" value="${esc(x.reply || "")}" placeholder="예: 다음 업데이트에 반영합니다"></label>
          <button class="btn main">저장</button></form>`
        : x.reply ? `<p class="fb-reply"><b>답변</b> ${esc(x.reply)} <span class="sp-c">${esc(fmt(x.replied_at))}</span></p>` : `<p class="sp-c">아직 답변이 없습니다.</p>`}
    </article>`;
  }

  function render() {
    const box = $("fbPanel"); if (!box) return;
    const tabs = [["send", "보내기"], ["mine", "내가 보낸 것"]].concat(owner() ? [["all", "전체 의견"]] : []);
    let body = "";
    if (st.tab === "send") {
      body = `<section class="sp-card"><h3>어떤 내용인가요?</h3>
        <div class="fb-kinds" role="radiogroup" aria-label="종류">
          <button type="button" role="radio" data-fbkind="bug" aria-checked="${st.kind === "bug"}"><b>이 프로그램이 이상하거나 불편해요</b><span>버튼이 안 눌림, 화면이 안 뜸, 글씨가 안 보임 등</span></button>
          <button type="button" role="radio" data-fbkind="idea" aria-checked="${st.kind === "idea"}"><b>이런 기능이 있으면 좋겠어요</b><span>업무를 더 빠르게 할 아이디어</span></button>
          <button type="button" data-fbkind="room"><b>객실·시설이 고장났어요</b><span>여기가 아니라 <u>업무로 등록</u>해야 담당 부서에 바로 갑니다 →</span></button>
        </div>
        ${st.kind ? `<form id="fbForm" class="fb-form">
          <label for="fbBody"><b>${st.kind === "bug" ? "무엇을 하다가 어떻게 됐나요?" : "어떤 기능이 필요한가요? 지금은 어떻게 하고 있나요?"}</b></label>
          <textarea id="fbBody" name="body" required minlength="2" maxlength="2000" rows="5" placeholder="${st.kind === "bug" ? "예: 청소·재실에서 1203호 요청 입력을 눌렀는데 입력 칸이 안 열림" : "예: 재실 요청을 한꺼번에 '요청 없음'으로 확정하는 버튼"}"></textarea>
          <p class="sp-c">함께 보내는 정보: 지금 화면 이름, 부서·이름, 기기·화면 크기, 프로그램 버전, 최근 오류. 손님 개인정보(이름·전화번호)는 적지 마십시오.</p>
          <button class="btn main" ${st.busy ? "disabled" : ""}>보내기</button></form>` : ""}
        </section>`;
    } else if (st.tab === "mine") {
      body = `<section class="sp-card"><h3>내가 보낸 것</h3>${st.mine == null ? `<p class="sp-g">불러오는 중…</p>` : st.mine.length ? st.mine.map(x => card(x, false)).join("") : `<p class="sp-g">아직 보낸 의견이 없습니다.</p>`}</section>`;
    } else {
      const list = (st.all || []).filter(x => st.filter === "all" || (st.filter === "open" ? x.status === "new" || x.status === "review" : x.status === st.filter));
      const cnt = k => (st.all || []).filter(x => k === "open" ? x.status === "new" || x.status === "review" : k === "all" || x.status === k).length;
      body = `<div class="sp-tabs fb-f">${[["open", "처리할 것"], ["done", "반영됨"], ["hold", "보류"], ["all", "전체"]].map(([k, n]) => `<button type="button" data-fbf="${k}" aria-pressed="${st.filter === k}">${n} ${st.all ? cnt(k) : ""}</button>`).join("")}</div>
        <section class="sp-card">${st.all == null ? `<p class="sp-g">불러오는 중…</p>` : list.length ? list.map(x => card(x, true)).join("") : `<p class="sp-g">해당하는 의견이 없습니다.</p>`}</section>`;
    }
    box.innerHTML = `<div class="sp-head"><b>의견 보내기</b><button type="button" class="x2" data-fb="close" aria-label="닫기">×</button></div>
      ${st.msg ? `<p class="sp-msg ${st.err ? "err" : ""}" role="status">${esc(st.msg)}</p>` : ""}
      <div class="sp-tabs">${tabs.map(([k, n]) => `<button type="button" data-fbtab="${k}" aria-pressed="${st.tab === k}">${n}</button>`).join("")}</div>
      ${body}`;
  }

  async function show(tab) {
    st.tab = tab; render();
    try {
      if (tab === "mine") { await loadMine(); const last = Math.max(0, ...st.mine.map(x => x.replied_at ? Date.parse(x.replied_at) : 0)); if (last > getSeen()) setSeen(last); }
      if (tab === "all") await loadAll();
    } catch (e) { st.msg = e.message; st.err = true; }
    render();
  }
  function open() {
    let box = $("fbPanel");
    if (!box) { box = document.createElement("div"); box.id = "fbPanel"; box.className = "sp"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "의견 보내기"); document.body.appendChild(box); }
    box.hidden = false; st.msg = ""; st.err = false; st.kind = ""; st.mine = null; st.all = null;
    show(owner() ? "all" : "send");
  }
  function close() { const box = $("fbPanel"); if (box) box.hidden = true; refreshDot(); }

  document.addEventListener("click", e => {
    if (e.target.closest("#fbBtn")) { open(); return; }
    const box = $("fbPanel"); if (!box || box.hidden || !box.contains(e.target)) return;
    if (e.target.closest("[data-fb=close]")) { close(); return; }
    const t = e.target.closest("[data-fbtab]"); if (t) { st.msg = ""; show(t.dataset.fbtab); return; }
    const f = e.target.closest("[data-fbf]"); if (f) { st.filter = f.dataset.fbf; render(); return; }
    const k = e.target.closest("[data-fbkind]");
    if (k) {
      if (k.dataset.fbkind === "room") { close(); const w = document.querySelector('[data-tab="work"]'); if (w) w.click(); return; }
      st.kind = k.dataset.fbkind; st.msg = ""; render(); const ta = $("fbBody"); if (ta) ta.focus(); return;
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("fbPanel") && !$("fbPanel").hidden) close(); });
  document.addEventListener("submit", async e => {
    const f = e.target; if (!f.closest || !f.closest("#fbPanel")) return;
    e.preventDefault();
    if (f.id === "fbForm") {
      const body = String(new FormData(f).get("body") || "").trim();
      if (body.length < 2) return;
      st.busy = true; render();
      try {
        const a = A();
        const { error } = await SB().from("feedback").insert({ kind: st.kind, body, author_id: a.uid, author_name: String(a.name || a.label || "").slice(0, 40), dept: String(a.dept || "").slice(0, 8), ctx: context() });
        if (error) throw dbErr(error);
        st.msg = "보냈습니다. 처리 상태와 답변은 \"내가 보낸 것\"에서 볼 수 있습니다."; st.err = false; st.kind = "";
      } catch (err) { st.msg = err.message; st.err = true; }
      st.busy = false; render(); return;
    }
    const id = f.dataset.fbid;
    if (id) {
      const v = Object.fromEntries(new FormData(f).entries()), reply = String(v.reply || "").trim();
      if (v.status === "hold" && !reply) { st.msg = "보류는 사유를 답변에 적어야 합니다."; st.err = true; render(); return; }
      const cur = (st.all || []).find(x => String(x.id) === id) || {};
      const patch = { status: v.status, reply };
      if (reply !== (cur.reply || "") || v.status !== cur.status) Object.assign(patch, { replied_by: A().uid, replied_at: new Date().toISOString() });
      const { error } = await SB().from("feedback").update(patch).eq("id", id);
      if (error) { st.msg = dbErr(error).message; st.err = true; } else { st.msg = "저장했습니다. 보낸 사람 메뉴에 표시됩니다."; st.err = false; await loadAll().catch(() => {}); }
      render();
    }
  });

  window.OPS_FEEDBACK = {
    mount() {
      const me = document.querySelector(".me");
      if (!me) { setTimeout(() => this.mount(), 300); return; }
      if ($("fbBtn")) return;
      const b = document.createElement("button"); b.type = "button"; b.className = "tgl"; b.id = "fbBtn"; b.textContent = "의견 보내기";
      const lb = $("lockBtn");
      if (lb && lb.parentNode) lb.parentNode.insertBefore(b, lb); else me.appendChild(b);
      refreshDot();
      setInterval(() => { if (!document.hidden) refreshDot(); }, 5 * 60000);
    }
  };
})();
