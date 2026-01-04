// Supabase Edge Function: LINE OAuth → issue Supabase-compatible JWT (role=authenticated)
// 목적: Supabase Dashboard에 LINE Provider가 없어도, LINE 로그인으로 RLS/Storage를 사용할 수 있게 함.
// deploy-trigger: bump
//
// 必要環境變數（在 Supabase Dashboard → Edge Functions → Secrets 設定）：
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - JWT_SECRET（或舊名 SUPABASE_JWT_SECRET）
// - LINE_CHANNEL_ID
// - LINE_CHANNEL_SECRET
//
// 前端呼叫：POST { code, redirect_uri }
// 回傳：{ access_token, token_type, expires_in, user_id }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BUILD_ID = "2026-01-04-1";

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
  // allow pasting with quotes in dashboard, e.g. "abc" or 'abc'
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

async function exchangeLineCodeForToken(code: string, redirectUri: string, channelId: string, channelSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", channelId);
  body.set("client_secret", channelSecret);

  const resp = await fetchWithTimeout("https://api.line.me/oauth2/v2.1/token", {
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

async function fetchLineProfile(accessToken: string) {
  const resp = await fetchWithTimeout("https://api.line.me/v2/profile", {
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
  // Supabase REST needs both apikey + Authorization
  headers.set("apikey", serviceRoleKey);
  headers.set("authorization", `Bearer ${serviceRoleKey}`);
  headers.set("accept", "application/json");
  return await fetchWithTimeout(url, { ...init, headers }, 5000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED", build: BUILD_ID }, { status: 405 });

  // 注意：Supabase Edge Function Secrets 可能限制自訂 key 不能以 "SUPABASE_" 開頭。
  // 因此這裡同時支援多組命名（你在 Dashboard 設哪組都可以）。
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
  // 注意：Supabase Edge Function Secrets 不允許自訂 secret 以 "SUPABASE_" 開頭，
  // 因此 JWT secret 改用 JWT_SECRET（並向後相容舊名稱）。
  const SUPABASE_JWT_SECRET = normalizeSecret(Deno.env.get("JWT_SECRET")) || normalizeSecret(Deno.env.get("SUPABASE_JWT_SECRET")) || "";
  const LINE_CHANNEL_ID =
    normalizeSecret(Deno.env.get("LINE_CHANNEL_ID")) ||
    normalizeSecret(Deno.env.get("LINE_LOGIN_CHANNEL_ID")) ||
    "";
  const LINE_CHANNEL_SECRET =
    normalizeSecret(Deno.env.get("LINE_CHANNEL_SECRET")) ||
    normalizeSecret(Deno.env.get("LINE_LOGIN_CHANNEL_SECRET")) ||
    "";

  // 診斷：不回傳任何 secret 內容，只回 boolean 與長度，協助排查「明明更新但仍失敗」。
  if (req.method === "GET") {
    return json({
      ok: true,
      build: BUILD_ID,
      has: {
        supabase_url: !!SUPABASE_URL,
        service_role_key: !!SUPABASE_SERVICE_ROLE_KEY,
        jwt_secret: !!SUPABASE_JWT_SECRET,
        line_channel_id: !!LINE_CHANNEL_ID,
        line_channel_secret: !!LINE_CHANNEL_SECRET,
      },
      len: {
        line_channel_id: LINE_CHANNEL_ID.length,
        line_channel_secret: LINE_CHANNEL_SECRET.length,
        jwt_secret: SUPABASE_JWT_SECRET.length,
      },
      hint: "If LINE_CHANNEL_SECRET has quotes/spaces/newlines, normalizeSecret should fix it after redeploy.",
    });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_JWT_SECRET) {
    return bad("MISSING_SUPABASE_SECRETS", { build: BUILD_ID });
  }
  if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET) {
    return bad("MISSING_LINE_SECRETS", { build: BUILD_ID });
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
        line_channel_id: !!LINE_CHANNEL_ID,
        line_channel_secret: !!LINE_CHANNEL_SECRET,
      },
      len: {
        line_channel_id: LINE_CHANNEL_ID.length,
        line_channel_secret: LINE_CHANNEL_SECRET.length,
        jwt_secret: SUPABASE_JWT_SECRET.length,
      },
    });
  }

  const code = String(body?.code || "").trim();
  const redirectUri = String(body?.redirect_uri || "").trim();
  if (!code) return bad("MISSING_CODE");
  if (!redirectUri) return bad("MISSING_REDIRECT_URI");

  // 1) Exchange code → access_token
  const tokenRes = await exchangeLineCodeForToken(code, redirectUri, LINE_CHANNEL_ID, LINE_CHANNEL_SECRET);
  if (!tokenRes.ok) {
    return json({ error: "LINE_TOKEN_EXCHANGE_FAILED", detail: tokenRes.data }, { status: 400 });
  }
  const accessToken = String((tokenRes.data as any)?.access_token || "");
  if (!accessToken) return bad("LINE_NO_ACCESS_TOKEN", { detail: tokenRes.data });

  // 2) Get LINE profile → userId
  const profRes = await fetchLineProfile(accessToken);
  if (!profRes.ok) {
    return json({ error: "LINE_PROFILE_FAILED", detail: profRes.data }, { status: 400 });
  }
  const lineUserId = String((profRes.data as any)?.userId || "").trim();
  const displayName = String((profRes.data as any)?.displayName || "").trim();
  if (!lineUserId) return bad("LINE_NO_USER_ID", { detail: profRes.data });

  // 3) Map LINE userId → user_id (uuid) in public.line_identities
  const q = `/rest/v1/line_identities?select=user_id&line_user_id=eq.${encodeURIComponent(lineUserId)}&limit=1`;
  const qResp = await supabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, q, { method: "GET" });
  const qJson = await qResp.json().catch(() => null);
  if (!qResp.ok) return json({ error: "DB_QUERY_FAILED", detail: qJson }, { status: 500 });
  const existingUserId = String((Array.isArray(qJson) ? qJson?.[0]?.user_id : "") || "").trim();

  const userId = existingUserId || crypto.randomUUID();
  const nowIso = new Date().toISOString();
  if (!existingUserId) {
    const iResp = await supabaseRest(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, `/rest/v1/line_identities`, {
      method: "POST",
      headers: { "content-type": "application/json", "prefer": "return=minimal" },
      body: JSON.stringify([{
        line_user_id: lineUserId,
        user_id: userId,
        display_name: displayName,
        last_login_at: nowIso,
      }]),
    });
    const iJson = await iResp.json().catch(() => null);
    if (!iResp.ok) return json({ error: "DB_INSERT_FAILED", detail: iJson }, { status: 500 });
  } else {
    const uResp = await supabaseRest(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      `/rest/v1/line_identities?line_user_id=eq.${encodeURIComponent(lineUserId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", "prefer": "return=minimal" },
        body: JSON.stringify({ display_name: displayName, last_login_at: nowIso }),
      },
    );
    // best-effort update; ignore errors but don't crash login
    if (!uResp.ok) {
      // swallow
    }
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
  }, SUPABASE_JWT_SECRET);

  return json({
    access_token: jwt,
    token_type: "bearer",
    expires_in: expiresIn,
    user_id: userId,
  });
});

