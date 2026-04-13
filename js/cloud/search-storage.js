import { getAuthContext } from './session.js';
import { getClient, hasConfig } from './clients.js';
import {
  STORAGE_PROVIDER,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_ANON_JWT
} from './constants.js';
import { getCustomJwt } from './jwt.js';
import { fetchWithTimeout } from './http.js';


export async function searchCards(params) {
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

/* =========================================================================
 * 12. 檔案儲存 (Storage)
 * ========================================================================= */

// 上傳到 Supabase Storage
export async function uploadToSupabaseStorage(ctx, kind, blob, opts) {
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
export async function uploadToR2(ctx, kind, blob, opts) {
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
      'content-type': 'application/json; charset=utf-8',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (customJwt || SUPABASE_ANON_JWT)
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

export async function uploadMyAsset(kind, blob, opts) {
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

export async function getSignedAssetUrl(path, opts) {
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

export async function upsertMyCard(payload) {
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
