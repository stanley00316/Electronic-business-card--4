// Supabase Edge Function: 訪客免登入建立名片
// 用途：好友點邀請連結後直接填資料，系統自動審核通過並建立公開名片。

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BUILD_ID = "2026-08-26-guest-card-intake-rate-limit";
const DEFAULT_PUBLIC_SITE_URL = "https://stanley00316.github.io/Electronic-business-card--4/";

function normalizeSecret(value: string | undefined | null) {
  const s = String(value || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function withCors(headers: HeadersInit = {}) {
  const h = new Headers(headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
  h.set("access-control-allow-methods", "GET, POST, OPTIONS");
  h.set("x-uvaco-build", BUILD_ID);
  return h;
}

function json(obj: unknown, init: ResponseInit = {}) {
  const headers = withCors(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(obj), { ...init, headers });
}

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return json({ success: false, error, ...extra, build: BUILD_ID }, { status });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1000));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePhone(value: string) {
  return String(value || "").replace(/[^\d+()\-\s#]/g, "").trim().slice(0, 40);
}

function normalizeEmail(value: string) {
  const email = String(value || "").trim().toLowerCase().slice(0, 160);
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeUrl(value: string) {
  const raw = String(value || "").trim().slice(0, 220);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^line:/i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return "https://" + raw;
  return "";
}

function parseInviteNote(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch (_e) {
    return {};
  }
}

function buildContactsHtml(phone: string, email: string, lineUrl: string) {
  const parts: string[] = [];
  if (phone) {
    const tel = phone.replace(/[^\d+#]/g, "");
    parts.push(`<a class="btn btn-primary lang-zh" href="tel:${escapeHtml(tel)}"><img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> 立即來電</a>`);
    parts.push(`<a class="btn btn-primary lang-en" href="tel:${escapeHtml(tel)}"><img src="phone-icon.svg" alt="Phone" class="btn-icon-phone"> Call Now</a>`);
  }
  if (email) {
    parts.push(`<a class="btn btn-secondary lang-zh" href="mailto:${escapeHtml(email)}"><img src="email-icon.svg" alt="Email" class="btn-icon-email"> 寄送 Email</a>`);
    parts.push(`<a class="btn btn-secondary lang-en" href="mailto:${escapeHtml(email)}"><img src="email-icon.svg" alt="Email" class="btn-icon-email"> Send Email</a>`);
  }
  if (lineUrl) {
    parts.push(`<a class="btn btn-secondary lang-zh" href="${escapeHtml(lineUrl)}" target="_blank" rel="noopener"><img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE 聯絡</a>`);
    parts.push(`<a class="btn btn-secondary lang-en" href="${escapeHtml(lineUrl)}" target="_blank" rel="noopener"><img src="line-logo.svg" alt="LINE" class="btn-icon-line"> LINE</a>`);
  }
  return parts.join("\n");
}

function normalizeSiteUrl(value: unknown) {
  const raw = String(value || "").trim();
  try {
    const url = new URL(raw || DEFAULT_PUBLIC_SITE_URL);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return DEFAULT_PUBLIC_SITE_URL;
    url.hash = "";
    url.search = "";
    return url.toString().replace(/[^/]*$/, "");
  } catch (_e) {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// 查重：用電話或 Email 比對現有 cards，避免同一個人因為重複點連結／被重複邀請而產生兩張互不相通的名片。
// 只有電話或 Email 其中一項有值才查（LINE 連結沒有獨立欄位可查，略過）。
async function findExistingCardByContact(
  supabaseUrl: string,
  serviceRoleKey: string,
  phone: string,
  email: string,
) {
  const filters: string[] = [];
  if (phone) filters.push(`phone.eq.${encodeURIComponent(phone)}`);
  if (email) filters.push(`email.eq.${encodeURIComponent(email)}`);
  if (!filters.length) return null;

  // 注意：PostgREST 單一條件必須用「欄位=eq.值」，只有放進 or=(...) 群組時才用「欄位.eq.值」。
  // 過去只填電話或只填 Email 時直接把 `phone.eq.xxx` 當成查詢字串參數送出，
  // 會被 PostgREST 當成未知參數整個忽略，等同查詢沒有任何篩選條件，
  // 導致每個訪客都被誤判為「重複」而拿到同一張舊名片、無法建立自己的名片。
  const query = `or=(${filters.join(",")})`;
  const resp = await supabaseRest(
    supabaseUrl,
    serviceRoleKey,
    `/rest/v1/cards?select=user_id,name&${query}&limit=1`,
    { method: "GET" },
  );
  if (!resp.ok) return null;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? (rows[0] as { user_id: string; name?: string }) : null;
}

async function supabaseRest(
  supabaseUrl: string,
  serviceRoleKey: string,
  pathAndQuery: string,
  init: RequestInit,
) {
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("authorization", "Bearer " + serviceRoleKey);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return await fetchWithTimeout(
    supabaseUrl.replace(/\/$/, "") + pathAndQuery,
    { ...init, headers },
    7000,
  );
}

// ===== 防洗版：速率限制 =====
// 這支函式免登入即可呼叫，用 service_role 寫入資料（繞過 RLS），沒有這層限制的話，
// 任何人都能腳本狂打灌一堆假名片，或複製別人公開名片網址上的 user_id 幫他無限刷推薦天數。

const IP_RATE_LIMIT_WINDOW_MINUTES = 10;
const IP_RATE_LIMIT_MAX = 5;
const REFERRER_RATE_LIMIT_WINDOW_HOURS = 24;
const REFERRER_RATE_LIMIT_MAX = 10;

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 同一個 IP 短時間內送太多次，直接擋下（不分是不是走 invite_token，單純防灌量）。
async function isIpRateLimited(supabaseUrl: string, serviceRoleKey: string, ipHash: string): Promise<boolean> {
  const since = new Date(Date.now() - IP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const resp = await supabaseRest(
    supabaseUrl,
    serviceRoleKey,
    `/rest/v1/guest_intake_attempts?select=id&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gt.${encodeURIComponent(since)}&limit=${IP_RATE_LIMIT_MAX}`,
    { method: "GET" },
  );
  if (!resp.ok) return false; // 查詢本身失敗時不要因此擋下正常使用者
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows.length >= IP_RATE_LIMIT_MAX;
}

// 只針對沒有合法 invite_token 的公開推薦連結流程（?ref=<user_id>）：
// 同一個 referrer_user_id 短時間內被灌爆太多次，之後的提交仍可建立名片，只是不再記推薦。
async function isReferrerRateLimited(supabaseUrl: string, serviceRoleKey: string, referrerUserId: string): Promise<boolean> {
  const since = new Date(Date.now() - REFERRER_RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const resp = await supabaseRest(
    supabaseUrl,
    serviceRoleKey,
    `/rest/v1/guest_intake_attempts?select=id&referrer_user_id=eq.${encodeURIComponent(referrerUserId)}&created_at=gt.${encodeURIComponent(since)}&limit=${REFERRER_RATE_LIMIT_MAX}`,
    { method: "GET" },
  );
  if (!resp.ok) return false;
  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows.length >= REFERRER_RATE_LIMIT_MAX;
}

async function recordIntakeAttempt(
  supabaseUrl: string,
  serviceRoleKey: string,
  ipHash: string,
  referrerUserId: string | null,
) {
  await supabaseRest(supabaseUrl, serviceRoleKey, "/rest/v1/guest_intake_attempts", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ ip_hash: ipHash, referrer_user_id: referrerUserId }),
  }).catch(() => {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true, build: BUILD_ID });
  if (req.method === "GET") {
    return json({
      ok: true,
      build: BUILD_ID,
      has: {
        supabase_url: !!normalizeSecret(Deno.env.get("SUPABASE_URL")),
        service_role_key: !!(normalizeSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) || normalizeSecret(Deno.env.get("SERVICE_ROLE_KEY"))),
      },
    });
  }
  if (req.method !== "POST") return bad("METHOD_NOT_ALLOWED", 405);

  const SUPABASE_URL = normalizeSecret(Deno.env.get("SUPABASE_URL")) || normalizeSecret(Deno.env.get("PROJECT_URL"));
  const SERVICE_ROLE_KEY =
    normalizeSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE"));

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return bad("MISSING_SUPABASE_SECRETS", 500);

  const ipHash = await hashIp(getClientIp(req));
  if (await isIpRateLimited(SUPABASE_URL, SERVICE_ROLE_KEY, ipHash)) {
    return bad("RATE_LIMITED", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return bad("INVALID_JSON");
  }

  // 蜜罐欄位：正常使用者不會填到，若有值就視為機器送件。
  if (cleanText(body.website, 120)) return bad("BOT_DETECTED", 422);

  // 記錄這次提交（不論後續成功與否），供上面的 IP 速率限制與下面的推薦人限制查詢使用。
  const rawReferrerUserId = cleanText(body.referrer_user_id, 80);
  await recordIntakeAttempt(SUPABASE_URL, SERVICE_ROLE_KEY, ipHash, isUuid(rawReferrerUserId) ? rawReferrerUserId : null);

  let name = cleanText(body.name, 80);
  let title = cleanText(body.title, 80);
  let company = cleanText(body.company, 100);
  let department = cleanText(body.department, 80);
  let phone = normalizePhone(cleanText(body.phone, 60));
  let email = normalizeEmail(cleanText(body.email, 180));
  let lineUrl = normalizeUrl(cleanText(body.line_url, 240));
  const referrerUserId = cleanText(body.referrer_user_id, 80);
  const inviteToken = cleanText(body.invite_token, 80);
  const siteUrl = normalizeSiteUrl(body.site_url);
  let phoneExtension = cleanText(body.phone_extension, 30);
  let companyAddress = cleanText(body.company_address, 220);

  let invite: Record<string, unknown> | null = null;
  if (inviteToken && isUuid(inviteToken)) {
    const inviteResp = await supabaseRest(
      SUPABASE_URL,
      SERVICE_ROLE_KEY,
      "/rest/v1/card_invites?token=eq." + encodeURIComponent(inviteToken) + "&used_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) + "&select=*",
      { method: "GET" },
    );
    if (!inviteResp.ok) return bad("INVITE_READ_FAILED", 500, { status: inviteResp.status });
    const inviteRows = await inviteResp.json().catch(() => []);
    invite = Array.isArray(inviteRows) ? inviteRows[0] || null : null;
    if (!invite) return bad("INVITE_INVALID_OR_EXPIRED", 404);

    const note = parseInviteNote(invite.note);
    name = name || cleanText(invite.name, 80);
    title = title || cleanText(invite.title, 80);
    company = company || cleanText(invite.target_company, 100);
    department = department || cleanText(invite.department, 80);
    phone = phone || normalizePhone(cleanText(invite.phone, 60));
    email = email || normalizeEmail(cleanText(invite.email, 180));
    lineUrl = lineUrl || normalizeUrl(cleanText(note.line_url || note.lineUrl, 240));
    phoneExtension = phoneExtension || cleanText(note.phone_extension || note.phoneExtension, 30);
    companyAddress = companyAddress || cleanText(note.company_address || note.companyAddress, 220);
  }

  if (!name) return bad("NAME_REQUIRED");
  if (!phone && !email && !lineUrl) return bad("CONTACT_REQUIRED");

  // 查重：電話或 Email 已存在於現有名片，就不建新的，直接回傳既有名片連結。
  const existingCard = await findExistingCardByContact(SUPABASE_URL, SERVICE_ROLE_KEY, phone, email);
  if (existingCard && existingCard.user_id) {
    if (invite) {
      await supabaseRest(SUPABASE_URL, SERVICE_ROLE_KEY, "/rest/v1/card_invites?token=eq." + encodeURIComponent(inviteToken), {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          used_at: new Date().toISOString(),
        }),
      });
    }

    const existingUserId = String(existingCard.user_id);
    const existingPublicUrl = `${siteUrl}card.html?id=${encodeURIComponent(existingUserId)}`;
    const existingShareUrl = `${existingPublicUrl}&openExternalBrowser=1`;

    return json({
      success: true,
      build: BUILD_ID,
      duplicate: true,
      user_id: existingUserId,
      public_url: existingPublicUrl,
      share_url: existingShareUrl,
      referral_recorded: false,
    });
  }

  const userId = crypto.randomUUID();
  const contactsHtml = buildContactsHtml(phone, email, lineUrl);
  const profileJson = {
    nameZh: name,
    nameEn: "",
    titleZh: title,
    titleEn: "",
    companyZh: company,
    companyEn: "",
    companyCanonical: company,
    contactLayout: "list",
    contactsHtml,
    guestAutoApproved: true,
    guestApprovedAt: new Date().toISOString(),
    guestSource: invite ? "employee-invite" : "guest-join",
    inviteToken: invite ? inviteToken : "",
    phoneExtension,
    companyAddressZh: companyAddress,
    companyAddressEn: "",
  };

  const insertResp = await supabaseRest(SUPABASE_URL, SERVICE_ROLE_KEY, "/rest/v1/cards?select=user_id", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      user_id: userId,
      name,
      title,
      company,
      department,
      email,
      phone,
      theme: 1,
      profile_json: profileJson,
      is_visible: true,
      nfc_status: "unbound",
      admin_disabled: false,
    }),
  });

  if (!insertResp.ok) {
    const detail = await insertResp.text().catch(() => "");
    console.error("GUEST_CARD_INSERT_FAILED", insertResp.status, detail.slice(0, 500));
    return bad("CARD_CREATE_FAILED", 500, { status: insertResp.status });
  }

  let referralRecorded = false;
  const inviteCreatorId = invite ? cleanText(invite.created_by, 80) : "";
  const referralOwnerId = isUuid(referrerUserId) ? referrerUserId : inviteCreatorId;
  // 只針對「沒有合法 invite_token」的公開推薦連結流程做推薦人限流：
  // 企業批次邀請員工走的是有驗證過期限、建立者身分的 invite_token，不受這條限制影響。
  const referralOwnerRateLimited =
    !invite && isUuid(referralOwnerId) ? await isReferrerRateLimited(SUPABASE_URL, SERVICE_ROLE_KEY, referralOwnerId) : false;
  if (isUuid(referralOwnerId) && referralOwnerId !== userId && !referralOwnerRateLimited) {
    const referralResp = await supabaseRest(SUPABASE_URL, SERVICE_ROLE_KEY, "/rest/v1/referrals", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        referrer_user_id: referralOwnerId,
        referred_user_id: userId,
      }),
    });
    referralRecorded = referralResp.ok;
  }

  if (invite) {
    await supabaseRest(SUPABASE_URL, SERVICE_ROLE_KEY, "/rest/v1/card_invites?token=eq." + encodeURIComponent(inviteToken), {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        used_at: new Date().toISOString(),
      }),
    });
  }

  const publicUrl = `${siteUrl}card.html?id=${encodeURIComponent(userId)}`;
  const shareUrl = `${publicUrl}&openExternalBrowser=1`;

  return json({
    success: true,
    build: BUILD_ID,
    user_id: userId,
    public_url: publicUrl,
    share_url: shareUrl,
    referral_recorded: referralRecorded,
  });
});