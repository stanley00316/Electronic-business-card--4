// 雲端（Supabase）共用工具（純前端 / GitHub Pages 可用）
// 注意：Supabase ANON KEY 可公開放在前端（它不是私鑰），真正權限由 RLS 控制。

window.UVACO_CLOUD = (function () {
  // 你需要把這兩個值改成你 Supabase 專案的設定（Project Settings → API）
  // - SUPABASE_URL: https://xxxx.supabase.co
  // - SUPABASE_ANON_KEY: anon public key
  const SUPABASE_URL = 'https://nqxibryjhgftyxttopuo.supabase.co';
  // Supabase Dashboard → Settings → API Keys → Legacy anon, service_role API keys → anon (以 eyJ 開頭)
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xeGlicnlqaGdmdHl4dHRvcHVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxNTY0MDksImV4cCI6MjA4MjczMjQwOX0.b8Vp__OY70wLmRv96LFjiGuqqMfcR06q0yf6VlB6ikU';

  // ===== LINE Login（自訂 JWT 模式）=====
  // 若你要啟用 LINE 登入：
  // 1) 在 LINE Developers 建立 LINE Login channel
  // 2) 把 Channel ID 填在這裡（可公開）
  // 3) 部署 supabase edge function：supabase/functions/line-auth
  // 重要：LINE Login 的 Channel ID 通常是「純數字」。
  // 你給的值若不是數字，代表可能貼到的是 LINE ID 而非 Channel ID（會導致登入失敗）。
  const LINE_CHANNEL_ID = '2008810712'; // LINE Login 的 Channel ID（client_id）
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
      const userId = decodeJwtSub(customJwt);
      const client = getCustomClient(customJwt);
      if (client && userId) {
        return { ok: true, mode: 'custom', client, userId, session: { user: { id: userId } } };
      }
    }

    // 2) 次選：Supabase Auth session（Email magic link）
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
    window.location.replace('auth.html?next=' + encodeURIComponent(next));
    return { ok: false, reason: 'no_session' };
  }

  async function signInWithEmailOtp(email, nextRelativeUrl) {
    const client = getClient();
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED');
    const next = nextRelativeUrl || 'directory.html';
    const redirectTo = getBaseUrl() + 'auth.html?next=' + encodeURIComponent(next);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;
    return true;
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
    
    const { data, error } = await client
      .from('cards')
      .select('*')
      .order('updated_at', { ascending: false });
      
    if (error) {
      console.error('List cards failed:', error);
      return { rows: [] };
    }
    return { rows: data || [] };
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

  async function uploadMyAsset(kind, blob, opts) {
    const ctx = await getAuthContext();
    if (!ctx.ok) throw new Error('NO_SESSION');
    const client = ctx.client;
    if (!blob) throw new Error('NO_FILE');
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
    return { bucket, path };
  }

  async function getSignedAssetUrl(path, opts) {
    const client = getClient();
    if (!client || !path) return { url: '' };
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
    // 建議在 Supabase 以 SQL 建立 RPC：is_admin() → boolean
    const { data, error } = await client.rpc('is_admin');
    if (error) return false;
    return !!data;
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
    startLineLogin,
    finishLineLoginFromUrl,
    lineAuthDiag,
    getMyCard,
    getCardByUserId,
    searchCards,
    upsertMyCard,
    ensureConsent,
    isAdmin,
    uploadMyAsset,
    getSignedAssetUrl,
    exportCardsCsv
  };
})();

