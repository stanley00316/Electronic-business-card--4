import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';


export function hasConfig() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getBaseUrl() {
  // 取得目前頁面所在資料夾（GitHub Pages 子路徑相容）
  const path = window.location.pathname;
  return window.location.origin + path.replace(/[^/]*$/, '');
}

/* =========================================================================
 * 3. 客戶端管理 (Client Management)
 * ========================================================================= */

export function getClient() {
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

// 公開客戶端（不需要身份驗證的操作使用）
// 直接返回主客戶端以避免多個 GoTrueClient 實例警告
export function getPublicClient() {
  return getClient();
}

export function getCustomClient(customJwt) {
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
