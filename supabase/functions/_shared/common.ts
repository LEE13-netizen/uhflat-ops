// 서버 함수 공통: 응답, Supabase 클라이언트, PIN → 실제 비밀번호 변환, PIN 규칙, 감사 로그
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const BRANCH = "SEOCHO";
export const EMAIL_DOMAIN = "staff.uhc.internal";
export const PEPPER_VERSION = 1;

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function anonClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 요청을 보낸 사람(로그인 토큰) 확인
export async function caller(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

const peppers = new Map<number, string>();
async function pepper(admin: SupabaseClient, v: number): Promise<string> {
  if (peppers.has(v)) return peppers.get(v)!;
  const { data, error } = await admin.rpc("ops_pin_pepper", { p_version: v });
  if (error || !data) throw new Error("서버 비밀값을 읽지 못했습니다.");
  peppers.set(v, data as string);
  return data as string;
}

// 실제 Supabase Auth 비밀번호 = base64(HMAC-SHA256(PEPPER, 사용자ID:PIN)). PIN 자체는 어디에도 저장하지 않는다.
export async function derivePassword(admin: SupabaseClient, userId: string, pin: string, v = PEPPER_VERSION): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(await pepper(admin, v)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId + ":" + pin));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// 로그인 아이디: 보통 직원 이름(한글). 공백은 빼고, 영문은 소문자로 맞춘다. 같은 이름이 있으면 '홍길동2'처럼 구분
export const ID_RE = /^[가-힣a-z0-9._-]{2,20}$/;
export const normId = (v: unknown) => String(v ?? "").normalize("NFC").replace(/\s+/g, "").toLowerCase();

export const PIN_RE = /^\d{6}$/;
// 금지 PIN: 같은 숫자 6개, 오름·내림 연속
export function pinProblem(pin: string): string | null {
  if (!PIN_RE.test(pin)) return "PIN은 숫자 6자리입니다.";
  if (/^(\d)\1{5}$/.test(pin)) return "같은 숫자만 반복한 PIN은 쓸 수 없습니다.";
  const d = pin.split("").map(Number);
  const up = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const down = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (up || down) return "연속된 숫자(123456 등)는 쓸 수 없습니다.";
  return null;
}
export function randomPin(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const p = String(n).padStart(6, "0");
    if (!pinProblem(p)) return p;
  }
}

export async function audit(admin: SupabaseClient, e: { actor_id?: string | null; action: string; target_type?: string; target_id?: string; before?: unknown; after?: unknown }) {
  await admin.from("audit_logs").insert({ branch_id: BRANCH, actor_id: e.actor_id ?? null, action: e.action, target_type: e.target_type ?? null, target_id: e.target_id ?? null, before: e.before ?? null, after: e.after ?? null });
}

// 잠금 단계: 누적 10회 → 15분, 15회 → 30분, 16회 이상 → 관리자 해제
export function lockFor(failed: number): { until: Date | null; admin: boolean } {
  if (failed >= 16) return { until: null, admin: true };
  if (failed === 15) return { until: new Date(Date.now() + 30 * 60000), admin: false };
  if (failed === 10) return { until: new Date(Date.now() + 15 * 60000), admin: false };
  return { until: null, admin: false };
}
