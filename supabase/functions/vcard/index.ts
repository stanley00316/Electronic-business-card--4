// Supabase Edge Function: 公開電子名片 vCard
// 被分享者點擊「加入通訊錄」後，手機會開啟系統的新增聯絡人流程；是否存入由使用者確認。

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BUILD_ID = "2026-06-25-vcard-1";
const DEFAULT_PUBLIC_SITE_URL = "https://stanley00316.github.io/Electronic-business-card--4/";

function normalizeSecret(v: string | undefined | null) {
  const s = String(v || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function withCors(headers: HeadersInit = {}) {
  const h = new Headers(headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-headers", "authorization, x-client-info, apikey, content-type");
  h.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  h.set("x-uvaco-build", BUILD_ID);
  return h;
}

function json(obj: unknown, init: ResponseInit = {}) {
  const headers = withCors(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(obj), { ...init, headers });
}

function notFound() {
  return json({ error: "NOT_FOUND" }, { status: 404 });
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

async function fetchCard(supabaseUrl: string, serviceRoleKey: string, field: "user_id" | "nfc_card_id", value: string) {
  const url = new URL(supabaseUrl.replace(/\/$/, "") + "/rest/v1/cards");
  url.searchParams.set("select", "*");
  url.searchParams.set(field, "eq." + value);
  url.searchParams.set("limit", "1");

  const resp = await fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: "Bearer " + serviceRoleKey,
      accept: "application/json",
    },
  }, 6000);

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error("SUPABASE_REST_FAILED:" + resp.status + ":" + detail.slice(0, 200));
  }

  const rows = await resp.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function parseProfileJson(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch (_e) {
      return {};
    }
  }
  return {};
}

function decodeHtmlEntities(text: string) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16) || 0))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(html: unknown) {
  return decodeHtmlEntities(String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|li|span|section|article|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " "));
}

function safeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function filterSystemText(text: string) {
  const systemPatterns = [
    "如需更改請聯絡管理員",
    "公司已鎖定",
    "公司：必選下拉",
    "可輸入關鍵字快速帶入",
    "請輸入內容",
    "Enter content",
  ];
  for (const pattern of systemPatterns) {
    if (text.includes(pattern)) return "";
  }
  return text;
}

function cleanVCardText(value: unknown) {
  return filterSystemText(safeText(value))
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
}

function uniquePush(list: string[], value: unknown) {
  const v = cleanVCardText(value);
  if (v && !list.includes(v)) list.push(v);
}

function vCardEscape(value: unknown) {
  return cleanVCardText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldVCardLine(line: string) {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  chunks.push(rest);
  return chunks.map((part, idx) => idx === 0 ? part : " " + part).join("\r\n");
}

function normalizePhoneForVCard(value: unknown) {
  const raw = String(value || "").replace(/^tel:/i, "").trim();
  const cleaned = raw.replace(/[^\d+]/g, "");
  return cleaned || cleanVCardText(raw);
}

function normalizeMailForVCard(value: unknown) {
  return String(value || "").replace(/^mailto:/i, "").split("?")[0].trim();
}

function normalizeUrlForVCard(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || /^(tel|mailto|javascript):/i.test(raw)) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(line|weixin|whatsapp):/i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return "https://" + raw;
  return raw;
}

function getContactLinkLabel(href: string, fallbackLabel: string) {
  const url = String(href || "").toLowerCase();
  if (url.includes("line.me") || url.startsWith("line:")) return "LINE";
  if (url.includes("facebook.com") || url.includes("fb.me")) return "Facebook";
  if (url.includes("instagram.com")) return "Instagram";
  if (url.includes("linkedin.com")) return "LinkedIn";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("wa.me") || url.includes("whatsapp.com") || url.startsWith("whatsapp:")) return "WhatsApp";
  if (url.includes("wechat") || url.startsWith("weixin:")) return "WeChat";
  return cleanVCardText(fallbackLabel) || "連結";
}

