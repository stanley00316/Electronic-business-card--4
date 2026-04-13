import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_ANON_JWT,
  GOOGLE_CLIENT_ID,
  APPLE_CLIENT_ID
} from './constants.js';
import { fetchWithTimeout } from './http.js';
import { setCustomJwt } from './jwt.js';
import { getBaseUrl } from './clients.js';


// ===== Google Login Functions =====

export function hasGoogleConfig() {
  return !!GOOGLE_CLIENT_ID;
}

export function getGoogleRedirectUri() {
  return getBaseUrl() + 'auth.html';
}

export function startGoogleLogin(nextRelativeUrl) {
  if (!GOOGLE_CLIENT_ID) {
    alert("尚未設定 GOOGLE_CLIENT_ID（請在 js/cloud/constants.js 填入 Google OAuth Client ID）。");
    return false;
  }
  const next = nextRelativeUrl || 'directory.html';
  try { localStorage.setItem('UVACO_GOOGLE_NEXT', next); } catch (e) {}
  const redirectUri = getGoogleRedirectUri();
  const state = 'google_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { localStorage.setItem('UVACO_GOOGLE_STATE', state); } catch (e) {}
  try { sessionStorage.setItem('UVACO_GOOGLE_STATE', state); } catch (e) {}

  const params = new URLSearchParams();
  params.set('response_type', 'code');
  params.set('client_id', GOOGLE_CLIENT_ID);
  params.set('redirect_uri', redirectUri);
  params.set('state', state);
  params.set('scope', 'openid email profile');
  params.set('access_type', 'offline');
  params.set('prompt', 'consent');

  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  return true;
}

export async function finishGoogleLoginFromUrl() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch (e) {
    return { ok: false, error: 'GOOGLE_URL_PARSE_ERROR', detail: String(e?.message || e || '') };
  }

  const code = String(url.searchParams.get('code') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  
  // 檢查是否為 Google callback（state 以 google_ 開頭）
  if (!code || !state || !state.startsWith('google_')) {
    return { ok: true, handled: false };
  }

  try {
    const expectedState = (function () {
      try {
        const a = String(localStorage.getItem('UVACO_GOOGLE_STATE') || '').trim();
        const b = String(sessionStorage.getItem('UVACO_GOOGLE_STATE') || '').trim();
        return a || b;
      } catch (e) { return ''; }
    })();
    
    if (expectedState && state !== expectedState) return { ok: false, error: 'GOOGLE_BAD_STATE' };

    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/google-auth';
    const redirectUri = getGoogleRedirectUri();
    let resp;
    try {
      resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
        },
        body: JSON.stringify({ code, redirect_uri: redirectUri })
      }, 15000);
    } catch (e) {
      return {
        ok: false,
        error: 'GOOGLE_FETCH_FAILED',
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
    if (!resp.ok) return { ok: false, error: 'GOOGLE_EXCHANGE_FAILED', detail: data, status: resp.status };

    const token = String(data?.access_token || '').trim();
    const userId = String(data?.user_id || '').trim();
    if (!token || !userId) return { ok: false, error: 'GOOGLE_NO_TOKEN', detail: data };

    setCustomJwt(token);
    try { localStorage.removeItem('UVACO_GOOGLE_STATE'); } catch (e) {}
    try { sessionStorage.removeItem('UVACO_GOOGLE_STATE'); } catch (e) {}

    const next = (function () {
      try { return String(localStorage.getItem('UVACO_GOOGLE_NEXT') || '').trim(); } catch (e) { return ''; }
    })() || 'directory.html';
    try { localStorage.removeItem('UVACO_GOOGLE_NEXT'); } catch (e) {}
    window.location.replace(next);
    return { ok: true, handled: true };
  } catch (e) {
    return { ok: false, error: 'GOOGLE_CALLBACK_ERROR', detail: String(e?.message || e || '') };
  }
}

export async function googleAuthDiag() {
  const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/google-auth';
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
    return { ok: false, error: 'GOOGLE_DIAG_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
  }
}

