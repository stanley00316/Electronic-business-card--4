// Supabase Edge Function: Apple Sign In → issue Supabase-compatible JWT (role=authenticated)
// 功能：使用 Apple Sign In 登入，簽發自訂 JWT
//
// 必要環境變數（在 Supabase Dashboard → Edge Functions → Secrets 設定）：
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - JWT_SECRET（或舊名 SUPABASE_JWT_SECRET）
// - APPLE_CLIENT_ID (Services ID)
// - APPLE_TEAM_ID
// - APPLE_KEY_ID
// - APPLE_PRIVATE_KEY (ES256 私鑰，PEM 格式，需移除換行)
//
// 前端呼叫：POST { code, redirect_uri, id_token? }
// 回傳：{ access_token, token_type, expires_in, user_id }
//
// 注意：Apple Sign In 需要 Apple Developer Program ($99/年)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BUILD_ID = "2026-01-26-1";

function json(obj: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("x-uvaco-build", BUILD_ID);
  return new Response(JSON.stringify(obj), { ...init, headers });
}

function bad(msg: string, extra: Record<string, unknown> = {}) {
  return json({ error: msg, ...extra }, { status: 400 });
}

function base64UrlEncode(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function normalizeSecret(v: string | undefined | null) {
  const s = String(v || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

async function signJwtHS256(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${data}.${sigB64}`;
}

// 將 PEM 私鑰轉換為可用格式
function pemToArrayBuffer(pem: string): ArrayBuffer {
  // 移除 PEM 頭尾和換行
  const b64 = pem
    .replace(/-----BEGIN (?:EC )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:EC )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// 生成 Apple client_secret (ES256 JWT)
async function generateAppleClientSecret(
  teamId: string,
  clientId: string,
  keyId: string,
  privateKeyPem: string
): Promise<string> {
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 86400 * 180, // 6 months
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  // 導入私鑰
  const keyData = pemToArrayBuffer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // 簽名
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(data)
  );

  // 轉換簽名格式 (DER to raw)
  const sigArray = new Uint8Array(signature);
  const sigB64 = base64UrlEncode(sigArray);

  return `${data}.${sigB64}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const ms = Math.max(parseInt(String(timeoutMs || 0), 10) || 0, 500);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function exchangeAppleCodeForToken(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const resp = await fetchWithTimeout("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }, 8000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false as const, status: resp.status, data };
  }
  return { ok: true as const, data };
}

// 解碼 Apple ID Token 取得使用者資訊
function decodeAppleIdToken(idToken: string): { sub: string; email?: string; name?: string } | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    return {
      sub: payload.sub || "",
      email: payload.email || "",
      name: payload.name || "",
    };
  } catch {
    return null;
  }
}

async function supabaseRest(
  baseUrl: string,
  serviceRoleKey: string,
  pathAndQuery: string,
  init: RequestInit,
) {
  const url = baseUrl.replace(/\/$/, "") + pathAndQuery;
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("authorization", `Bearer ${serviceRoleKey}`);
  headers.set("accept", "application/json");
  return await fetchWithTimeout(url, { ...init, headers }, 5000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED", build: BUILD_ID }, { status: 405 });

  const SUPABASE_URL =
    normalizeSecret(Deno.env.get("SUPABASE_URL")) ||
    normalizeSecret(Deno.env.get("PROJECT_URL")) ||
    "";
  const SUPABASE_SERVICE_ROLE_KEY =
    normalizeSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE_KEY")) ||
    "";
  const SUPABASE_JWT_SECRET = normalizeSecret(Deno.env.get("JWT_SECRET")) || normalizeSecret(Deno.env.get("SUPABASE_JWT_SECRET")) || "";
  const APPLE_CLIENT_ID = normalizeSecret(Deno.env.get("APPLE_CLIENT_ID")) || "";
  const APPLE_TEAM_ID = normalizeSecret(Deno.env.get("APPLE_TEAM_ID")) || "";
  const APPLE_KEY_ID = normalizeSecret(Deno.env.get("APPLE_KEY_ID")) || "";
  const APPLE_PRIVATE_KEY = normalizeSecret(Deno.env.get("APPLE_PRIVATE_KEY")) || "";

  // 診斷端點
  if (req.method === "GET") {
    return json({
      ok: true,
      build: BUILD_ID,
      has: {
        supabase_url: !!SUPABASE_URL,
        service_role_key: !!SUPABASE_SERVICE_ROLE_KEY,
        jwt_secret: !!SUPABASE_JWT_SECRET,
        apple_client_id: !!APPLE_CLIENT_ID,
        apple_team_id: !!APPLE_TEAM_ID,
        apple_key_id: !!APPLE_KEY_ID,
        apple_private_key: !!APPLE_PRIVATE_KEY,
      },
      len: {
        apple_client_id: APPLE_CLIENT_ID.length,
        apple_team_id: APPLE_TEAM_ID.length,
        apple_key_id: APPLE_KEY_ID.length,
        apple_private_key: APPLE_PRIVATE_KEY.length,
      },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_JWT_SECRET) {
    return bad("MISSING_SUPABASE_SECRETS", { build: BUILD_ID });
  }
  if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    return bad("MISSING_APPLE_SECRETS", { build: BUILD_ID });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch (_e) {
    return bad("INVALID_JSON", { build: BUILD_ID });
  }

  if (String(body?.action || "").trim() === "diag") {
    return json({
      ok: true,
      build: BUILD_ID,
      has: {
        supabase_url: !!SUPABASE_URL,
        service_role_key: !!SUPABASE_SERVICE_ROLE_KEY,
        jwt_secret: !!SUPABASE_JWT_SECRET,
        apple_client_id: !!APPLE_CLIENT_ID,
        apple_team_id: !!APPLE_TEAM_ID,
        apple_key_id: !!APPLE_KEY_ID,
        apple_private_key: !!APPLE_PRIVATE_KEY,
      },
    });
  }

  const code = String(body?.code || "").trim();
  const redirectUri = String(body?.redirect_uri || "").trim();
  const idTokenFromBody = String(body?.id_token || "").trim();
  
  if (!code) return bad("MISSING_CODE");
  if (!redirectUri) return bad("MISSING_REDIRECT_URI");

  // 1) 生成 client_secret
  let clientSecret: string;
  try {
    clientSecret = await generateAppleClientSecret(APPLE_TEAM_ID, APPLE_CLIENT_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY);
  } catch (e) {
    return bad("CLIENT_SECRET_GENERATION_FAILED", { detail: String(e) });
  }

  // 2) Exchange code → tokens
  const tokenRes = await exchangeAppleCodeForToken(code, redirectUri, APPLE_CLIENT_ID, clientSecret);
  if (!tokenRes.ok) {
    return json({ error: "APPLE_TOKEN_EXCHANGE_FAILED", detail: tokenRes.data }, { status: 400 });
  }
  
  const idToken = String((tokenRes.data as any)?.id_token || idTokenFromBody || "");
  if (!idToken) return bad("APPLE_NO_ID_TOKEN", { detail: tokenRes.data });

  // 3) 解碼 id_token 取得使用者資訊
  const userInfo = decodeAppleIdToken(idToken);
  if (!userInfo || !userInfo.sub) {
    return bad("APPLE_INVALID_ID_TOKEN");
  }

  const appleUserId = userInfo.sub;
  const email = userInfo.email || "";
  // Apple 只在第一次登入時提供姓名，需要從前端傳入
  const displayName = String(body?.user?.name?.firstName || "") + " " + String(body?.user?.name?.lastName || "");

  // 4) Map Apple userId → user_id (uuid) in public.apple_identities
  const q = `/rest/v1/apple_identities?select=user_id&apple_user_id=eq.${encodeURIComponent(appleUserId)}&limit=1`;
  const qResp = await supabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, q, { method: "GET" });
  const qJson = await qResp.json().catch(() => null);
  if (!qResp.ok) return json({ error: "DB_QUERY_FAILED", detail: qJson }, { status: 500 });
  const existingUserId = String((Array.isArray(qJson) ? qJson?.[0]?.user_id : "") || "").trim();

  const userId = existingUserId || crypto.randomUUID();
  const nowIso = new Date().toISOString();
  if (!existingUserId) {
    const iResp = await supabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, `/rest/v1/apple_identities`, {
      method: "POST",
      headers: { "content-type": "application/json", "prefer": "return=minimal" },
      body: JSON.stringify([{
        apple_user_id: appleUserId,
        user_id: userId,
        email: email,
        display_name: displayName.trim() || null,
        last_login_at: nowIso,
      }]),
    });
    const iJson = await iResp.json().catch(() => null);
    if (!iResp.ok) return json({ error: "DB_INSERT_FAILED", detail: iJson }, { status: 500 });
  } else {
    const uResp = await supabaseRest(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      `/rest/v1/apple_identities?apple_user_id=eq.${encodeURIComponent(appleUserId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "prefer": "return=minimal" },
        body: JSON.stringify({ last_login_at: nowIso }),
      },
    );
    // best-effort update
  }

  // 5) Issue JWT for Supabase PostgREST/Storage
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 24 * 7; // 7 days
  const jwt = await signJwtHS256({
    aud: "authenticated",
    role: "authenticated",
    sub: userId,
    iat: now,
    exp: now + expiresIn,
    email: email,
  }, SUPABASE_JWT_SECRET);

  return json({
    access_token: jwt,
    token_type: "bearer",
    expires_in: expiresIn,
    user_id: userId,
    email: email,
  });
});
