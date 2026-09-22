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


// 通訊錄搜尋比對的欄位。
// cards 資料表只有單一的 name/title/company，雙語名片的「另一半」（例如
// 「邱瑋浚｜Stanley」的 Stanley）只存在 profile_json 裡，所以必須一起比對，
// 否則用英文名或英文職稱搜尋會找不到人。
// 注意：profile_json 內含 base64 圖片與整張名片的 HTML，體積很大，
// 這裡只在資料庫端取出需要比對的文字欄位，不把整包 JSON 傳回前端。
const SEARCH_COLUMNS = ['name', 'company', 'title', 'phone', 'email'];
const SEARCH_JSON_KEYS = [
  'nameZh',
  'nameEn',
  'titleZh',
  'titleEn',
  'companyZh',
  'companyEn',
  'companyCanonical'
];

// PostgREST 的 or() 過濾字串是用逗號分隔、用括號包住的，
// 關鍵字裡若出現這些字元會把過濾條件切壞，所以先去掉。
// %、_ 是 LIKE 的萬用字元，要轉義成純文字比對。
function buildSearchPattern(q) {
  return String(q)
    .replace(/[(),"']/g, ' ')
    .trim()
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export async function searchCards(params) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;
  const q = String(params?.q || '').trim();
  const limit = Math.min(Math.max(parseInt(params?.limit || 50, 10) || 50, 1), 200);
  const esc = q ? buildSearchPattern(q) : '';

  const columnFilters = SEARCH_COLUMNS.map(c => `${c}.ilike.%${esc}%`);
  const jsonFilters = SEARCH_JSON_KEYS.map(k => `profile_json->>${k}.ilike.%${esc}%`);

  // 可見性過濾：只有「明確被關閉」才排除，欄位是 NULL 的舊資料一律視為可見，
  // 與 supabase/functions/vcard 的判定一致（那裡也是只看 === false / === true）。
  //   directory_visible = false → 使用者自己在設定頁關閉了通訊錄公開
  //   admin_disabled    = true  → 管理員人工停用（RLS 沒涵蓋這個欄位，必須在查詢層擋）
  //   is_visible        = false → 訂閱到期／停用（RLS 已擋其他人，這裡一併擋自己的，
  //                               避免自己的通訊錄列出一張其他人看不到的名片）
  function buildQuery(opts) {
    let query = client
      .from('cards')
      // 盡量只取通訊錄顯示需要的欄位；完整預覽再用 getCardByUserId
      .select('user_id,name,company,title,theme,updated_at')
      .not('admin_disabled', 'is', true)
      .not('is_visible', 'is', false);

    // directory_visible 是後來才加的欄位。若資料庫還沒套用 migration，
    // 帶著它查詢會直接失敗，所以要能在退路中拿掉。
    if (opts.withDirectoryFlag) {
      query = query.not('directory_visible', 'is', false);
    }

    query = query.order('updated_at', { ascending: false }).limit(limit);

    if (esc) {
      const filters = opts.withJsonSearch ? columnFilters.concat(jsonFilters) : columnFilters;
      query = query.or(filters.join(','));
    }
    return query;
  }

  // 三層漸退：越後面的退路功能越少，但至少讓通訊錄可以用。
  // 順序刻意把「隱私過濾」放到最後才放棄——寧可少搜幾個欄位，
  // 也不要先把使用者選擇不公開的名片洩漏出去。
  const attempts = [
    { withJsonSearch: true,  withDirectoryFlag: true  },
    { withJsonSearch: false, withDirectoryFlag: true  },
    { withJsonSearch: false, withDirectoryFlag: false }
  ];

  let lastError = null;
  for (const opts of attempts) {
    const { data, error } = await buildQuery(opts);
    if (!error) return { rows: data || [] };
    lastError = error;
  }
  throw lastError;
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

// 低階：直接指定完整 path 上傳（給管理員模組共用，例如代替其他使用者上傳大頭貼/Logo；一般畫面請用 uploadMyAsset）
export async function uploadRawAsset(ctx, path, blob, opts) {
  const client = ctx.client;
  const bucket = (opts && opts.bucket) ? String(opts.bucket) : 'card-assets';
  const contentType = (opts && opts.contentType) ? String(opts.contentType) : 'image/webp';

  const { error } = await client.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType });
  if (error) throw error;
  return { bucket, path, provider: 'supabase' };
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

/* =========================================================================
 * 通訊錄公開設定（使用者自選）
 * ========================================================================= */

// 讀取目前設定。欄位不存在或為 NULL 時一律回 true（預設公開），
// 避免資料庫還沒套用 migration 時設定頁顯示成「不公開」而誤導使用者。
export async function getMyDirectoryVisible() {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const { data, error } = await ctx.client
    .from('cards')
    .select('directory_visible')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) throw error;
  return { directoryVisible: data?.directory_visible !== false, hasCard: Boolean(data) };
}

// 寫入設定。只動 directory_visible 一個欄位，
// 不碰 is_visible（系統／訂閱）與 admin_disabled（管理員）。
export async function setMyDirectoryVisible(visible) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const next = visible !== false;
  const { error } = await ctx.client
    .from('cards')
    .update({ directory_visible: next })
    .eq('user_id', ctx.userId);
  if (error) throw error;
  return { directoryVisible: next };
}
