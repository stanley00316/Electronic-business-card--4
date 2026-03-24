import { getAuthContext } from './session.js';
import { getClient, getPublicClient, hasConfig } from './clients.js';
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
  
  // 如果啟用瀏覽追蹤，記錄此次瀏覽
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
    
    // 嘗試使用 card_views 表（如果存在）
    const { error: viewError } = await client
      .from('card_views')
      .insert({
        card_user_id: userId,
        viewed_at: new Date().toISOString(),
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null
      });
    
    if (viewError) {
      // 如果 card_views 表不存在，使用 RPC 來增加 view_count
      // 這需要在 Supabase 設置一個 increment_view_count 函數
      console.log('[Views] card_views 表未設置，跳過瀏覽記錄');
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
  if (!hasConfig() || !userId) return { count: 0, views: [] };
  
  const ctx = await getAuthContext();
  if (!ctx.ok) return { count: 0, views: [] };
  
  try {
    const client = ctx.client;
    
    // 取得瀏覽總數
    const { count, error: countError } = await client
      .from('card_views')
      .select('*', { count: 'exact', head: true })
      .eq('card_user_id', userId);
    
    if (countError) {
      console.log('[Views] 無法取得瀏覽統計:', countError.message);
      return { count: 0, views: [] };
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
    
    return {
      count: count || 0,
      views: recentViews || [],
      error: viewsError
    };
  } catch (e) {
    console.error('[Views] 取得統計失敗:', e);
    return { count: 0, views: [], error: e };
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
