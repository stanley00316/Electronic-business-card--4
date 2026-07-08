import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_ANON_JWT,
  LINE_CHANNEL_ID,
  LIFF_ID
} from './constants.js';
import { fetchWithTimeout } from './http.js';
import { setCustomJwt } from './jwt.js';
import { getBaseUrl } from './clients.js';

// Auth timing: forward to auth.html debug panel only (no localhost ingest).
function logLineAuthDebug(hypothesisId, location, message, data = {}, runId = 'initial') {
  try {
    if (typeof window !== 'undefined' && typeof window.__uvacoAuthDebugPanelLog === 'function') {
      window.__uvacoAuthDebugPanelLog(location, message, data);
    }
  } catch (_) {}
}

export function getLineRedirectUri(nextRelativeUrl) {
  // LINE callback 必須與 LINE Developers 設定完全一致。
  // 注意：redirect_uri 建議「不要帶 query」，避免 LINE 後台登錄時更容易踩到不匹配。
  // next 改存 localStorage 轉交。
  return getBaseUrl() + 'auth.html';
}

export function getLiffLoginUrl(nextRelativeUrl) {
  if (!LIFF_ID) return '';
  const next = nextRelativeUrl || 'directory.html';
  const params = new URLSearchParams();
  params.set('next', next);
  params.set('liff', '1');
  return 'https://liff.line.me/' + encodeURIComponent(LIFF_ID) + '?' + params.toString();
}

export function startLineAppLogin(nextRelativeUrl) {
  if (!LIFF_ID) return false;
  const next = nextRelativeUrl || 'directory.html';
  try { localStorage.setItem('UVACO_LINE_NEXT', next); } catch (e) {}
  const liffUrl = getLiffLoginUrl(next);
  if (!liffUrl) return false;

  // 手機優先開 LINE App；若系統沒有成功切到 LINE，auth.html 會改走 QR Code 備援。
  logLineAuthDebug(
    'H4',
    'js/cloud/line-liff.js:startLineAppLogin',
    'redirecting to liff app url',
    {
      next,
      liffUrlLength: liffUrl.length
    }
  );
  window.location.href = liffUrl;
  return true;
}

export function startLineLogin(nextRelativeUrl) {
  if (!LINE_CHANNEL_ID) {
    alert("尚未設定 LINE_CHANNEL_ID（請在 js/cloud/constants.js 填入 LINE Channel ID）。");
    return false;
  }
  if (!/^\d+$/.test(String(LINE_CHANNEL_ID))) {
    alert("LINE 登入尚未完成：LINE_CHANNEL_ID 看起來不是 LINE Login 的 Channel ID（通常是純數字）。\n請到 LINE Developers → 你的 LINE Login Channel → Basic settings 複製 Channel ID（數字）後貼上。");
    return false;
  }
  const next = nextRelativeUrl || 'directory.html';
  try { localStorage.setItem('UVACO_LINE_NEXT', next); } catch (e) {}
  const redirectUri = getLineRedirectUri(next);
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { localStorage.setItem('UVACO_LINE_STATE', state); } catch (e) {}
  try { sessionStorage.setItem('UVACO_LINE_STATE', state); } catch (e) {}

  const params = new URLSearchParams();
  params.set('response_type', 'code');
  params.set('client_id', LINE_CHANNEL_ID);
  params.set('redirect_uri', redirectUri);
  params.set('state', state);
  params.set('scope', 'profile openid');
  // 這裡讓外部瀏覽器優先顯示 LINE App 掃碼登入，避免使用者被要求記 LINE 帳號密碼。
  params.set('initial_amr_display', 'lineqr');
  params.set('switch_amr', 'false');

  // #region agent log
  logLineAuthDebug(
    'H4',
    'js/cloud/line-liff.js:startLineLogin',
    'redirecting to line oauth',
    {
      next,
      redirectUriLength: redirectUri.length,
      stateLength: state.length
    }
  );
  // #endregion
  window.location.href = 'https://access.line.me/oauth2/v2.1/authorize?' + params.toString();
  return true;
}

