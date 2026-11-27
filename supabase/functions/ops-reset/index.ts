// 초기화(보관 후 비우기) · 되살리기 — SYSTEM OWNER(개인 계정)만, 본인 PIN 확인 + 확인 문구
// action: preview(건수) · batches(보관 묶음 목록) · reset(pin, confirm, cols) · restore(pin, batch)
// PIN이 틀리면 로그인 실패와 같이 세어 잠근다. 모든 실행은 감사 로그에 남는다.
import { adminClient, anonClient, audit, caller, cors, derivePassword, json, lockFor, PIN_RE } from "../_shared/common.ts";

const CONFIRM = "전체 초기화";
const ALLOWED = ["roomSvc", "deliveries", "tasks", "roomNotes", "manualStays", "stock", "roomDays", "stayIndex"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST만 허용" });
  const admin = adminClient();
  const user = await caller(req, admin);
  if (!user) return json(401, { error: "로그인이 필요합니다." });
  const { data: p } = await admin.from("profiles").select("user_id, auth_email, active, role, pepper_version").eq("user_id", user.id).maybeSingle();
  if (!p || !p.active || p.role !== "super_admin") return json(403, { error: "SYSTEM OWNER(개인 계정)만 할 수 있습니다." });

  let body: { action?: string; pin?: string; confirm?: string; cols?: string[]; batch?: string };
  try { body = await req.json(); } catch { return json(400, { error: "잘못된 요청" }); }
  const action = String(body.action || "");

  if (action === "preview") {
    const { data, error } = await admin.rpc("ops_reset_preview");
    return error ? json(500, { error: "건수를 읽지 못했습니다." }) : json(200, { counts: data });
  }
  if (action === "batches") {
    const { data, error } = await admin.rpc("ops_reset_batches");
    return error ? json(500, { error: "보관 목록을 읽지 못했습니다." }) : json(200, { batches: data });
  }
  if (action !== "reset" && action !== "restore") return json(400, { error: "알 수 없는 요청" });

  // 본인 PIN 확인(잠금 중이면 거절, 틀리면 실패 횟수 증가)
  const pin = String(body.pin || "");
  const { data: g } = await admin.from("auth_guard").select("failed_count, locked_until, admin_lock").eq("user_id", p.user_id).maybeSingle();
  if (g && (g.admin_lock || (g.locked_until && new Date(g.locked_until) > new Date()))) return json(423, { error: "계정이 잠겨 있습니다. 잠금이 풀린 뒤 다시 하십시오." });
  if (!PIN_RE.test(pin)) return json(401, { error: "PIN이 맞지 않습니다." });
  const ok = await anonClient().auth.signInWithPassword({ email: p.auth_email, password: await derivePassword(admin, p.user_id, pin, p.pepper_version) });
  if (ok.error) {
    const failed = ((g && g.failed_count) || 0) + 1, lk = lockFor(failed);
    await admin.from("auth_guard").upsert({ user_id: p.user_id, failed_count: failed, last_failed_at: new Date().toISOString(), locked_until: lk.until ? lk.until.toISOString() : (g && g.locked_until) || null, admin_lock: lk.admin || !!(g && g.admin_lock) });
    await audit(admin, { actor_id: p.user_id, action: action === "reset" ? "ops_reset_denied" : "ops_restore_denied", target_type: "ops_docs", after: { reason: "pin" } });
    return json(401, { error: "PIN이 맞지 않습니다." });
  }
  await admin.from("auth_guard").upsert({ user_id: p.user_id, failed_count: 0, locked_until: null });

  if (action === "reset") {
    if (String(body.confirm || "").trim() !== CONFIRM) return json(400, { error: `확인 문구 "${CONFIRM}"를 정확히 적어 주십시오.` });
    const cols = (Array.isArray(body.cols) ? body.cols : []).filter((c) => ALLOWED.includes(c));
    if (!cols.length) return json(400, { error: "초기화할 항목을 하나 이상 고르십시오." });
    const { data, error } = await admin.rpc("ops_reset_archive", { p_actor: p.user_id, p_cols: cols });
    if (error) return json(500, { error: "초기화하지 못했습니다: " + error.message });
    await audit(admin, { actor_id: p.user_id, action: "ops_reset", target_type: "ops_docs", target_id: (data as { batch: string }).batch, after: data });
    return json(200, data);
  }
  const batch = String(body.batch || "");
  if (!/^[0-9a-f-]{36}$/i.test(batch)) return json(400, { error: "보관 묶음을 고르십시오." });
  const { data, error } = await admin.rpc("ops_reset_restore", { p_batch: batch });
  if (error) return json(400, { error: error.message });
  await audit(admin, { actor_id: p.user_id, action: "ops_restore", target_type: "ops_docs", target_id: batch, after: data });
  return json(200, data);
});
