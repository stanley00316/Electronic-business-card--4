import {
  getCustomJwt,
  clearCustomJwt,
  decodeJwtSub,
  isJwtExpired
} from './jwt.js';
import { getClient, getCustomClient, hasConfig } from './clients.js';


export async function getAuthContext() {
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

export async function getSession() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { session: null, error: new Error(ctx.reason || 'NO_SESSION') };
  return { session: ctx.session || null, error: null };
}

export async function requireAuth(nextRelativeUrl) {
  if (!hasConfig()) {
    alert('尚未設定 Supabase，請先在 js/cloud/constants.js 填入 SUPABASE_URL / SUPABASE_ANON_KEY。');
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
export async function signInWithEmailOtp(email, nextRelativeUrl) {
  throw new Error('Email login is deprecated. Please use LINE login.');
}

export async function exchangeCodeForSessionIfNeeded() {
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