export async function finishLineLoginFromUrl() {
  // 注意：不要用大 try/catch 吃掉例外，否則只會看到 LINE_CALLBACK_ERROR 很難排查
  let url;
  try {
    url = new URL(window.location.href);
  } catch (e) {
    return { ok: false, error: 'LINE_URL_PARSE_ERROR', detail: String(e?.message || e || '') };
  }

  const code = String(url.searchParams.get('code') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  try {
    const expectedState = (function () {
      try {
        const a = String(localStorage.getItem('UVACO_LINE_STATE') || '').trim();
        const b = String(sessionStorage.getItem('UVACO_LINE_STATE') || '').trim();
        return a || b;
      } catch (e) { return ''; }
    })();
    // 若沒有 code/state，就不是 LINE callback
    if (!code || !state) return { ok: true, handled: false };
    // 若瀏覽器（或 LINE in-app browser）阻擋 storage，expectedState 可能取不到；
    // 為了讓登入能完成，只有在「拿得到 expectedState」時才嚴格比對。
    if (expectedState && state !== expectedState) return { ok: false, error: 'LINE_BAD_STATE' };

    // 呼叫 Edge Function：用 code 換 JWT（role=authenticated）
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/line-auth';
    const redirectUri = getLineRedirectUri();
    let resp;
    const exchangeStartedAt = performance.now();
    try {
      resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'apikey': SUPABASE_ANON_KEY,
          // 若 Supabase Edge Function 開啟「Verify JWT with legacy secret」，
          // 需要 Authorization header（使用 anon key 即可）
          'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
        },
        body: JSON.stringify({ code, redirect_uri: redirectUri })
      }, 15000);
    } catch (e) {
      return {
        ok: false,
        error: 'LINE_FETCH_FAILED',
        detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')),
        endpoint
      };
    }

    let data = {};
    try {
      data = await resp.json();
    } catch (_e) {
      data = { non_json_response: true };
    }
    // #region agent log
    logLineAuthDebug(
      'H2',
      'js/cloud/line-liff.js:finishLineLoginFromUrl:exchange',
      'line callback exchange finished',
      {
        durationMs: Number((performance.now() - exchangeStartedAt).toFixed(1)),
        ok: resp.ok,
        status: resp.status,
        hasToken: !!String(data?.access_token || '').trim(),
        hasUserId: !!String(data?.user_id || '').trim()
      }
    );
    // #endregion
    if (!resp.ok) return { ok: false, error: 'LINE_EXCHANGE_FAILED', detail: data, status: resp.status };

    const token = String(data?.access_token || '').trim();
    const userId = String(data?.user_id || '').trim();
    if (!token || !userId) return { ok: false, error: 'LINE_NO_TOKEN', detail: data };

    setCustomJwt(token);
    try { localStorage.removeItem('UVACO_LINE_STATE'); } catch (e) {}
    try { sessionStorage.removeItem('UVACO_LINE_STATE'); } catch (e) {}

    // 清掉 query（避免重整重複處理）
    const next = (function () {
      try { return String(localStorage.getItem('UVACO_LINE_NEXT') || '').trim(); } catch (e) { return ''; }
    })() || 'directory.html';
    try { localStorage.removeItem('UVACO_LINE_NEXT'); } catch (e) {}
    window.location.replace(next);
    return { ok: true, handled: true };
  } catch (e) {
    return { ok: false, error: 'LINE_CALLBACK_ERROR', detail: String(e?.message || e || '') };
  }
}

export async function lineAuthDiag() {
  const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/line-auth';
  // 優先用 GET（簡單），若 function 設定要求 JWT，則用 POST + Authorization/apikey
  try {
    const r = await fetchWithTimeout(endpoint, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
      }
    }, 8000);
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data, endpoint };
  } catch (e) {
    return { ok: false, error: 'DIAG_FETCH_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
  }
}

/* =========================================================================
 * 6b. LIFF 自動登入 (LIFF Auto Login)
 * ========================================================================= */

