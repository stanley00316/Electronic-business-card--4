// Supabase Edge Function: LINE OAuth → issue Supabase-compatible JWT (role=authenticated)
// 목적: Supabase Dashboard에 LINE Provider가 없어도, LINE 로그인으로 RLS/Storage를 사용할 수 있게 함.
//
// 必要環境變數（在 Supabase Dashboard → Edge Functions → Secrets 設定）：
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_JWT_SECRET
// - LINE_CHANNEL_ID
// - LINE_CHANNEL_SECRET
//
// 前端呼叫：POST { code, redirect_uri }
// 回傳：{ access_token, token_type, expires_in, user_id }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function json(obj: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
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

async function exchangeLineCodeForToken(code: string, redirectUri: string, channelId: string, channelSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", channelId);
  body.set("client_secret", channelSecret);

  const resp = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false as const, status: resp.status, data };
  }
  return { ok: true as const, data };
}

async function fetchLineProfile(accessToken: string) {
  const resp = await fetch("https://api.line.me/v2/profile", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false as const, status: resp.status, data };
  return { ok: true as const, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const SUPABASE_JWT_SECRET = Deno.env.get("SUPABASE_JWT_SECRET") || "";
  const LINE_CHANNEL_ID = Deno.env.get("LINE_CHANNEL_ID") || "";
  const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") || "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_JWT_SECRET) {
    return bad("MISSING_SUPABASE_SECRETS");
  }
  if (!LINE_CHANNEL_ID || !LINE_CHANNEL_SECRET) {
    return bad("MISSING_LINE_SECRETS");
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch (_e) {
    return bad("INVALID_JSON");
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
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: existing, error: qErr } = await admin
    .from("line_identities")
    .select("user_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (qErr) return json({ error: "DB_QUERY_FAILED", detail: qErr }, { status: 500 });

  const userId = String(existing?.user_id || crypto.randomUUID());
  if (!existing?.user_id) {
    const { error: iErr } = await admin.from("line_identities").insert({
      line_user_id: lineUserId,
      user_id: userId,
      display_name: displayName,
      last_login_at: new Date().toISOString(),
    });
    if (iErr) return json({ error: "DB_INSERT_FAILED", detail: iErr }, { status: 500 });
  } else {
    // best-effort update
    await admin.from("line_identities").update({
      display_name: displayName,
      last_login_at: new Date().toISOString(),
    }).eq("line_user_id", lineUserId);
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

