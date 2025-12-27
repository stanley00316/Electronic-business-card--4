// 雲端（Supabase）共用工具（純前端 / GitHub Pages 可用）
// 注意：Supabase ANON KEY 可公開放在前端（它不是私鑰），真正權限由 RLS 控制。

window.UVACO_CLOUD = (function () {
  // 你需要把這兩個值改成你 Supabase 專案的設定（Project Settings → API）
  // - SUPABASE_URL: https://xxxx.supabase.co
  // - SUPABASE_ANON_KEY: anon public key
  const SUPABASE_URL = '';
  const SUPABASE_ANON_KEY = '';

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

  async function getSession() {
    const client = getClient();
    if (!client) return { session: null, error: new Error('SUPABASE_NOT_CONFIGURED') };
    const { data, error } = await client.auth.getSession();
    return { session: data?.session || null, error };
  }

  async function requireAuth(nextRelativeUrl) {
    const client = getClient();
    if (!client) {
      alert('尚未設定 Supabase，請先在 cloud.js 填入 SUPABASE_URL / SUPABASE_ANON_KEY。');
      return { ok: false, reason: 'no_config' };
    }
    const { session } = await getSession();
    if (session) return { ok: true, session };

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

  async function getMyCard() {
    const client = getClient();
    const { session } = await getSession();
    if (!client || !session) return { card: null };
    const { data, error } = await client
      .from('cards')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) return { card: null, error };
    return { card: data || null };
  }

  async function upsertMyCard(payload) {
    const client = getClient();
    const { session } = await getSession();
    if (!client || !session) throw new Error('NO_SESSION');
    const row = {
      user_id: session.user.id,
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
    const client = getClient();
    const { session } = await getSession();
    if (!client || !session) throw new Error('NO_SESSION');
    const { data: existing, error: qErr } = await client
      .from('consents')
      .select('id, consent_version, consented_at')
      .eq('user_id', session.user.id)
      .order('consented_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (qErr) throw qErr;
    if (existing && existing.consent_version === consentVersion) return { ok: true, existed: true };

    const { error } = await client.from('consents').insert({
      user_id: session.user.id,
      consent_version: consentVersion,
      policy_url: policyUrl || 'privacy.html',
      consented_at: new Date().toISOString(),
      user_agent: navigator.userAgent || ''
    });
    if (error) throw error;
    return { ok: true, existed: false };
  }

  async function isAdmin() {
    const client = getClient();
    if (!client) return false;
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
    const client = getClient();
    if (!client) throw new Error('SUPABASE_NOT_CONFIGURED');
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
    getSession,
    requireAuth,
    signInWithEmailOtp,
    exchangeCodeForSessionIfNeeded,
    getMyCard,
    upsertMyCard,
    ensureConsent,
    isAdmin,
    exportCardsCsv
  };
})();