export function hasLiffConfig() {
  return !!LIFF_ID;
}

export function isInLiffBrowser() {
  try {
    return typeof liff !== 'undefined' && liff.isInClient && liff.isInClient();
  } catch (e) {
    return false;
  }
}

export function isLiffSdkLoaded() {
  return typeof liff !== 'undefined';
}

export async function initLiff() {
  if (!LIFF_ID) return { ok: false, error: 'NO_LIFF_ID' };
  if (!isLiffSdkLoaded()) return { ok: false, error: 'LIFF_SDK_NOT_LOADED' };

  try {
    await liff.init({ liffId: LIFF_ID });
    return { ok: true, isLoggedIn: liff.isLoggedIn(), isInClient: liff.isInClient() };
  } catch (e) {
    return { ok: false, error: 'LIFF_INIT_FAILED', detail: String(e?.message || e) };
  }
}

export async function liffAutoLogin(nextPage) {
  if (!LIFF_ID || !isLiffSdkLoaded()) return { ok: false, error: 'LIFF_NOT_AVAILABLE' };

  try {
    const initStartedAt = performance.now();
    const initResult = await initLiff();
    // #region agent log
    logLineAuthDebug(
      'H1',
      'js/cloud/line-liff.js:liffAutoLogin:init',
      'liff init finished',
      {
        durationMs: Number((performance.now() - initStartedAt).toFixed(1)),
        ok: !!initResult.ok,
        error: initResult.error || null,
        isLoggedIn: initResult.isLoggedIn ?? null,
        isInClient: initResult.isInClient ?? null
      }
    );
    // #endregion
    if (!initResult.ok) return initResult;

    if (!liff.isInClient()) return { ok: false, error: 'LIFF_NOT_IN_CLIENT' };

    if (!liff.isLoggedIn()) {
      // 邀請連結的 ref（推薦人編號）已經在 bootstrap() 存進 localStorage，
      // 這裡要一併帶回導回網址，避免 liff.login() 導回後網址只剩 next，
      // 讓好友透過邀請連結進來的推薦紀錄看起來像遺失。
      var refId = '';
      try { refId = String(localStorage.getItem('UVACO_REFERRER_ID') || '').trim(); } catch (e) {}
      var redirectUri = getBaseUrl() + 'auth.html?next=' + encodeURIComponent(nextPage || 'directory.html') + '&liff=1'
        + (refId ? '&ref=' + encodeURIComponent(refId) : '');
      liff.login({ redirectUri: redirectUri });
      return { ok: true, handled: true, action: 'redirecting_to_login' };
    }

    const accessToken = liff.getAccessToken();
    if (!accessToken) return { ok: false, error: 'LIFF_NO_TOKEN' };

    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/line-auth';
    const exchangeStartedAt = performance.now();
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
      },
      body: JSON.stringify({ liff_access_token: accessToken })
    }, 15000);

    let data = {};
    try { data = await resp.json(); } catch (_e) { data = { non_json_response: true }; }
    // #region agent log
    logLineAuthDebug(
      'H1',
      'js/cloud/line-liff.js:liffAutoLogin:exchange',
      'liff token exchange finished',
      {
        durationMs: Number((performance.now() - exchangeStartedAt).toFixed(1)),
        ok: resp.ok,
        status: resp.status,
        hasToken: !!String(data?.access_token || '').trim(),
        hasUserId: !!String(data?.user_id || '').trim()
      }
    );
    // #endregion
    if (!resp.ok) return { ok: false, error: 'LIFF_EXCHANGE_FAILED', detail: data, status: resp.status };

    const token = String(data?.access_token || '').trim();
    const userId = String(data?.user_id || '').trim();
    if (!token || !userId) return { ok: false, error: 'LIFF_NO_JWT', detail: data };

    setCustomJwt(token);
    const target = nextPage || 'directory.html';
    window.location.replace(target);
    return { ok: true, handled: true };
  } catch (e) {
    return { ok: false, error: 'LIFF_AUTO_LOGIN_ERROR', detail: String(e?.message || e) };
  }
}
