/* 업무 공통 엔진: 등록, 상태 이동, 댓글, 수정, 이력.
   모든 부서의 업무(이슈·요청·청소·점검·수리)가 이 한 엔진을 지난다. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  const S = () => OPS.Store;
  const C = () => OPS.COL;

  // 입력 가림 규칙(서초 인수인계 정리에서 가져옴): 카드번호, 객실·도어락 비밀번호
  const CARD_RE = /(?:\d[ -]?){12,18}\d/g;
  const PW_RE = /(비밀번호|비번|도어락|패스워드|password|pw)(\s*[:：=]?\s*)([0-9*#]{3,})/gi;
  // 서초 톡방 표기: "1512호:37216", 출입 코드 "41769*", "door code 12867"
  const ROOMPW_RE = /(\d{3,4}\s*호\s*[:：]\s*)(\d{4,6})(?!\d)/g;
  const STAR_RE = /(?<!\d)\d{4,6}\*/g;
  const CODE_RE = /((?:door|room)\s*code|출입\s*코드|도어\s*코드)(\s*[:：=]?\s*)([0-9*#]{3,})/gi;
  OPS.mask = t => String(t == null ? "" : t)
    .replace(CARD_RE, "[카드번호 가림]")
    .replace(ROOMPW_RE, (m, a) => a + "[가림]")
    .replace(STAR_RE, "[가림]")
    .replace(CODE_RE, (m, a, b) => a + b + "[가림]")
    .replace(PW_RE, (m, a, b) => a + b + "[가림]");

  const clean = (s, max) => OPS.mask(String(s == null ? "" : s).trim()).slice(0, max);
  const pad = n => String(n).padStart(2, "0");
  OPS.ymd = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  const FIELD_LABEL = { title: "제목", detail: "내용", room: "객실", toDept: "담당 부서", priority: "우선순위", category: "분류", dueAt: "기한" };

  async function logEvent(taskId, actor, action, extra) {
    const e = Object.assign({
      taskId, propertyId: OPS.CTX.propertyId, at: Date.now(), by: actor.name || "(이름 없음)", uid: actor.uid || "", role: actor.role,
      action, from: "", to: "", field: "", note: ""
    }, extra || {});
    await S().add(C().events, e);
    return e;
  }

  function actionLabel(from, to) {
    if (to === "진행 중") return from === "보류" ? "재개" : from === "완료 대기" ? "반려" : from === "완료" ? "다시 열기" : "시작";
    if (to === "완료 대기") return "완료 보고";
    if (to === "완료") return from === "완료 대기" ? "완료 확인" : "완료";
    if (to === "보류") return "보류";
    if (to === "취소") return "취소";
    if (to === "배정") return "배정";
    if (to === "접수") return "접수로 되돌리기";
    return to;
  }

  // 다른 부서가 요청한 업무는 끝내면 요청 부서의 확인을 기다린다(지침서 사례 1·3의 "프론트 최종 확인").
  const finishTarget = t => (t.fromDept && t.fromDept !== t.toDept ? "완료 대기" : "완료");

  // 역할별 허용: 처리 동작은 담당 부서, 확인·취소는 요청 부서, 관리자는 모두.
  function allowed(t, to, role) {
    if (!(OPS.FLOW[t.status] || []).includes(to)) return false;
    if (role === "MG") return true;
    const doer = role === t.toDept, asker = role === t.fromDept;
    if (t.status === "완료 대기") return asker;            // 완료 확인, 반려
    if (t.status === "완료") return asker;                  // 다시 열기
    if (to === "취소") return asker;
    if (to === "접수" || to === "배정") return doer;
    return doer;                                            // 시작, 완료, 보류, 재개
  }

  OPS.Core = {
    finishTarget,
    actionLabel,
    canMove: (t, to, role) => allowed(t, to, role),

    // 화면에 보여 줄 버튼: 첫 번째가 주 동작
    actions(t, role) {
      const out = [];
      const push = to => { if (allowed(t, to, role) && !out.some(a => a.to === to)) out.push({ to, label: actionLabel(t.status, to) }); };
      if (t.status === "접수" || t.status === "배정") { push("진행 중"); push("보류"); push("취소"); }
      else if (t.status === "진행 중") { push(finishTarget(t)); push("보류"); }
      else if (t.status === "완료 대기") { push("완료"); push("진행 중"); }
      else if (t.status === "보류") { push("진행 중"); push("취소"); }
      else if (t.status === "완료") { push("진행 중"); }
      return out;
    },

    async createTask(input, actor) {
      const title = clean(input.title, 120);
      if (!title) throw new Error("제목을 적어 주세요.");
      const kind = OPS.KINDS.some(k => k.id === input.kind) ? input.kind : "issue";
      const toDept = OPS.DEPTS.some(d => d.id === input.toDept) ? input.toDept : OPS.defaultTo(kind);
      const priority = OPS.PRIORITY.includes(input.priority) ? input.priority : "일반";
      const now = Date.now();
      const t = {
        propertyId: OPS.CTX.propertyId,
        kind, title,
        detail: clean(input.detail, 2000),
        room: clean(input.room, 20),
        building: /^[a-z][a-z0-9]{0,11}$/.test(input.building || "") ? input.building : "",
        roomId: /^[a-z][a-z0-9]{0,11}-\d{1,5}$/.test(input.roomId || "") ? input.roomId : "",
        category: OPS.CATEGORIES.includes(input.category) ? input.category : "",
        fromDept: actor.role, toDept,
        assignee: "", status: "접수", priority,
        dueAt: Number(input.dueAt) || null,
        createdAt: now, updatedAt: now, startedAt: null, doneAt: null,
        createdBy: actor.name || "(이름 없음)", createdUid: actor.uid || "", createdRole: actor.role,
        part: actor.part || "", date: OPS.ymd(now),
        carryCount: 0, parentId: input.parentId || "",
        ack: { [actor.role]: now }
      };
      const id = await S().add(C().tasks, t);
      await logEvent(id, actor, "등록", { to: t.status, note: OPS.deptName(t.fromDept) + " → " + OPS.deptName(t.toDept) });
      return Object.assign({ id }, t);
    },

    async move(t, to, actor, note) {
      if (!allowed(t, to, actor.role)) throw new Error(OPS.deptName(actor.role) + " 역할에서는 '" + actionLabel(t.status, to) + "'을(를) 할 수 없습니다.");
      const now = Date.now();
      const patch = { status: to, updatedAt: now };
      if (to === "진행 중" && !t.startedAt) patch.startedAt = now;
      // 완료 보고·반려·다시 열기처럼 상대 부서가 알아야 하는 변경만 확인을 초기화한다(잦은 깜빡임 방지)
      const resetAck = to === "완료 대기" || t.status === "완료 대기" || t.status === "완료";
      patch.ack = resetAck ? { [actor.role]: now } : Object.assign({}, t.ack || {}, { [actor.role]: now });
      if (to === "완료") patch.doneAt = now;
      if (t.status === "완료" && to !== "완료") patch.doneAt = null;
      await S().update(C().tasks, t.id, patch);
      await logEvent(t.id, actor, actionLabel(t.status, to), { from: t.status, to, note: clean(note, 500) });
      return Object.assign({}, t, patch);
    },

    // 부서별 확인: 깜빡임은 "우리 부서가 아직 확인 안 함"을 뜻한다
    needsAck(t, role) {
      if (!OPS.OPEN.has(t.status)) return false;
      if (t.ack && t.ack[role]) return false;
      if (role === "MG" || role === "FO") return true;           // 프론트는 응대 창구라 모든 열린 업무를 확인
      return t.toDept === role || (t.fromDept === role && t.status === "완료 대기");
    },
    async ack(t, actor) {
      if (t.ack && t.ack[actor.role]) return t;
      const ack = Object.assign({}, t.ack || {}, { [actor.role]: Date.now() });
      await S().update(C().tasks, t.id, { ack });
      await logEvent(t.id, actor, "확인", {});
      return Object.assign({}, t, { ack });
    },

    async comment(t, text, actor) {
      const note = clean(text, 1000);
      if (!note) throw new Error("내용을 적어 주세요.");
      await S().update(C().tasks, t.id, { updatedAt: Date.now() });
      return logEvent(t.id, actor, "댓글", { note });
    },

    // 항목별 전·후 값을 이력에 남긴다(서초·속초 변경 이력 구조).
    async edit(t, patch, actor) {
      const changes = [];
      const next = {};
      Object.keys(FIELD_LABEL).forEach(k => {
        if (!(k in patch)) return;
        let v = patch[k];
        if (k === "title") v = clean(v, 120);
        else if (k === "detail") v = clean(v, 2000);
        else if (k === "room") v = clean(v, 20);
        if (String(t[k] == null ? "" : t[k]) !== String(v == null ? "" : v)) { next[k] = v; changes.push(k); }
      });
      if (!changes.length) return t;
      next.updatedAt = Date.now();
      await S().update(C().tasks, t.id, next);
      for (const k of changes) {
        await logEvent(t.id, actor, "수정", { field: FIELD_LABEL[k], from: String(t[k] == null ? "" : t[k]).slice(0, 80), to: String(next[k] == null ? "" : next[k]).slice(0, 80) });
      }
      return Object.assign({}, t, next);
    },

    isOpen: t => OPS.OPEN.has(t.status),
    isOverdue: (t, now = Date.now()) => !!t.dueAt && OPS.OPEN.has(t.status) && t.status !== "보류" && now > t.dueAt,

    // 긴급 먼저, 같은 우선순위는 오래된 것 먼저
    sort: list => list.slice().sort((a, b) =>
      (OPS.PRIORITY_RANK[a.priority] - OPS.PRIORITY_RANK[b.priority]) || (a.createdAt - b.createdAt))
  };
})(typeof window !== "undefined" ? window : globalThis);