// ===== Apple Login Functions =====

export function hasAppleConfig() {
  return !!APPLE_CLIENT_ID;
}

export function getAppleRedirectUri() {
  return getBaseUrl() + 'auth.html';
}

export function startAppleLogin(nextRelativeUrl) {
  if (!APPLE_CLIENT_ID) {
    alert("尚未設定 APPLE_CLIENT_ID（請在 js/cloud/constants.js 填入 Apple Services ID）。");
    return false;
  }
  const next = nextRelativeUrl || 'directory.html';
  try { localStorage.setItem('UVACO_APPLE_NEXT', next); } catch (e) {}
  const redirectUri = getAppleRedirectUri();
  const state = 'apple_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { localStorage.setItem('UVACO_APPLE_STATE', state); } catch (e) {}
  try { sessionStorage.setItem('UVACO_APPLE_STATE', state); } catch (e) {}

  const params = new URLSearchParams();
  params.set('response_type', 'code id_token');
  params.set('response_mode', 'form_post'); // Apple 使用 form_post
  params.set('client_id', APPLE_CLIENT_ID);
  params.set('redirect_uri', redirectUri);
  params.set('state', state);
  params.set('scope', 'name email');

  window.location.href = 'https://appleid.apple.com/auth/authorize?' + params.toString();
  return true;
}

// Apple 使用 form_post，需要在後端處理 callback
// 這個函數用於處理從後端轉發過來的 callback
export async function finishAppleLoginFromUrl() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch (e) {
    return { ok: false, error: 'APPLE_URL_PARSE_ERROR', detail: String(e?.message || e || '') };
  }

  const code = String(url.searchParams.get('code') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  const idToken = String(url.searchParams.get('id_token') || '').trim();
  
  // 檢查是否為 Apple callback（state 以 apple_ 開頭）
  if (!state || !state.startsWith('apple_')) {
    return { ok: true, handled: false };
  }

  if (!code) {
    return { ok: false, error: 'APPLE_NO_CODE' };
  }

  try {
    const expectedState = (function () {
      try {
        const a = String(localStorage.getItem('UVACO_APPLE_STATE') || '').trim();
        const b = String(sessionStorage.getItem('UVACO_APPLE_STATE') || '').trim();
        return a || b;
      } catch (e) { return ''; }
    })();
    
    if (expectedState && state !== expectedState) return { ok: false, error: 'APPLE_BAD_STATE' };

    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/apple-auth';
    const redirectUri = getAppleRedirectUri();
    let resp;
    try {
      resp = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
        },
        body: JSON.stringify({ code, redirect_uri: redirectUri, id_token: idToken })
      }, 15000);
    } catch (e) {
      return {
        ok: false,
        error: 'APPLE_FETCH_FAILED',
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
    if (!resp.ok) return { ok: false, error: 'APPLE_EXCHANGE_FAILED', detail: data, status: resp.status };

    const token = String(data?.access_token || '').trim();
    const userId = String(data?.user_id || '').trim();
    if (!token || !userId) return { ok: false, error: 'APPLE_NO_TOKEN', detail: data };

    setCustomJwt(token);
    try { localStorage.removeItem('UVACO_APPLE_STATE'); } catch (e) {}
    try { sessionStorage.removeItem('UVACO_APPLE_STATE'); } catch (e) {}

    const next = (function () {
      try { return String(localStorage.getItem('UVACO_APPLE_NEXT') || '').trim(); } catch (e) { return ''; }
    })() || 'directory.html';
    try { localStorage.removeItem('UVACO_APPLE_NEXT'); } catch (e) {}
    window.location.replace(next);
    return { ok: true, handled: true };
  } catch (e) {
    return { ok: false, error: 'APPLE_CALLBACK_ERROR', detail: String(e?.message || e || '') };
  }
}

export async function appleAuthDiag() {
  const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/apple-auth';
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
    return { ok: false, error: 'APPLE_DIAG_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
  }
}