function getAttr(tag: string, attrName: string) {
  const re = new RegExp("\\s" + attrName + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^>\\s]+))", "i");
  const match = tag.match(re);
  return decodeHtmlEntities(match ? String(match[2] || match[3] || match[4] || "") : "");
}

function collectHtmlContactLinks(html: unknown) {
  const phones: string[] = [];
  const emails: string[] = [];
  const urls: string[] = [];
  const notes: string[] = [];
  const source = String(html || "");

  source.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs, inner) => {
    const href = String(getAttr(" " + attrs, "href") || "").trim();
    if (!href || href.endsWith(".vcf")) return "";

    const imgAlt = String(inner || "").replace(/<img\b([^>]*)>/gi, (_img, imgAttrs) => getAttr(" " + imgAttrs, "alt") + " ");
    const label = cleanVCardText(htmlToText(imgAlt || inner));

    if (/^tel:/i.test(href)) {
      uniquePush(phones, normalizePhoneForVCard(href));
      return "";
    }

    if (/^mailto:/i.test(href)) {
      uniquePush(emails, normalizeMailForVCard(href));
      return "";
    }

    const url = normalizeUrlForVCard(href);
    if (!url) return "";
    const noteLabel = getContactLinkLabel(href, label);
    uniquePush(urls, url);
    uniquePush(notes, noteLabel + ": " + url);
    return "";
  });

  return { phones, emails, urls, notes };
}

function collectCompanyInfoNotes(html: unknown) {
  const notes: string[] = [];
  const text = cleanVCardText(htmlToText(html))
    .replace(/在地圖中查看/g, "")
    .replace(/View on map/gi, "")
    .trim();
  if (text && text !== "-" && text !== "（未設定）" && text !== "（Not Set）") {
    uniquePush(notes, text);
  }
  return notes;
}

function extractElementTextById(html: unknown, id: string) {
  const source = String(html || "");
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("<[^>]+\\bid=[\"']" + escaped + "[\"'][^>]*>([\\s\\S]*?)<\\/[^>]+>", "i");
  const match = source.match(re);
  return match ? cleanVCardText(htmlToText(match[1])) : "";
}

function safeVCardFilename(value: unknown) {
  const base = cleanVCardText(value || "contact")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "contact";
  return base + ".vcf";
}

function contentDispositionFor(fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "-") || "contact.vcf";
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function publicCardUrl(userId: string) {
  const rawBase =
    normalizeSecret(Deno.env.get("PUBLIC_SITE_URL")) ||
    normalizeSecret(Deno.env.get("SITE_URL")) ||
    DEFAULT_PUBLIC_SITE_URL;
  const base = rawBase.endsWith("/") ? rawBase : rawBase + "/";
  return base + "card.html?id=" + encodeURIComponent(userId);
}

