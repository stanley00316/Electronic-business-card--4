// Supabase Edge Function: Google OAuth → issue Supabase-compatible JWT (role=authenticated)
// 功能：使用 Google OAuth 登入，簽發自訂 JWT
//
// 必要環境變數（在 Supabase Dashboard → Edge Functions → Secrets 設定）：
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - JWT_SECRET（或舊名 SUPABASE_JWT_SECRET）
// - GOOGLE_CLIENT_ID
// - GOOGLE_CLIENT_SECRET
//
// 前端呼叫：POST { code, redirect_uri }
// 回傳：{ access_token, token_type, expires_in, user_id }

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

async function exchangeGoogleCodeForToken(code: string, redirectUri: string, clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const resp = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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

async function fetchGoogleUserInfo(accessToken: string) {
  const resp = await fetchWithTimeout("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  }, 5000);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false as const, status: resp.status, data };
  return { ok: true as const, data };
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
    normalizeSecret(Deno.env.get("URL")) ||
    "";
  const SUPABASE_SERVICE_ROLE_KEY =
    normalizeSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE")) ||
    "";
  const SUPABASE_JWT_SECRET = normalizeSecret(Deno.env.get("JWT_SECRET")) || normalizeSecret(Deno.env.get("SUPABASE_JWT_SECRET")) || "";
  const GOOGLE_CLIENT_ID = normalizeSecret(Deno.env.get("GOOGLE_CLIENT_ID")) || "";
  const GOOGLE_CLIENT_SECRET = normalizeSecret(Deno.env.get("GOOGLE_CLIENT_SECRET")) || "";

  // 診斷端點
  if (req.method === "GET") {
    return json({
      ok: true,
      build: BUILD_ID,
      has: {
        supabase_url: !!SUPABASE_URL,
        service_role_key: !!SUPABASE_SERVICE_ROLE_KEY,
        jwt_secret: !!SUPABASE_JWT_SECRET,
        google_client_id: !!GOOGLE_CLIENT_ID,
        google_client_secret: !!GOOGLE_CLIENT_SECRET,
      },
      len: {
        google_client_id: GOOGLE_CLIENT_ID.length,
        google_client_secret: GOOGLE_CLIENT_SECRET.length,
        jwt_secret: SUPABASE_JWT_SECRET.length,
      },
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_JWT_SECRET) {
    return bad("MISSING_SUPABASE_SECRETS", { build: BUILD_ID });
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return bad("MISSING_GOOGLE_SECRETS", { build: BUILD_ID });
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
        google_client_id: !!GOOGLE_CLIENT_ID,
        google_client_secret: !!GOOGLE_CLIENT_SECRET,
      },
    });
  }

  const code = String(body?.code || "").trim();
  const redirectUri = String(body?.redirect_uri || "").trim();
  if (!code) return bad("MISSING_CODE");
  if (!redirectUri) return bad("MISSING_REDIRECT_URI");

  // 1) Exchange code → access_token
  const tokenRes = await exchangeGoogleCodeForToken(code, redirectUri, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  if (!tokenRes.ok) {
    return json({ error: "GOOGLE_TOKEN_EXCHANGE_FAILED", detail: tokenRes.data }, { status: 400 });
  }
  const accessToken = String((tokenRes.data as any)?.access_token || "");
  if (!accessToken) return bad("GOOGLE_NO_ACCESS_TOKEN", { detail: tokenRes.data });

  // 2) Get Google user info
  const userRes = await fetchGoogleUserInfo(accessToken);
  if (!userRes.ok) {
    return json({ error: "GOOGLE_USERINFO_FAILED", detail: userRes.data }, { status: 400 });
  }
  const googleUserId = String((userRes.data as any)?.id || "").trim();
  const email = String((userRes.data as any)?.email || "").trim();
  const displayName = String((userRes.data as any)?.name || "").trim();
  const picture = String((userRes.data as any)?.picture || "").trim();
  
  if (!googleUserId) return bad("GOOGLE_NO_USER_ID", { detail: userRes.data });

  // 3) Map Google userId → user_id (uuid) in public.google_identities
  const q = `/rest/v1/google_identities?select=user_id&google_user_id=eq.${encodeURIComponent(googleUserId)}&limit=1`;
  const qResp = await supabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, q, { method: "GET" });
  const qJson = await qResp.json().catch(() => null);
  if (!qResp.ok) return json({ error: "DB_QUERY_FAILED", detail: qJson }, { status: 500 });
  const existingUserId = String((Array.isArray(qJson) ? qJson?.[0]?.user_id : "") || "").trim();

  const userId = existingUserId || crypto.randomUUID();
  const nowIso = new Date().toISOString();
  if (!existingUserId) {
    const iResp = await supabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, `/rest/v1/google_identities`, {
      method: "POST",
      headers: { "content-type": "application/json", "prefer": "return=minimal" },
      body: JSON.stringify([{
        google_user_id: googleUserId,
        user_id: userId,
        email: email,
        display_name: displayName,
        picture: picture,
        last_login_at: nowIso,
      }]),
    });
    const iJson = await iResp.json().catch(() => null);
    if (!iResp.ok) return json({ error: "DB_INSERT_FAILED", detail: iJson }, { status: 500 });
  } else {
    const uResp = await supabaseRest(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      `/rest/v1/google_identities?google_user_id=eq.${encodeURIComponent(googleUserId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "prefer": "return=minimal" },
        body: JSON.stringify({ display_name: displayName, picture: picture, last_login_at: nowIso }),
      },
    );
    // best-effort update
  }

  // 4) Issue JWT for Supabase PostgREST/Storage
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
    display_name: displayName,
  });
});
