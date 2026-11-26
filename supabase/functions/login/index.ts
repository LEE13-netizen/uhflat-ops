// 개인 로그인: 아이디 + PIN 6자리 → 잠금 확인 → Supabase Auth 로그인 → 세션 반환
import { adminClient, anonClient, audit, BRANCH, cors, derivePassword, ID_RE, json, lockFor, normId, PIN_RE } from "../_shared/common.ts";

const FAIL = "이름(아이디) 또는 PIN이 맞지 않습니다.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST만 허용" });
  let body: { login_id?: string; pin?: string };
  try { body = await req.json(); } catch { return json(400, { error: "잘못된 요청" }); }
  const loginId = normId(body.login_id);
  const pin = String(body.pin || "");
  if (!ID_RE.test(loginId) || !PIN_RE.test(pin)) return json(401, { error: FAIL });

  const admin = adminClient();
  const { data: p } = await admin.from("profiles")
    .select("user_id, auth_email, active, must_change_pin, pepper_version, name, role")
    .eq("branch_id", BRANCH).eq("login_id", loginId).maybeSingle();
  if (!p || !p.active) { await new Promise((r) => setTimeout(r, 400)); return json(401, { error: FAIL }); }

  const { data: g0 } = await admin.from("auth_guard").select("*").eq("user_id", p.user_id).maybeSingle();
  const g = g0 || { user_id: p.user_id, failed_count: 0, locked_until: null, admin_lock: false };
  if (g.admin_lock) return json(423, { error: "계정이 잠겼습니다. 부서 관리자에게 잠금 해제를 요청하십시오.", admin_lock: true });
  if (g.locked_until && new Date(g.locked_until) > new Date()) {
    const sec = Math.ceil((new Date(g.locked_until).getTime() - Date.now()) / 1000);
    return json(423, { error: `계정이 잠겼습니다. ${Math.ceil(sec / 60)}분 뒤 다시 시도하거나 부서 관리자에게 요청하십시오.`, retry_after: sec });
  }

  const password = await derivePassword(admin, p.user_id, pin, p.pepper_version);
  const { data: s, error } = await anonClient().auth.signInWithPassword({ email: p.auth_email, password });

  if (error || !s.session) {
    const failed = (g.failed_count || 0) + 1;
    const lk = lockFor(failed);
    await admin.from("auth_guard").upsert({
      user_id: p.user_id, failed_count: failed, last_failed_at: new Date().toISOString(),
      locked_until: lk.until ? lk.until.toISOString() : g.locked_until, admin_lock: lk.admin || g.admin_lock,
    });
    if (lk.until || lk.admin) await audit(admin, { actor_id: p.user_id, action: "login_locked", target_type: "profile", target_id: p.user_id, after: { failed, until: lk.until, admin_lock: lk.admin } });
    // 다음 잠금까지 3회 이하일 때만 남은 횟수 표시
    const next = failed < 10 ? 10 : failed < 15 ? 15 : 16;
    const left = next - failed;
    return json(401, { error: FAIL, ...(left <= 3 && left > 0 ? { remaining: left } : {}) });
  }

  await admin.from("auth_guard").upsert({ user_id: p.user_id, failed_count: 0, locked_until: null, admin_lock: false, last_login_at: new Date().toISOString() });
  await audit(admin, { actor_id: p.user_id, action: "login", target_type: "profile", target_id: p.user_id });
  return json(200, {
    access_token: s.session.access_token, refresh_token: s.session.refresh_token, expires_at: s.session.expires_at,
    must_change_pin: p.must_change_pin,
  });
});
