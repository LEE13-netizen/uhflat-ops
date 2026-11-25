// 본인 PIN 변경: 현재 PIN 확인 → 새 PIN 규칙 검사 → Auth 비밀번호 교체 → 첫 로그인 표시 해제
import { adminClient, anonClient, audit, caller, cors, derivePassword, json, lockFor, PEPPER_VERSION, PIN_RE, pinProblem } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST만 허용" });
  const admin = adminClient();
  const user = await caller(req, admin);
  if (!user) return json(401, { error: "로그인이 필요합니다." });
  let body: { current_pin?: string; new_pin?: string };
  try { body = await req.json(); } catch { return json(400, { error: "잘못된 요청" }); }
  const cur = String(body.current_pin || ""), next = String(body.new_pin || "");

  const { data: p } = await admin.from("profiles").select("user_id, auth_email, active, pepper_version").eq("user_id", user.id).maybeSingle();
  if (!p || !p.active) return json(403, { error: "사용할 수 없는 계정입니다." });
  if (!PIN_RE.test(cur)) return json(400, { error: "현재 PIN을 확인해 주십시오." });
  const prob = pinProblem(next);
  if (prob) return json(400, { error: prob });
  if (cur === next) return json(400, { error: "지금 PIN과 다른 PIN을 정해 주십시오." });

  // 현재 PIN 확인(틀리면 로그인 실패와 같이 센다)
  const ok = await anonClient().auth.signInWithPassword({ email: p.auth_email, password: await derivePassword(admin, p.user_id, cur, p.pepper_version) });
  if (ok.error) {
    const { data: g } = await admin.from("auth_guard").select("failed_count, locked_until, admin_lock").eq("user_id", p.user_id).maybeSingle();
    const failed = ((g && g.failed_count) || 0) + 1, lk = lockFor(failed);
    await admin.from("auth_guard").upsert({ user_id: p.user_id, failed_count: failed, last_failed_at: new Date().toISOString(), locked_until: lk.until ? lk.until.toISOString() : (g && g.locked_until) || null, admin_lock: lk.admin || !!(g && g.admin_lock) });
    return json(401, { error: "현재 PIN이 맞지 않습니다." });
  }

  const { error } = await admin.auth.admin.updateUserById(p.user_id, { password: await derivePassword(admin, p.user_id, next, PEPPER_VERSION) });
  if (error) return json(500, { error: "PIN을 바꾸지 못했습니다." });
  await admin.from("profiles").update({ must_change_pin: false, pepper_version: PEPPER_VERSION, updated_at: new Date().toISOString() }).eq("user_id", p.user_id);
  await admin.from("auth_guard").upsert({ user_id: p.user_id, failed_count: 0, locked_until: null });
  await audit(admin, { actor_id: p.user_id, action: "pin_changed", target_type: "profile", target_id: p.user_id });
  return json(200, { ok: true });
});
