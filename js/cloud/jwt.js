import { CUSTOM_JWT_KEY } from './constants.js';


export function getCustomJwt() {
  try { return String(localStorage.getItem(CUSTOM_JWT_KEY) || '').trim(); } catch (e) { return ''; }
}

export function setCustomJwt(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  try { localStorage.setItem(CUSTOM_JWT_KEY, t); } catch (e) {}
  return true;
}

export function clearCustomJwt() {
  try { localStorage.removeItem(CUSTOM_JWT_KEY); } catch (e) {}
  try { delete window.__uvacoSupabaseCustomClient; } catch (e) {}
}

export function decodeJwtSub(token) {
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

// 從 JWT 中解析 email
export function decodeJwtEmail(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return '';
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const json = atob(b64 + pad);
    const payload = JSON.parse(json);
    // 嘗試從多個位置獲取 email
    return String(payload?.email || payload?.user_metadata?.email || '').trim();
  } catch (e) {
    return '';
  }
}

// 檢查 JWT 是否已過期
export function isJwtExpired(token) {
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
