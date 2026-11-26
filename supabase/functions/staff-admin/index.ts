// 직원·권한 관리. 모든 권한 검사는 여기(서버)에서 한다.
// 프로그램 관리자(super_admin): 모든 부서·직원, 부서 관리자 지정, 부서 이동, 설정
// 부서 관리자(dept_admin): 자기 부서의 일반 직원만(추가·정보 수정·PIN 초기화·잠금 해제·비활성화)
import { adminClient, audit, BRANCH, caller, cors, derivePassword, EMAIL_DOMAIN, ID_RE, json, normId, PEPPER_VERSION, randomPin } from "../_shared/common.ts";

type Prof = { user_id: string; login_id: string; name: string; title: string; dept_id: string; role: string; active: boolean; must_change_pin: boolean; branch_id: string };
const PUBLIC = "user_id, login_id, name, title, dept_id, role, active, must_change_pin, branch_id, created_at, deactivated_at";
const ID_MSG = "아이디는 이름(한글)·영문·숫자로 2~20자입니다. 같은 이름이 있으면 '홍길동2'처럼 붙여 주십시오.";
const ID_DUP = "같은 아이디가 이미 있습니다. 같은 이름이면 아이디를 '홍길동2'처럼 따로 적어 주십시오.";
const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST만 허용" });
  const admin = adminClient();
  const user = await caller(req, admin);
  if (!user) return json(401, { error: "로그인이 필요합니다." });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "잘못된 요청" }); }
  const action = String(b.action || "");

  const dept = async (code: string) => (await admin.from("departments").select("id, code, name").eq("branch_id", BRANCH).eq("code", code).maybeSingle()).data;

  // 최초 1회: 부서 공용 '프로그램 관리자' 계정으로 개인 프로그램 관리자 계정을 만든다
  if (action === "bootstrap") {
    if (user.app_metadata?.owner !== true) return json(403, { error: "프로그램 관리자 공용 계정으로만 할 수 있습니다." });
    const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("branch_id", BRANCH).eq("role", "super_admin");
    if (count) return json(409, { error: "프로그램 관리자가 이미 있습니다." });
    return await createStaff(b, "MG", "super_admin", user.id);
  }

  const { data: me } = await admin.from("profiles").select(PUBLIC).eq("user_id", user.id).maybeSingle() as { data: Prof | null };
  if (!me || !me.active) return json(403, { error: "권한이 없습니다." });
  const isSuper = me.role === "super_admin", isDeptAdmin = me.role === "dept_admin";
  if (!isSuper && !isDeptAdmin) return json(403, { error: "관리자만 할 수 있습니다." });
  // OTP 필수 설정이 켜져 있으면 2단계 인증을 마친 세션만
  const { data: set } = await admin.from("app_settings").select("*").eq("branch_id", BRANCH).single();
  if (set?.otp_required) {
    const aal = JSON.parse(atob((req.headers.get("Authorization") || "").split(".")[1] || "e30=")).aal;
    if (aal !== "aal2") return json(403, { error: "2단계 인증이 필요합니다." });
  }

  // 대상 직원 + 범위 검사
  async function target(id: unknown): Promise<Prof | Response> {
    const { data: t } = await admin.from("profiles").select(PUBLIC).eq("user_id", String(id || "")).eq("branch_id", BRANCH).maybeSingle() as { data: Prof | null };
    if (!t) return json(404, { error: "직원을 찾지 못했습니다." });
    if (t.role === "super_admin" && t.user_id !== me!.user_id) return json(403, { error: "프로그램 관리자 계정은 바꿀 수 없습니다." });
    if (!isSuper && (t.dept_id !== me!.dept_id || t.role !== "staff")) return json(403, { error: "자기 부서의 일반 직원만 관리할 수 있습니다." });
    return t;
  }

  if (action === "list") {
    let q = admin.from("profiles").select(PUBLIC).eq("branch_id", BRANCH).order("created_at");
    if (!isSuper) q = q.eq("dept_id", me.dept_id);
    const { data: list } = await q;
    const ids = (list || []).map((x: { user_id: string }) => x.user_id);
    const { data: guards } = ids.length ? await admin.from("auth_guard").select("user_id, failed_count, locked_until, admin_lock, last_login_at").in("user_id", ids) : { data: [] };
    const gm = new Map((guards || []).map((g: { user_id: string }) => [g.user_id, g]));
    return json(200, { me: { user_id: me.user_id, role: me.role, dept_id: me.dept_id }, staff: (list || []).map((x: { user_id: string }) => ({ ...x, guard: gm.get(x.user_id) || null })), settings: isSuper ? set : undefined });
  }

  if (action === "create") {
    const code = isSuper ? clean(b.dept_code, 8) : (await admin.from("departments").select("code").eq("id", me.dept_id).single()).data?.code;
    const role = isSuper && b.role === "dept_admin" ? "dept_admin" : "staff";
    return await createStaff(b, String(code || ""), role, me.user_id);
  }

  if (action === "update") {
    const t = await target(b.user_id); if (t instanceof Response) return t;
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) { const n = clean(b.name, 40); if (!n) return json(400, { error: "이름을 적어 주십시오." }); patch.name = n; }
    if (b.title !== undefined) patch.title = clean(b.title, 30);
    if (b.login_id !== undefined) {
      const id = normId(b.login_id);
      if (id !== t.login_id) {
        if (!ID_RE.test(id)) return json(400, { error: ID_MSG });
        const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("branch_id", BRANCH).eq("login_id", id);
        if (count) return json(409, { error: ID_DUP });
        patch.login_id = id;
      }
    }
    if (!Object.keys(patch).length) return json(400, { error: "바꿀 내용이 없습니다." });
    patch.updated_at = new Date().toISOString();
    await admin.from("profiles").update(patch).eq("user_id", t.user_id);
    await audit(admin, { actor_id: me.user_id, action: "staff_update", target_type: "profile", target_id: t.user_id, before: { name: t.name, title: t.title, login_id: t.login_id }, after: patch });
    return json(200, { ok: true });
  }

  if (action === "reset_pin") {
    const t = await target(b.user_id); if (t instanceof Response) return t;
    const pin = randomPin();
    const { error } = await admin.auth.admin.updateUserById(t.user_id, { password: await derivePassword(admin, t.user_id, pin, PEPPER_VERSION) });
    if (error) return json(500, { error: "PIN을 초기화하지 못했습니다." });
    await admin.from("profiles").update({ must_change_pin: true, pepper_version: PEPPER_VERSION, updated_at: new Date().toISOString() }).eq("user_id", t.user_id);
    await admin.from("auth_guard").upsert({ user_id: t.user_id, failed_count: 0, locked_until: null, admin_lock: false });
    await audit(admin, { actor_id: me.user_id, action: "pin_reset", target_type: "profile", target_id: t.user_id });
    return json(200, { ok: true, temp_pin: pin });
  }

  if (action === "unlock") {
    const t = await target(b.user_id); if (t instanceof Response) return t;
    await admin.from("auth_guard").upsert({ user_id: t.user_id, failed_count: 0, locked_until: null, admin_lock: false });
    await audit(admin, { actor_id: me.user_id, action: "unlock", target_type: "profile", target_id: t.user_id });
    return json(200, { ok: true });
  }

  if (action === "set_active") {
    const t = await target(b.user_id); if (t instanceof Response) return t;
    if (t.user_id === me.user_id) return json(400, { error: "본인 계정은 비활성화할 수 없습니다." });
    const active = b.active === true;
    await admin.from("profiles").update({ active, deactivated_at: active ? null : new Date().toISOString(), deactivated_by: active ? null : me.user_id, updated_at: new Date().toISOString() }).eq("user_id", t.user_id);
    // 비활성화 시 이미 로그인된 기기도 끊는다
    if (!active) await admin.auth.admin.signOut(t.user_id, "global").catch(() => {});
    await audit(admin, { actor_id: me.user_id, action: active ? "staff_activate" : "staff_deactivate", target_type: "profile", target_id: t.user_id, before: { active: t.active }, after: { active } });
    return json(200, { ok: true });
  }

  if (action === "move_dept" || action === "set_role") {
    if (!isSuper) return json(403, { error: "프로그램 관리자만 할 수 있습니다." });
    const t = await target(b.user_id); if (t instanceof Response) return t;
    if (t.user_id === me.user_id) return json(400, { error: "본인 권한·부서는 여기서 바꿀 수 없습니다." });
    let patch: Record<string, unknown>;
    if (action === "move_dept") { const d = await dept(clean(b.dept_code, 8)); if (!d) return json(400, { error: "부서를 찾지 못했습니다." }); patch = { dept_id: d.id }; }
    else { if (!["staff", "dept_admin"].includes(String(b.role))) return json(400, { error: "권한 값이 올바르지 않습니다." }); patch = { role: b.role }; }
    await admin.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", t.user_id);
    await audit(admin, { actor_id: me.user_id, action: action === "move_dept" ? "staff_move_dept" : "staff_set_role", target_type: "profile", target_id: t.user_id, before: action === "move_dept" ? { dept_id: t.dept_id } : { role: t.role }, after: patch });
    return json(200, { ok: true });
  }

  if (action === "settings") {
    if (!isSuper) return json(403, { error: "프로그램 관리자만 할 수 있습니다." });
    const patch: Record<string, unknown> = {};
    if (b.idle_logout_min !== undefined) { const m = Math.round(Number(b.idle_logout_min)); if (!(m >= 1 && m <= 1440)) return json(400, { error: "자동 로그아웃은 1~1440분입니다." }); patch.idle_logout_min = m; }
    if (b.otp_required !== undefined) patch.otp_required = b.otp_required === true;
    if (b.legacy_dept_login !== undefined) patch.legacy_dept_login = b.legacy_dept_login === true;
    if (!Object.keys(patch).length) return json(400, { error: "바꿀 내용이 없습니다." });
    await admin.from("app_settings").update({ ...patch, updated_at: new Date().toISOString(), updated_by: me.user_id }).eq("branch_id", BRANCH);
    await audit(admin, { actor_id: me.user_id, action: "settings_update", target_type: "app_settings", target_id: BRANCH, before: set, after: patch });
    return json(200, { ok: true });
  }

  return json(400, { error: "알 수 없는 요청입니다." });

  // 직원 만들기: Auth 계정(내부 이메일) + 임시 PIN + 프로필. 프로필 저장이 실패하면 Auth 계정을 지워 반쪽 계정을 남기지 않는다
  async function createStaff(b: Record<string, unknown>, deptCode: string, role: string, actorId: string): Promise<Response> {
    const name = clean(b.name, 40), title = clean(b.title, 30);
    // 아이디를 따로 적지 않으면 이름이 아이디
    const loginId = normId(clean(b.login_id, 40) || name);
    if (!name) return json(400, { error: "이름을 적어 주십시오." });
    if (!title) return json(400, { error: "직급을 골라 주십시오." });
    if (!ID_RE.test(loginId)) return json(400, { error: ID_MSG });
    const d = await dept(deptCode); if (!d) return json(400, { error: "부서를 찾지 못했습니다." });
    const { count } = await admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("branch_id", BRANCH).eq("login_id", loginId);
    if (count) return json(409, { error: ID_DUP });
    const email = crypto.randomUUID() + "@" + EMAIL_DOMAIN;
    const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password: crypto.randomUUID() + crypto.randomUUID(), email_confirm: true, app_metadata: { branch: BRANCH, kind: "staff" } });
    if (ce || !cu.user) return json(500, { error: "계정을 만들지 못했습니다." });
    const uid = cu.user.id, pin = randomPin();
    const up = await admin.auth.admin.updateUserById(uid, { password: await derivePassword(admin, uid, pin, PEPPER_VERSION) });
    const ins = up.error ? up : await admin.from("profiles").insert({ user_id: uid, branch_id: BRANCH, login_id: loginId, auth_email: email, name, title, dept_id: d.id, role, must_change_pin: true, pepper_version: PEPPER_VERSION, created_by: actorId });
    if (ins.error) { await admin.auth.admin.deleteUser(uid).catch(() => {}); return json(500, { error: "직원 정보를 저장하지 못했습니다." }); }
    await admin.from("auth_guard").insert({ user_id: uid });
    await audit(admin, { actor_id: actorId, action: role === "super_admin" ? "bootstrap_super_admin" : "staff_create", target_type: "profile", target_id: uid, after: { login_id: loginId, name, title, dept: d.code, role } });
    return json(200, { ok: true, user_id: uid, login_id: loginId, temp_pin: pin });
  }
});
