// Supabase Edge Function: Cloudflare R2 圖片上傳
// 功能：生成 presigned URL 或直接處理上傳到 R2
//
// 必要環境變數（在 Supabase Dashboard → Edge Functions → Secrets 設定）：
// - R2_ACCOUNT_ID: Cloudflare Account ID
// - R2_ACCESS_KEY_ID: R2 Access Key ID
// - R2_SECRET_ACCESS_KEY: R2 Secret Access Key
// - R2_BUCKET_NAME: R2 Bucket 名稱
// - R2_PUBLIC_URL: R2 公開 URL（例如：https://your-bucket.r2.dev 或自訂域名）
//
// 前端呼叫：
// - POST { action: 'presign', key: 'user-id/avatar.webp', contentType: 'image/webp' }
//   回傳：{ presignedUrl, publicUrl }
// - POST { action: 'upload', key: 'user-id/avatar.webp', data: base64EncodedData, contentType: 'image/webp' }
//   回傳：{ publicUrl }

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

function normalizeSecret(v: string | undefined | null) {
  const s = String(v || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function base64UrlEncode(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// 驗證使用者現有登入 JWT 是否有效，確保呼叫者真的是合法登入中的使用者本人。
// 與 google-auth/index.ts 的 verifyJwtHS256 完全相同。
async function verifyJwtHS256(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(`${headerB64}.${payloadB64}`));
    const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig));
    if (expectedSigB64 !== sigB64) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const exp = Number(payload?.exp || 0);
    if (!exp || Math.floor(Date.now() / 1000) >= exp) return null;
    if (!payload?.sub) return null;
    return payload;
  } catch (_e) {
    return null;
  }
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_CONTENT_TYPES = new Set(["image/webp", "image/png", "image/jpeg", "image/gif"]);

// AWS Signature V4 for R2
async function signR2Request(
  method: string,
  url: URL,
  headers: Headers,
  body: Uint8Array | null,
  accessKeyId: string,
  secretAccessKey: string,
  region: string = "auto"
) {
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);
  
  headers.set("x-amz-date", amzDate);
  headers.set("host", url.host);
  
  // Create canonical request
  const signedHeaders = Array.from(headers.keys()).sort().join(";");
  const canonicalHeaders = Array.from(headers.keys())
    .sort()
    .map(k => `${k.toLowerCase()}:${headers.get(k)?.trim()}\n`)
    .join("");
  
  const payloadHash = body 
    ? await sha256Hex(body)
    : await sha256Hex(new Uint8Array(0));
  
  headers.set("x-amz-content-sha256", payloadHash);
  
  const canonicalRequest = [
    method,
    url.pathname,
    url.search.substring(1),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  
  // Create string to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest))
  ].join("\n");
  
  // Calculate signature
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secretAccessKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);
  
  // Create authorization header
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers.set("authorization", authorization);
  
  return headers;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const keyBuf = key instanceof ArrayBuffer ? key : key.buffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacSha256Hex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacSha256(key, data);
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadToR2(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucket: string,
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`);
  const headers = new Headers({
    "content-type": contentType,
    "content-length": String(data.length),
  });
  
  await signR2Request("PUT", url, headers, data, accessKeyId, secretAccessKey);
  
  try {
    const resp = await fetch(url.toString(), {
      method: "PUT",
      headers,
      body: data,
    });
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: text };
    }
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "METHOD_NOT_ALLOWED", build: BUILD_ID }, { status: 405 });
  }

  const R2_ACCOUNT_ID = normalizeSecret(Deno.env.get("R2_ACCOUNT_ID"));
  const R2_ACCESS_KEY_ID = normalizeSecret(Deno.env.get("R2_ACCESS_KEY_ID"));
  const R2_SECRET_ACCESS_KEY = normalizeSecret(Deno.env.get("R2_SECRET_ACCESS_KEY"));
  const R2_BUCKET_NAME = normalizeSecret(Deno.env.get("R2_BUCKET_NAME"));
  const R2_PUBLIC_URL = normalizeSecret(Deno.env.get("R2_PUBLIC_URL"));
  const JWT_SECRET = normalizeSecret(Deno.env.get("JWT_SECRET")) || normalizeSecret(Deno.env.get("SUPABASE_JWT_SECRET"));

  // 診斷端點
  if (req.method === "GET") {
    return json({
      ok: true,
      build: BUILD_ID,
      configured: !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME),
      has: {
        account_id: !!R2_ACCOUNT_ID,
        access_key_id: !!R2_ACCESS_KEY_ID,
        secret_access_key: !!R2_SECRET_ACCESS_KEY,
        bucket_name: !!R2_BUCKET_NAME,
        public_url: !!R2_PUBLIC_URL,
      },
    });
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return bad("MISSING_R2_SECRETS", { build: BUILD_ID });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch (_e) {
    return bad("INVALID_JSON", { build: BUILD_ID });
  }

  const action = String(body?.action || "upload").trim();
  const key = String(body?.key || "").trim();
  const contentType = String(body?.contentType || "image/webp").trim();

  if (!key) return bad("MISSING_KEY");

  if (!JWT_SECRET) return bad("MISSING_JWT_SECRET", { build: BUILD_ID });

  // 驗證 JWT：確保呼叫者真的是合法登入中的使用者本人，不是只檢查有沒有 Bearer 開頭。
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const jwtPayload = bearerToken ? await verifyJwtHS256(bearerToken, JWT_SECRET) : null;
  if (!jwtPayload) {
    return bad("UNAUTHORIZED", { build: BUILD_ID });
  }
  const verifiedUserId = String(jwtPayload.sub);

  // 上傳路徑必須是自己的資料夾，比照 Supabase Storage 既有規則
  // （name like (auth.uid()::text || '/%')）的精神，避免覆寫別人的檔案。
  if (key !== verifiedUserId && !key.startsWith(`${verifiedUserId}/`)) {
    return bad("FORBIDDEN_KEY_PATH", { build: BUILD_ID });
  }

  if (action === "upload") {
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return bad("UNSUPPORTED_CONTENT_TYPE", { build: BUILD_ID });
    }

    // 直接上傳模式
    const dataB64 = String(body?.data || "").trim();
    if (!dataB64) return bad("MISSING_DATA");

    let data: Uint8Array;
    try {
      // 移除可能的 data URL 前綴
      const base64 = dataB64.replace(/^data:[^;]+;base64,/, "");
      const binaryString = atob(base64);
      data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }
    } catch (e) {
      return bad("INVALID_BASE64", { detail: String(e) });
    }

    if (data.length > MAX_UPLOAD_BYTES) {
      return bad("FILE_TOO_LARGE", { build: BUILD_ID, maxBytes: MAX_UPLOAD_BYTES });
    }

    const result = await uploadToR2(
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      key,
      data,
      contentType
    );

    if (!result.ok) {
      return json({ error: "R2_UPLOAD_FAILED", detail: result.error }, { status: 500 });
    }

    const publicUrl = R2_PUBLIC_URL 
      ? `${R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`
      : `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`;

    return json({
      ok: true,
      publicUrl,
      bucket: R2_BUCKET_NAME,
      key,
    });
  }

  return bad("INVALID_ACTION", { build: BUILD_ID });
});