function buildVCard(card: Record<string, unknown>) {
  const pj = parseProfileJson(card.profile_json);
  const contactLinks = collectHtmlContactLinks(pj.contactsHtml);
  const phones: string[] = [];
  const emails: string[] = [];
  const urls: string[] = [];
  const notes: string[] = [];
  const addresses: string[] = [];

  const userId = cleanVCardText(card.user_id);
  const name = cleanVCardText(pj.nameZh || pj.nameEn || card.name || "數位名片");
  const title = cleanVCardText(pj.titleZh || pj.titleEn || card.title || "");
  const company = cleanVCardText(pj.companyZh || pj.companyEn || card.company || pj.companyCanonical || "");
  const cardUrl = normalizeUrlForVCard(publicCardUrl(userId));

  uniquePush(phones, normalizePhoneForVCard(card.phone));
  contactLinks.phones.forEach((phone) => uniquePush(phones, phone));

  uniquePush(emails, normalizeMailForVCard(card.email));
  contactLinks.emails.forEach((email) => uniquePush(emails, email));

  [pj.companyWebsite, pj.website, cardUrl].forEach((url) => uniquePush(urls, normalizeUrlForVCard(url)));
  contactLinks.urls.forEach((url) => uniquePush(urls, url));

  [
    "previewServiceLocationZh",
    "previewServiceLocationEn",
    "previewMailingAddressZh",
    "previewMailingAddressEn",
    "previewCompanyAddressZh",
    "previewCompanyAddressEn",
  ]
    .map((id) => extractElementTextById(pj.companyInfoHtml, id))
    .forEach((address) => uniquePush(addresses, address));

  contactLinks.notes.forEach((note) => uniquePush(notes, note));
  collectCompanyInfoNotes(pj.companyInfoHtml).forEach((note) => uniquePush(notes, note));
  [pj.slogansZhHtml, pj.slogansEnHtml].map(htmlToText).forEach((note) => uniquePush(notes, note));
  if (cardUrl) uniquePush(notes, "電子名片: " + cardUrl);

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "PRODID:-//UVACO//Digital Business Card//ZH-TW",
    "FN;CHARSET=UTF-8:" + vCardEscape(name),
    "N;CHARSET=UTF-8:" + vCardEscape(name) + ";;;;",
  ];

  if (company) lines.push("ORG;CHARSET=UTF-8:" + vCardEscape(company));
  if (title) lines.push("TITLE;CHARSET=UTF-8:" + vCardEscape(title));
  phones.forEach((phone, index) => lines.push("TEL;TYPE=" + (index === 0 ? "CELL,VOICE" : "VOICE") + ":" + vCardEscape(phone)));
  emails.forEach((email) => lines.push("EMAIL;TYPE=INTERNET:" + vCardEscape(email)));
  urls.forEach((url, index) => lines.push("URL" + (index === 0 ? "" : ";TYPE=OTHER") + ":" + vCardEscape(url)));
  addresses.forEach((address, index) => lines.push("ADR;TYPE=" + (index === 0 ? "WORK" : "OTHER") + ";CHARSET=UTF-8:;;" + vCardEscape(address) + ";;;;"));
  if (notes.length) lines.push("NOTE;CHARSET=UTF-8:" + vCardEscape(notes.join("\n")));
  lines.push("REV:" + new Date().toISOString());
  lines.push("END:VCARD");

  return {
    fileName: safeVCardFilename(name),
    body: lines.map(foldVCardLine).join("\r\n") + "\r\n",
  };
}

function isSafeLookupValue(value: string) {
  return value.length > 0 && value.length <= 128 && !/[\u0000-\u001F\u007F]/.test(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
  }

  const supabaseUrl =
    normalizeSecret(Deno.env.get("SUPABASE_URL")) ||
    normalizeSecret(Deno.env.get("PROJECT_URL")) ||
    "";
  const serviceRoleKey =
    normalizeSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE_KEY")) ||
    normalizeSecret(Deno.env.get("SERVICE_ROLE")) ||
    "";

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "MISSING_SUPABASE_SECRETS" }, { status: 500 });
  }

  const url = new URL(req.url);
  const userId = String(url.searchParams.get("id") || "").trim();
  const nfcCardId = String(url.searchParams.get("nfc") || "").trim();
  const field = userId ? "user_id" : "nfc_card_id";
  const lookupValue = userId || nfcCardId;

  if (!isSafeLookupValue(lookupValue)) return notFound();

  try {
    const card = await fetchCard(supabaseUrl, serviceRoleKey, field, lookupValue);
    if (!card || card.admin_disabled === true) return notFound();

    const vcard = buildVCard(card);
    const headers = withCors({
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": contentDispositionFor(vcard.fileName),
      "cache-control": "public, max-age=300",
    });
    return new Response(req.method === "HEAD" ? null : vcard.body, { status: 200, headers });
  } catch (e) {
    console.error("[vcard] failed:", e);
    return json({ error: "VCARD_FAILED" }, { status: 500 });
  }
});
