import { getAuthContext } from './session.js';
import { getClient } from './clients.js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_ANON_JWT,
  STORAGE_PROVIDER
} from './constants.js';
import { fetchWithTimeout } from './http.js';


export async function ensureConsent(consentVersion, policyUrl) {
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

/* =========================================================================
 * 14. 匯出功能 (Export)
 * ========================================================================= */

export function toCsv(rows, headers) {
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

export async function exportCardsCsv() {
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

/* =========================================================================
 * 15. 診斷功能 (Diagnostics)
 * ========================================================================= */

// R2 診斷
export async function r2Diag() {
  const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/upload-r2';
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
    return { ok: false, error: 'R2_DIAG_FAILED', detail: String(e?.name === 'AbortError' ? 'TIMEOUT' : (e?.message || e || '')), endpoint };
  }
}

// 取得目前的儲存提供者
export function getStorageProvider() {
  return STORAGE_PROVIDER;
}
