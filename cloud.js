// 雲端（Supabase + Cloudflare R2）共用工具（純前端 / GitHub Pages 可用）
// 注意：Supabase ANON KEY 可公開放在前端（它不是私鑰），真正權限由 RLS 控制。
// v=20260126 - 新增 Cloudflare R2 儲存支援

window.UVACO_CLOUD = (function () {
  // ===== Supabase 設定 =====
  // 你需要把這兩個值改成你 Supabase 專案的設定（Project Settings → API）
  // - SUPABASE_URL: https://xxxx.supabase.co
  // - SUPABASE_ANON_KEY: anon public key
  const SUPABASE_URL = 'https://nqxibryjhgftyxttopuo.supabase.co';
  // Supabase Dashboard → Settings → API Keys → Publishable key (default)
  const SUPABASE_ANON_KEY = 'sb_publishable_iTgIYinO82u_nwhdzvS8EQ_zDtNKpdH';

  // ===== 儲存設定 =====
  // STORAGE_PROVIDER: 'supabase' 或 'r2'
  // - 'supabase': 使用 Supabase Storage（預設）
  // - 'r2': 使用 Cloudflare R2（需要部署 upload-r2 Edge Function）
  const STORAGE_PROVIDER = 'supabase'; // 改為 'r2' 以使用 Cloudflare R2

  // ===== LINE Login（自訂 JWT 模式）=====
  // 若你要啟用 LINE 登入：
  // 1) 在 LINE Developers 建立 LINE Login channel
  // 2) 把 Channel ID 填在這裡（可公開）
  // 3) 部署 supabase edge function：supabase/functions/line-auth
  // 重要：LINE Login 的 Channel ID 通常是「純數字」。
  // 你給的值若不是數字，代表可能貼到的是 LINE ID 而非 Channel ID（會導致登入失敗）。
  const LINE_CHANNEL_ID = '2008810712'; // LINE Login 的 Channel ID（client_id）
  
  // ===== Google Login =====
  // 若你要啟用 Google 登入：
  // 1) 在 Google Cloud Console 建立 OAuth 2.0 Client
  // 2) 把 Client ID 填在這裡（可公開）
  // 3) 在 Supabase Edge Functions Secrets 設定 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET
  // 4) 部署 supabase edge function：supabase/functions/google-auth
  const GOOGLE_CLIENT_ID = ''; // Google OAuth Client ID（留空則不顯示 Google 登入按鈕）
  
  // ===== Apple Login =====
  // 若你要啟用 Apple 登入：
  // 1) 註冊 Apple Developer Program ($99/年)
  // 2) 在 Apple Developer 建立 Services ID
  // 3) 把 Client ID 填在這裡（可公開）
  // 4) 部署 supabase edge function：supabase/functions/apple-auth
  const APPLE_CLIENT_ID = ''; // Apple Services ID（留空則不顯示 Apple 登入按鈕）
  
  const CUSTOM_JWT_KEY = 'UVACO_CUSTOM_JWT';

  async function fetchWithTimeout(url, options, timeoutMs) {
    const ms = Math.max(parseInt(timeoutMs || 0, 10) || 0, 1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const resp = await fetch(url, { ...(options || {}), signal: controller.signal });
      return resp;
    } finally {
      clearTimeout(timer);
    }
  }

  function hasConfig() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  function getBaseUrl() {
    // 取得目前頁面所在資料夾（GitHub Pages 子路徑相容）
    const path = window.location.pathname;
    return window.location.origin + path.replace(/[^/]*$/, '');
  }

  function getClient() {
    if (!hasConfig()) return null;
    if (window.__uvacoSupabaseClient) return window.__uvacoSupabaseClient;
    if (!window.supabase || !window.supabase.createClient) return null;
    window.__uvacoSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return window.__uvacoSupabaseClient;
  }

  function getCustomJwt() {
    try { return String(localStorage.getItem(CUSTOM_JWT_KEY) || '').trim(); } catch (e) { return ''; }
  }

  function setCustomJwt(token) {
    const t = String(token || '').trim();
    if (!t) return false;
    try { localStorage.setItem(CUSTOM_JWT_KEY, t); } catch (e) {}
    return true;
  }

  function clearCustomJwt() {
    try { localStorage.removeItem(CUSTOM_JWT_KEY); } catch (e) {}
    try { delete window.__uvacoSupabaseCustomClient; } catch (e) {}
  }

  function decodeJwtSub(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return '';
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const json = atob(b64 + pad);
      const payload = JSON.parse(json);
      return String(payload?.sub || '').trim();
    } catch (e) {
      return '';
    }
  }

  // 檢查 JWT 是否已過期
  function isJwtExpired(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return true;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      const json = atob(b64 + pad);
      const payload = JSON.parse(json);
      const exp = payload?.exp || 0;
      // 提前 5 分鐘視為過期，避免邊界情況
      return Date.now() / 1000 > exp - 300;
    } catch (e) {
      return true;
    }
  }

  function getCustomClient(customJwt) {
    if (!hasConfig()) return null;
    const token = String(customJwt || '').trim();
    if (!token) return null;
    const cache = window.__uvacoSupabaseCustomClient || (window.__uvacoSupabaseCustomClient = {});
    if (cache[token]) return cache[token];
    if (!window.supabase || !window.supabase.createClient) return null;
    cache[token] = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: 'Bearer ' + token }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    return cache[token];
  }

  async function getAuthContext() {
    // 1) 優先：自訂 JWT（LINE 登入）
    const customJwt = getCustomJwt();
    if (customJwt) {
      // 檢查 JWT 是否已過期
      if (isJwtExpired(customJwt)) {
        console.warn('JWT 已過期，清除登入狀態');
        clearCustomJwt();
        return { ok: false, reason: 'JWT_EXPIRED' };
      }
      const userId = decodeJwtSub(customJwt);
      const client = getCustomClient(customJwt);
      if (client && userId) {
        return { ok: true, mode: 'custom', client, userId, session: { user: { id: userId } } };
      }
    }

    // 2) 次選：Supabase Auth session（Email magic link - 已停用，保留代碼僅供參考或舊 session 相容）
    const client = getClient();
    if (!client) return { ok: false, reason: 'SUPABASE_NOT_CONFIGURED' };
    const { data, error } = await client.auth.getSession();
    const session = data?.session || null;
    if (error) return { ok: false, reason: 'SESSION_ERROR', error };
    if (!session) return { ok: false, reason: 'NO_SESSION' };
    return { ok: true, mode: 'supabase', client, userId: session.user.id, session };
  }

  async function getSession() {
    const ctx = await getAuthContext();
    if (!ctx.ok) return { session: null, error: new Error(ctx.reason || 'NO_SESSION') };
    return { session: ctx.session || null, error: null };
  }

  async function requireAuth(nextRelativeUrl) {
    if (!hasConfig()) {
      alert('尚未設定 Supabase，請先在 cloud.js 填入 SUPABASE_URL / SUPABASE_ANON_KEY。');
      return { ok: false, reason: 'no_config' };
    }
    const ctx = await getAuthContext();
    if (ctx.ok) return { ok: true, session: ctx.session };

    const next = nextRelativeUrl || 'directory.html';
    // 改為導向 LINE 登入頁 (auth.html)
    window.location.replace('auth.html?next=' + encodeURIComponent(next));
    return { ok: false, reason: 'no_session' };
  }

  // 已廢棄：Email 登入
  async function signInWithEmailOtp(email, nextRelativeUrl) {
    throw new Error('Email login is deprecated. Please use LINE login.');
  }

  async function exchangeCodeForSessionIfNeeded() {
    const client = getClient();
    if (!client) return { ok: false, error: new Error('SUPABASE_NOT_CONFIGURED') };
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (!code) return { ok: true, exchanged: false };
    // PKCE flow：把 code 換成 session
    const { error } = await client.auth.exchangeCodeForSession(window.location.href);
    if (error) return { ok: false, error };
    return { ok: true, exchanged: true };
  }

  function getLineRedirectUri(nextRelativeUrl) {
    // LINE callback 必須與 LINE Developers 設定完全一致。
    // 注意：redirect_uri 建議「不要帶 query」，避免 LINE 後台登錄時更容易踩到不匹配。
    // next 改存 localStorage 轉交。
    return getBaseUrl() + 'auth.html';
  }

  function startLineLogin(nextRelativeUrl) {
    if (!LINE_CHANNEL_ID) {
      alert("尚未設定 LINE_CHANNEL_ID（請在 cloud.js 填入 LINE Channel ID）。");
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

    window.location.href = 'https://access.line.me/oauth2/v2.1/authorize?' + params.toString();
    return true;
  }

  async function finishLineLoginFromUrl() {
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
      try {
        resp = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            // 若 Supabase Edge Function 開啟「Verify JWT with legacy secret」，
            // 需要 Authorization header（使用 anon key 即可）
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
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

  async function lineAuthDiag() {
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/line-auth';
    // 優先用 GET（簡單），若 function 設定要求 JWT，則用 POST + Authorization/apikey
    try {
      const r = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        }
      }, 8000);
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data, endpoint };
    } catch (e) {
      return { ok: false, error: 'DIAG_FETCH_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
    }
  }

  // ===== Google Login Functions =====
  
  function hasGoogleConfig() {
    return !!GOOGLE_CLIENT_ID;
  }

  function getGoogleRedirectUri() {
    return getBaseUrl() + 'auth.html';
  }

  function startGoogleLogin(nextRelativeUrl) {
    if (!GOOGLE_CLIENT_ID) {
      alert("尚未設定 GOOGLE_CLIENT_ID（請在 cloud.js 填入 Google OAuth Client ID）。");
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

  async function finishGoogleLoginFromUrl() {
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
            'content-type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
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

  async function googleAuthDiag() {
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/google-auth';
    try {
      const r = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        }
      }, 8000);
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data, endpoint };
    } catch (e) {
      return { ok: false, error: 'GOOGLE_DIAG_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
    }
  }

  // ===== Apple Login Functions =====
  
  function hasAppleConfig() {
    return !!APPLE_CLIENT_ID;
  }

  function getAppleRedirectUri() {
    return getBaseUrl() + 'auth.html';
  }

  function startAppleLogin(nextRelativeUrl) {
    if (!APPLE_CLIENT_ID) {
      alert("尚未設定 APPLE_CLIENT_ID（請在 cloud.js 填入 Apple Services ID）。");
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
  async function finishAppleLoginFromUrl() {
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
            'content-type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
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

  async function appleAuthDiag() {
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/apple-auth';
    try {
      const r = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        }
      }, 8000);
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data, endpoint };
    } catch (e) {
      return { ok: false, error: 'APPLE_DIAG_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
    }
  }

  async function getMyCard() {
    const ctx = await getAuthContext();
    if (!ctx.ok) return { card: null };
    const client = ctx.client;
    const { data, error } = await client
      .from('cards')
      .select('*')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (error) return { card: null, error };
    return { card: data || null };
  }

  async function getCardByUserId(userId) {
    const ctx = await getAuthContext();
    const client = ctx.ok ? ctx.client : getClient();
    if (!client || !userId) return { card: null };
    const { data, error } = await client
      .from('cards')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { card: null, error };
    return { card: data || null };
  }

  // 公開讀取名片（給 card.html 用，不需登入）
  async function getCardPublic(userId) {
    if (!hasConfig()) return { card: null };
    // 使用 anon key 建立一個純公開客戶端
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client
      .from('cards')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { card: null, error };
    return { card: data || null };
  }

  // 管理員取得所有名片（給 admin.html 用）
  async function getAllCardsAdmin() {
    const ctx = await getAuthContext();
    if (!ctx.ok) return { rows: [] };
    const client = ctx.client;
    
    // 檢查管理員權限與公司過濾
    const adminStatus = await isAdmin();
    if (!adminStatus || !adminStatus.isAdmin) return { rows: [] };

    let query = client
      .from('cards')
      .select('*')
      .order('updated_at', { ascending: false });

    // 企業管理員：只篩選該公司的名片 (ILike)
    if (adminStatus.managedCompany) {
      // 簡單的文字比對 (case-insensitive)
      query = query.ilike('company', `%${adminStatus.managedCompany}%`);
    }
      
    const { data, error } = await query;
      
    if (error) {
      console.error('List cards failed:', error);
      return { rows: [] };
    }
    return { rows: data || [] };
  }

  // 管理員刪除名片
  async function deleteCard(targetUserId) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;

    const adminStatus = await isAdmin();
    if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

    // 企業管理員：再次確認刪除對象是否屬於該公司 (雙重保險)
    // 雖然前端 UI 會過濾，但後端操作前最好再檢查一次
    if (adminStatus.managedCompany) {
      const { data: targetCard } = await client
        .from('cards')
        .select('company')
        .eq('user_id', targetUserId)
        .maybeSingle();
      
      const targetCompany = targetCard?.company || '';
      // 簡單比對：若名片公司名稱不包含管理員管理的公司名稱，則拒絕
      if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
        throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
      }
    }

    const { error } = await client
      .from('cards')
      .delete()
      .eq('user_id', targetUserId);
    
    if (error) throw error;
    return true;
  }

  // 取得管理員列表 (Super Admin Only)
  async function getAdminUsers() {
    const ctx = await getAuthContext();
    if (!ctx.ok) return { rows: [] };
    const client = ctx.client;

    // 權限檢查：只有 Super Admin 能讀取完整列表 (RLS 應該要允許讀取，但 UI 層面我們只給 Super Admin 看)
    const me = await isAdmin();
    if (!me || !me.isAdmin || me.managedCompany) {
      // 非 Super Admin，回傳空或只回傳自己
      return { rows: [] };
    }

    // 只取必要欄位，避免依賴 created_at / note 等不存在欄位
    const { data, error } = await client
      .from('admin_users')
      .select('user_id,managed_company');
    if (error) return { rows: [] };
    return { rows: data || [] };
  }

  // 新增/更新管理員 (Super Admin Only)
  // 注意：admin_users 常見只有 user_id/managed_company，且我們的 RLS 未必允許 UPDATE，
  // 因此這裡用「先刪除再插入」確保可用。
  async function upsertAdminUser(targetUserId, managedCompany) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;

    const me = await isAdmin();
    if (!me || !me.isAdmin || me.managedCompany) throw new Error('NOT_SUPER_ADMIN');

    const uid = String(targetUserId || '').trim();
    if (!uid) throw new Error('MISSING_USER_ID');

    // 先刪除（若不存在也沒關係）
    await client.from('admin_users').delete().eq('user_id', uid);

    const { error } = await client
      .from('admin_users')
      .insert({
        user_id: uid,
        managed_company: (String(managedCompany || '').trim() || null)
      });

    if (error) throw error;
    return true;
  }

  // 刪除管理員 (Super Admin Only)
  async function deleteAdminUser(targetUserId) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;

    const me = await isAdmin();
    if (!me || !me.isAdmin || me.managedCompany) throw new Error('NOT_SUPER_ADMIN');

    const { error } = await client
      .from('admin_users')
      .delete()
      .eq('user_id', targetUserId);
    
    if (error) throw error;
    return true;
  }

  // 管理員更新名片（給 edit.html 的 adminMode 用）
  async function adminUpdateCard(targetUserId, payload) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;

    const adminStatus = await isAdmin();
    if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

    const uid = String(targetUserId || '').trim();
    if (!uid) throw new Error('MISSING_TARGET_USER_ID');

    // 讀取目標名片公司以做公司權限比對
    const { data: targetCard, error: qErr } = await client
      .from('cards')
      .select('user_id,company')
      .eq('user_id', uid)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!targetCard) throw new Error('CARD_NOT_FOUND');

    if (adminStatus.managedCompany) {
      const targetCompany = String(targetCard.company || '');
      if (!targetCompany.toLowerCase().includes(String(adminStatus.managedCompany).toLowerCase())) {
        throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
      }
    }

    const updateData = {
      name: payload?.name || '',
      phone: payload?.phone || '',
      email: payload?.email || '',
      company: payload?.company || '',
      title: payload?.title || '',
      theme: Number(payload?.theme || 1),
      profile_json: payload?.profile_json || {},
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('cards')
      .update(updateData)
      .eq('user_id', uid);

    if (error) throw error;
    return true;
  }

  async function searchCards(params) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;
    const q = String(params?.q || '').trim();
    const limit = Math.min(Math.max(parseInt(params?.limit || 50, 10) || 50, 1), 200);

    let query = client
      .from('cards')
      // 盡量只取通訊錄顯示需要的欄位；完整預覽再用 getCardByUserId
      .select('user_id,name,company,title,theme,updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (q) {
      const esc = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `name.ilike.%${esc}%,company.ilike.%${esc}%,title.ilike.%${esc}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return { rows: data || [] };
  }

  // 上傳到 Supabase Storage
  async function uploadToSupabaseStorage(ctx, kind, blob, opts) {
    const client = ctx.client;
    const bucket = (opts && opts.bucket) ? String(opts.bucket) : 'card-assets';
    const ext = (opts && opts.ext) ? String(opts.ext).replace(/^\./, '') : 'webp';
    const contentType = (opts && opts.contentType) ? String(opts.contentType) : 'image/webp';
    const path = `${ctx.userId}/${kind}.${ext}`;

    const { error } = await client.storage
      .from(bucket)
      .upload(path, blob, {
        upsert: true,
        contentType
      });
    if (error) throw error;
    return { bucket, path, provider: 'supabase' };
  }

  // 上傳到 Cloudflare R2
  async function uploadToR2(ctx, kind, blob, opts) {
    const ext = (opts && opts.ext) ? String(opts.ext).replace(/^\./, '') : 'webp';
    const contentType = (opts && opts.contentType) ? String(opts.contentType) : 'image/webp';
    const key = `${ctx.userId}/${kind}.${ext}`;

    // 將 blob 轉換為 base64
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    // 呼叫 Edge Function 上傳
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/upload-r2';
    const customJwt = getCustomJwt();
    
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + (customJwt || SUPABASE_ANON_KEY)
      },
      body: JSON.stringify({
        action: 'upload',
        key: key,
        data: base64Data,
        contentType: contentType
      })
    }, 30000);

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error || 'R2_UPLOAD_FAILED');
    }

    return { 
      bucket: data.bucket, 
      path: key, 
      publicUrl: data.publicUrl,
      provider: 'r2'
    };
  }

  async function uploadMyAsset(kind, blob, opts) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    if (!blob) throw new Error('NO_FILE');

    // 根據設定選擇儲存提供者
    const provider = (opts && opts.provider) || STORAGE_PROVIDER;
    
    if (provider === 'r2') {
      return await uploadToR2(ctx, kind, blob, opts);
    } else {
      return await uploadToSupabaseStorage(ctx, kind, blob, opts);
    }
  }

  async function getSignedAssetUrl(path, opts) {
    if (!path) return { url: '' };
    
    // 如果 path 已經是完整的 URL（R2 公開 URL），直接返回
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return { url: path };
    }
    
    const client = getClient();
    if (!client) return { url: '' };
    const bucket = (opts && opts.bucket) ? String(opts.bucket) : 'card-assets';
    const expiresIn = Math.min(Math.max(parseInt(opts?.expiresIn || 3600, 10) || 3600, 60), 60 * 60 * 24);
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) return { url: '', error };
    return { url: data?.signedUrl || '' };
  }

  async function upsertMyCard(payload) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;
    const row = {
      user_id: ctx.userId,
      name: payload?.name || '',
      phone: payload?.phone || '',
      email: payload?.email || '',
      company: payload?.company || '',
      title: payload?.title || '',
      theme: Number(payload?.theme || 1),
      profile_json: payload?.profile_json || {}
    };
    const { data, error } = await client
      .from('cards')
      .upsert(row, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function ensureConsent(consentVersion, policyUrl) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;
    const { data: existing, error: qErr } = await client
      .from('consents')
      .select('id, consent_version, consented_at')
      .eq('user_id', ctx.userId)
      .order('consented_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (qErr) throw qErr;
    if (existing && existing.consent_version === consentVersion) return { ok: true, existed: true };

    const { error } = await client.from('consents').insert({
      user_id: ctx.userId,
      consent_version: consentVersion,
      policy_url: policyUrl || 'privacy.html',
      consented_at: new Date().toISOString(),
      user_agent: navigator.userAgent || ''
    });
    if (error) throw error;
    return { ok: true, existed: false };
  }

  async function isAdmin() {
    const ctx = await getAuthContext();
    if (!ctx.ok) return false;
    const client = ctx.client;
    
    // 檢查 admin_users 表
    const { data, error } = await client
      .from('admin_users')
      .select('user_id, managed_company')
      .eq('user_id', ctx.userId)
      .maybeSingle();
      
    if (error || !data) return false;
    
    // 回傳物件：{ isAdmin: true, managedCompany: 'Tesla' or null }
    // managedCompany: null 代表 Super Admin；有值代表 Company Admin
    return { 
      isAdmin: true, 
      managedCompany: data.managed_company || null 
    };
  }

  function toCsv(rows, headers) {
    const esc = (v) => {
      const s = String(v ?? '');
      if (/[\",\n]/.test(s)) return '"' + s.replace(/\"/g, '""') + '"';
      return s;
    };
    const lines = [];
    lines.push(headers.join(','));
    rows.forEach(r => {
      lines.push(headers.map(h => esc(r[h])).join(','));
    });
    // UTF-8 BOM，避免 Excel 亂碼
    return '\ufeff' + lines.join('\n');
  }

  async function exportCardsCsv() {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;
    const headers = ['name', 'phone', 'email', 'company', 'title', 'theme', 'created_at', 'updated_at'];
    const { data, error } = await client
      .from('cards')
      .select(headers.join(','))
      .order('created_at', { ascending: false });
    if (error) throw error;
    const csv = toCsv(data || [], headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cards-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }

  // R2 診斷
  async function r2Diag() {
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/upload-r2';
    try {
      const r = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
        }
      }, 8000);
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data, endpoint };
    } catch (e) {
      return { ok: false, error: 'R2_DIAG_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
    }
  }

  // 取得目前的儲存提供者
  function getStorageProvider() {
    return STORAGE_PROVIDER;
  }

  return {
    hasConfig,
    getClient,
    getBaseUrl,
    getCustomJwt,
    clearCustomJwt,
    getSession,
    requireAuth,
    signInWithEmailOtp,
    exchangeCodeForSessionIfNeeded,
    // LINE Login
    startLineLogin,
    finishLineLoginFromUrl,
    lineAuthDiag,
    // Google Login
    hasGoogleConfig,
    startGoogleLogin,
    finishGoogleLoginFromUrl,
    googleAuthDiag,
    // Apple Login
    hasAppleConfig,
    startAppleLogin,
    finishAppleLoginFromUrl,
    appleAuthDiag,
    getMyCard,
    getCardByUserId,
    getCardPublic,
    getAllCardsAdmin,
    searchCards,
    upsertMyCard,
    ensureConsent,
    isAdmin,
    deleteCard,
    getAdminUsers,
    upsertAdminUser,
    deleteAdminUser,
    adminUpdateCard,
    uploadMyAsset,
    getSignedAssetUrl,
    getStorageProvider,
    r2Diag,
    exportCardsCsv
  };
})();

