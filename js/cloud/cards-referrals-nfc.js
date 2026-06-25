import { getAuthContext } from './session.js';
import { getClient, getPublicClient, hasConfig } from './clients.js';
import { SUPABASE_URL } from './constants.js';
import { isAdmin } from './admin-roles.js';


export async function getMyCard() {
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

export async function getCardByUserId(userId) {
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
export async function getCardPublic(userId, options = {}) {
  if (!hasConfig()) return { card: null };
  // 使用快取的公開客戶端
  const client = getPublicClient();
  if (!client) return { card: null };
  const { data, error } = await client
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { card: null, error };
  
  // 若啟用瀏覽追蹤：每次開啟名片都寫入一筆（含本人預覽，後台「最後開啟／次數」與之一致）
  if (options.trackView && data) {
    recordCardView(userId).catch(() => {}); // 異步記錄，不影響頁面載入
  }
  
  return { card: data || null };
}

// 記錄名片瀏覽（瀏覽統計功能）
export async function recordCardView(userId) {
  if (!hasConfig() || !userId) return { success: false };
  
  try {
    const client = getPublicClient();
    if (!client) return { success: false };
    
    // 記錄瀏覽（匿名也可 insert，依 RLS）；viewed_at 交由資料庫預設
    const uid = String(userId).trim();
    if (!uid) return { success: false };

    const row = { card_user_id: uid };
    const ref = (typeof document !== 'undefined' && document.referrer) ? String(document.referrer).trim() : '';
    if (ref) row.referrer = ref.slice(0, 4096);
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? String(navigator.userAgent).trim() : '';
    if (ua) row.user_agent = ua.slice(0, 4096);

    const { error: viewError } = await client.from('card_views').insert(row);

    if (viewError) {
      console.log('[Views] card_views 寫入略過:', viewError.message || viewError);
      return { success: false, error: viewError };
    }

    return { success: true };
  } catch (e) {
    console.error('[Views] 記錄瀏覽失敗:', e);
    return { success: false, error: e };
  }
}

// 取得名片瀏覽統計
export async function getCardViewStats(userId) {
  const empty = { count: 0, views: [], lastViewedAt: null };
  if (!hasConfig() || !userId) return empty;

  const ctx = await getAuthContext();
  if (!ctx.ok) return empty;

  try {
    const client = ctx.client;

    // 取得瀏覽總數
    const { count, error: countError } = await client
      .from('card_views')
      .select('*', { count: 'exact', head: true })
      .eq('card_user_id', userId);

    if (countError) {
      console.log('[Views] 無法取得瀏覽統計:', countError.message);
      return empty;
    }

    // 取得最近 30 天的瀏覽記錄（按日期分組）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentViews, error: viewsError } = await client
      .from('card_views')
      .select('viewed_at')
      .eq('card_user_id', userId)
      .gte('viewed_at', thirtyDaysAgo.toISOString())
      .order('viewed_at', { ascending: false });

    // 取得全期間最後一次被瀏覽時間（供後台或報表使用）
    const { data: lastRow, error: lastErr } = await client
      .from('card_views')
      .select('viewed_at')
      .eq('card_user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) {
      console.log('[Views] 無法取得最後瀏覽時間:', lastErr.message);
    }

    return {
      count: count || 0,
      views: recentViews || [],
      lastViewedAt: (lastRow && lastRow.viewed_at) ? lastRow.viewed_at : null,
      error: viewsError
    };
  } catch (e) {
    console.error('[Views] 取得統計失敗:', e);
    return { count: 0, views: [], lastViewedAt: null, error: e };
  }
}

/* =========================================================================
 * 9.5 推薦系統 (Referral System)
 * ========================================================================= */

// 記錄推薦關係
export async function recordReferral(referrerId) {
  const ctx = await getAuthContext();
  if (!ctx.ok || !referrerId) return { success: false };
  
  const referredId = ctx.userId;
  if (referrerId === referredId) return { success: false, error: '不能推薦自己' };
  
  try {
    const { error } = await ctx.client
      .from('referrals')
      .insert({
        referrer_user_id: referrerId,
        referred_user_id: referredId
      });
    
    if (error) {
      // 可能已存在（每個用戶只能被推薦一次）
      console.log('[Referral] 記錄推薦失敗:', error.message);
      return { success: false, error };
    }
    
    console.log('[Referral] 推薦記錄成功');
    return { success: true };
  } catch (e) {
    console.error('[Referral] 錯誤:', e);
    return { success: false, error: e };
  }
}

// 取得我推薦的人數
export async function getMyReferralCount() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { count: 0 };
  
  try {
    const { count, error } = await ctx.client
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_user_id', ctx.userId);
    
    if (error) {
      console.log('[Referral] 取得推薦數失敗:', error.message);
      return { count: 0 };
    }
    
    return { count: count || 0 };
  } catch (e) {
    return { count: 0, error: e };
  }
}

// 取得我推薦的用戶列表
export async function getMyReferrals() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { referrals: [] };
  
  try {
    const { data, error } = await ctx.client
      .from('referrals')
      .select('referred_user_id, created_at')
      .eq('referrer_user_id', ctx.userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      return { referrals: [], error };
    }
    
    return { referrals: data || [] };
  } catch (e) {
    return { referrals: [], error: e };
  }
}

// 生成邀請連結
export function generateInviteLink(userId) {
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  return `${baseUrl}auth.html?ref=${encodeURIComponent(userId)}&next=edit.html`;
}

/* =========================================================================
 * 9.6 NFC 卡片功能 (NFC Card Functions)
 * ========================================================================= */

// 根據 NFC 卡片 ID 取得名片
export async function getCardByNfcId(nfcCardId) {
  if (!hasConfig() || !nfcCardId) return { card: null };
  
  const client = getPublicClient();
  if (!client) return { card: null };
  const { data, error } = await client
    .from('cards')
    .select('*')
    .eq('nfc_card_id', nfcCardId)
    .maybeSingle();
  
  if (error) return { card: null, error };
  return { card: data || null };
}

// 產生公開 vCard 下載網址；由手機系統接手新增聯絡人流程。
export function getVCardUrl(options = {}) {
  const userId = String(options.userId || options.id || '').trim();
  const nfcCardId = String(options.nfcCardId || options.nfc || '').trim();
  if (!SUPABASE_URL || (!userId && !nfcCardId)) return '';

  const url = new URL(SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/vcard');
  if (userId) {
    url.searchParams.set('id', userId);
  } else {
    url.searchParams.set('nfc', nfcCardId);
  }
  return url.toString();
}

// 管理員設定用戶的 NFC 卡片 ID
export async function setNfcCardId(userId, nfcCardId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'Not authenticated' };
  
  // 檢查是否為管理員
  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) {
    return { success: false, error: 'Not admin' };
  }
  
  try {
    const { error } = await ctx.client
      .from('cards')
      .update({ nfc_card_id: nfcCardId || null })
      .eq('user_id', userId);
    
    if (error) {
      console.error('[NFC] 設定卡片 ID 失敗:', error);
      return { success: false, error };
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}
