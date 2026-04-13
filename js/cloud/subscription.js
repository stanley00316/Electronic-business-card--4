import { getAuthContext } from './session.js';
import { isAdmin } from './admin-roles.js';
import { recordReferral, getMyReferralCount } from './cards-referrals-nfc.js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_ANON_JWT
} from './constants.js';
import { fetchWithTimeout } from './http.js';


export async function getMySubscription() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { subscription: null, error: 'NO_SESSION' };
  
  try {
    const { data, error } = await ctx.client
      .from('subscriptions')
      .select('*')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    
    if (error) {
      console.error('[Subscription] 取得訂閱失敗:', error);
      return { subscription: null, error };
    }
    
    // 如果沒有訂閱記錄，建立一個（新用戶試用）
    if (!data) {
      return await createMySubscription();
    }
    
    // 計算剩餘天數
    const subscription = data;
    const endDate = await getSubscriptionEndDate(ctx.userId);
    const now = new Date();
    const daysLeft = endDate ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24))) : 0;
    const isActive = daysLeft > 0;
    
    return { 
      subscription: {
        ...subscription,
        endDate,
        daysLeft,
        isActive
      }, 
      error: null 
    };
  } catch (e) {
    return { subscription: null, error: e };
  }
}

// 建立新用戶訂閱（自動獲得 30 天試用）
export async function createMySubscription(referrerId = null) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { subscription: null, error: 'NO_SESSION' };
  
  try {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    
    const { data, error } = await ctx.client
      .from('subscriptions')
      .insert({
        user_id: ctx.userId,
        status: 'trial',
        trial_start_at: new Date().toISOString(),
        trial_end_at: trialEnd.toISOString()
      })
      .select()
      .single();
    
    if (error) {
      // 可能已存在，嘗試取得
      if (error.code === '23505') {
        return await getMySubscription();
      }
      return { subscription: null, error };
    }
    
    // 如果有推薦人，記錄推薦關係
    if (referrerId && referrerId !== ctx.userId) {
      await recordReferral(referrerId);
    }
    
    return { 
      subscription: {
        ...data,
        endDate: trialEnd.toISOString(),
        daysLeft: 30,
        isActive: true
      }, 
      error: null 
    };
  } catch (e) {
    return { subscription: null, error: e };
  }
}

// 取得用戶訂閱結束日期
export async function getSubscriptionEndDate(userId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return null;
  
  try {
    const { data, error } = await ctx.client
      .from('subscriptions')
      .select('trial_start_at, trial_end_at, subscription_start_at, subscription_end_at, referral_bonus_days')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (error || !data) return null;
    
    let endDate;
    if (data.subscription_end_at) {
      endDate = new Date(data.subscription_end_at);
    } else if (data.trial_end_at) {
      endDate = new Date(data.trial_end_at);
    } else {
      const trialStart = new Date(data.trial_start_at || Date.now());
      endDate = new Date(trialStart);
      endDate.setDate(endDate.getDate() + 30);
    }
    
    // 加上推薦獎勵天數
    if (data.referral_bonus_days > 0) {
      endDate.setDate(endDate.getDate() + data.referral_bonus_days);
    }
    
    return endDate.toISOString();
  } catch (e) {
    return null;
  }
}

// 檢查訂閱是否有效
export async function isSubscriptionActive(userId) {
  const endDate = await getSubscriptionEndDate(userId);
  if (!endDate) return false;
  return new Date(endDate) > new Date();
}

// 取得所有訂閱（管理員用）- 顯示所有 cards 用戶
export async function getAllSubscriptionsAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { rows: [] };
  
  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) return { rows: [] };
  
  try {
    // 從 cards 表查詢，LEFT JOIN subscriptions 以顯示所有用戶
    let query = ctx.client
      .from('cards')
      .select('user_id, name, company, email, updated_at')
      .order('updated_at', { ascending: false });
    
    // 企業管理員：只篩選該公司的名片
    if (adminStatus.managedCompany) {
      query = query.ilike('company', `%${adminStatus.managedCompany}%`);
    }
    
    const { data: cardsData, error: cardsError } = await query;
    
    if (cardsError) {
      console.error('[Subscription] 取得名片列表失敗:', cardsError);
      return { rows: [] };
    }
    
    // 取得所有訂閱記錄
    const { data: subsData, error: subsError } = await ctx.client
      .from('subscriptions')
      .select('*');
    
    if (subsError) {
      console.error('[Subscription] 取得訂閱列表失敗:', subsError);
    }
    
    // 建立訂閱查詢 map
    const subsMap = {};
    (subsData || []).forEach(sub => {
      subsMap[sub.user_id] = sub;
    });
    
    // 合併資料，計算每個用戶的剩餘天數
    const rows = (cardsData || []).map(card => {
      const sub = subsMap[card.user_id];
      
      let endDate;
      let status = 'none';  // 沒有訂閱記錄
      
      if (sub) {
        status = sub.status || 'trial';
        if (sub.subscription_end_at) {
          endDate = new Date(sub.subscription_end_at);
        } else if (sub.trial_end_at) {
          endDate = new Date(sub.trial_end_at);
        } else {
          const trialStart = new Date(sub.trial_start_at || Date.now());
          endDate = new Date(trialStart);
          endDate.setDate(endDate.getDate() + 30);
        }
        
        if (sub.referral_bonus_days > 0) {
          endDate.setDate(endDate.getDate() + sub.referral_bonus_days);
        }
      } else {
        // 沒有訂閱記錄，顯示為未啟用
        endDate = new Date();
      }
      
      const now = new Date();
      const daysLeft = sub ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))) : 0;
      
      return {
        user_id: card.user_id,
        status: status,
        trial_start_at: sub?.trial_start_at || null,
        trial_end_at: sub?.trial_end_at || null,
        subscription_start_at: sub?.subscription_start_at || null,
        subscription_end_at: sub?.subscription_end_at || null,
        referral_bonus_days: sub?.referral_bonus_days || 0,
        endDate: endDate.toISOString(),
        daysLeft,
        isActive: daysLeft > 0,
        userName: card.name || '-',
        userCompany: card.company || '-',
        userEmail: card.email || '-'
      };
    });
    
    return { rows };
  } catch (e) {
    console.error('[Subscription] getAllSubscriptionsAdmin 錯誤:', e);
    return { rows: [] };
  }
}

// 管理員延長訂閱
export async function extendSubscription(targetUserId, days, reason) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  
  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');
  
  // 企業管理員：檢查目標用戶是否屬於該公司
  if (adminStatus.managedCompany) {
    const { data: targetCard } = await ctx.client
      .from('cards')
      .select('company')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    const targetCompany = targetCard?.company || '';
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }
  
  try {
    // 取得目前訂閱
    const { data: sub } = await ctx.client
      .from('subscriptions')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    // 計算目前結束日期
    let currentEnd;
    if (sub) {
      if (sub.subscription_end_at) {
        currentEnd = new Date(sub.subscription_end_at);
      } else if (sub.trial_end_at) {
        currentEnd = new Date(sub.trial_end_at);
      } else {
        currentEnd = new Date();
      }
      
      if (sub.referral_bonus_days > 0) {
        currentEnd.setDate(currentEnd.getDate() + sub.referral_bonus_days);
      }
    } else {
      currentEnd = new Date();
    }
    
    // 如果已過期，從現在開始計算
    if (currentEnd < new Date()) {
      currentEnd = new Date();
    }
    
    // 計算新結束日期
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + days);
    
    if (sub) {
      // 更新現有訂閱
      const { error } = await ctx.client
        .from('subscriptions')
        .update({
          status: 'active',
          subscription_start_at: sub.subscription_start_at || new Date().toISOString(),
          subscription_end_at: newEnd.toISOString(),
          extended_by: ctx.userId,
          extend_reason: reason,
          extended_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId);
      
      if (error) throw error;
    } else {
      // 建立新訂閱
      const { error } = await ctx.client
        .from('subscriptions')
        .insert({
          user_id: targetUserId,
          status: 'active',
          subscription_start_at: new Date().toISOString(),
          subscription_end_at: newEnd.toISOString(),
          extended_by: ctx.userId,
          extend_reason: reason,
          extended_at: new Date().toISOString()
        });
      
      if (error) throw error;
    }
    
    // 確保名片可見
    await ctx.client
      .from('cards')
      .update({ is_visible: true })
      .eq('user_id', targetUserId);
    
    return { success: true, newEndDate: newEnd.toISOString() };
  } catch (e) {
    console.error('[Subscription] 延長訂閱失敗:', e);
    throw e;
  }
}

// 管理員減少訂閱天數
export async function reduceSubscription(targetUserId, days, reason) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) {
    return { success: false, error: 'NOT_ADMIN' };
  }

  const reduceDays = Number.parseInt(days, 10);
  if (!Number.isInteger(reduceDays) || reduceDays < 1) {
    return { success: false, error: 'INVALID_DAYS' };
  }

  const safeReason = String(reason || '管理員手動減少訂閱').trim().slice(0, 120);

  // 企業管理員只能操作自己公司的人
  if (adminStatus.managedCompany) {
    const { data: targetCard } = await ctx.client
      .from('cards')
      .select('company')
      .eq('user_id', targetUserId)
      .maybeSingle();

    const targetCompany = targetCard?.company || '';
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      return { success: false, error: 'PERMISSION_DENIED_COMPANY_MISMATCH' };
    }
  }

  try {
    const { data: sub } = await ctx.client
      .from('subscriptions')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!sub) {
      return { success: false, error: 'SUBSCRIPTION_NOT_FOUND' };
    }

    // 先算出目前到期日，再往前扣天數
    let currentEnd;
    if (sub.subscription_end_at) {
      currentEnd = new Date(sub.subscription_end_at);
    } else if (sub.trial_end_at) {
      currentEnd = new Date(sub.trial_end_at);
    } else {
      currentEnd = new Date();
    }

    if (sub.referral_bonus_days > 0) {
      currentEnd.setDate(currentEnd.getDate() + sub.referral_bonus_days);
    }

    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() - reduceDays);

    const isExpiredAfterReduce = newEnd <= new Date();

    // 扣到到期或過期時，自動停用並隱藏名片
    const updatePayload = {
      status: isExpiredAfterReduce ? 'cancelled' : 'active',
      subscription_end_at: newEnd.toISOString(),
      extend_reason: safeReason,
      extended_by: ctx.userId,
      extended_at: new Date().toISOString()
    };

    const { error: subError } = await ctx.client
      .from('subscriptions')
      .update(updatePayload)
      .eq('user_id', targetUserId);

    if (subError) throw subError;

    const { error: cardError } = await ctx.client
      .from('cards')
      .update({ is_visible: !isExpiredAfterReduce })
      .eq('user_id', targetUserId);

    if (cardError) {
      console.error('[Subscription] 更新名片可見性失敗:', cardError);
    }

    return {
      success: true,
      newEndDate: newEnd.toISOString(),
      autoCancelled: isExpiredAfterReduce
    };
  } catch (e) {
    console.error('[Subscription] 減少訂閱失敗:', e);
    return { success: false, error: e.message || String(e) };
  }
}

// 停用訂閱（管理員用）
export async function deactivateSubscription(targetUserId, reason) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) {
    return { success: false, error: 'NOT_ADMIN' };
  }
  
  // 企業管理員：檢查目標用戶是否屬於該公司
  if (adminStatus.managedCompany) {
    const { data: targetCard } = await ctx.client
      .from('cards')
      .select('company')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    const targetCompany = targetCard?.company || '';
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      return { success: false, error: 'PERMISSION_DENIED_COMPANY_MISMATCH' };
    }
  }
  
  try {
    // 更新訂閱狀態為 cancelled
    const { data: sub } = await ctx.client
      .from('subscriptions')
      .select('id')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    if (sub) {
      // 更新現有訂閱
      const { error: subError } = await ctx.client
        .from('subscriptions')
        .update({
          status: 'cancelled',
          extend_reason: reason || '管理員手動停用',
          extended_by: ctx.userId,
          extended_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId);
      
      if (subError) throw subError;
    } else {
      // 建立 cancelled 狀態的訂閱記錄
      const { error: insertError } = await ctx.client
        .from('subscriptions')
        .insert({
          user_id: targetUserId,
          status: 'cancelled',
          extend_reason: reason || '管理員手動停用',
          extended_by: ctx.userId,
          extended_at: new Date().toISOString()
        });
      
      if (insertError) throw insertError;
    }
    
    // 隱藏名片
    const { error: cardError } = await ctx.client
      .from('cards')
      .update({ is_visible: false })
      .eq('user_id', targetUserId);
    
    if (cardError) {
      console.error('[Subscription] 隱藏名片失敗:', cardError);
    }
    
    return { success: true };
  } catch (e) {
    console.error('[Subscription] 停用訂閱失敗:', e);
    return { success: false, error: e.message || String(e) };
  }
}

// 重新啟用訂閱（管理員用）
export async function reactivateUserSubscription(targetUserId, days, reason) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) {
    return { success: false, error: 'NOT_ADMIN' };
  }
  
  // 企業管理員：檢查目標用戶是否屬於該公司
  if (adminStatus.managedCompany) {
    const { data: targetCard } = await ctx.client
      .from('cards')
      .select('company')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    const targetCompany = targetCard?.company || '';
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      return { success: false, error: 'PERMISSION_DENIED_COMPANY_MISMATCH' };
    }
  }
  
  const extendDays = days || 30;
  
  try {
    const newEnd = new Date();
    newEnd.setDate(newEnd.getDate() + extendDays);
    
    // 更新訂閱狀態
    const { data: sub } = await ctx.client
      .from('subscriptions')
      .select('id')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    if (sub) {
      const { error: subError } = await ctx.client
        .from('subscriptions')
        .update({
          status: 'active',
          subscription_start_at: new Date().toISOString(),
          subscription_end_at: newEnd.toISOString(),
          extend_reason: reason || '管理員重新啟用',
          extended_by: ctx.userId,
          extended_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId);
      
      if (subError) throw subError;
    } else {
      const { error: insertError } = await ctx.client
        .from('subscriptions')
        .insert({
          user_id: targetUserId,
          status: 'active',
          subscription_start_at: new Date().toISOString(),
          subscription_end_at: newEnd.toISOString(),
          extend_reason: reason || '管理員重新啟用',
          extended_by: ctx.userId,
          extended_at: new Date().toISOString()
        });
      
      if (insertError) throw insertError;
    }
    
    // 顯示名片
    const { error: cardError } = await ctx.client
      .from('cards')
      .update({ is_visible: true })
      .eq('user_id', targetUserId);
    
    if (cardError) {
      console.error('[Subscription] 顯示名片失敗:', cardError);
    }
    
    return { success: true, newEndDate: newEnd.toISOString() };
  } catch (e) {
    console.error('[Subscription] 重新啟用訂閱失敗:', e);
    return { success: false, error: e.message || String(e) };
  }
}

// 取得價格方案
export async function getPricingPlans(includeInactive = false) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { plans: [] };
  
  try {
    let query = ctx.client
      .from('pricing_plans')
      .select('*')
      .order('sort_order', { ascending: true });
    
    // 如果不是管理員，只查詢啟用的方案
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[Subscription] 取得價格方案失敗:', error);
      return { plans: [] };
    }
    
    return { plans: data || [] };
  } catch (e) {
    return { plans: [] };
  }
}

// 儲存/更新價格方案（Super Admin Only）
export async function savePricingPlan(plan) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  const me = await isAdmin();
  if (!me || !me.isAdmin || !me.canManageAdmins) {
    return { success: false, error: 'NOT_SUPER_ADMIN' };
  }
  
  try {
    const payload = {
      name: plan.name,
      name_en: plan.name_en || plan.name,
      description: plan.description || '',
      description_en: plan.description_en || plan.description || '',
      price: plan.price,
      duration_days: plan.duration_days,
      is_active: plan.active !== false
    };
    
    let result;
    if (plan.id) {
      // 更新現有方案
      result = await ctx.client
        .from('pricing_plans')
        .update(payload)
        .eq('id', plan.id);
    } else {
      // 新增方案
      result = await ctx.client
        .from('pricing_plans')
        .insert(payload);
    }
    
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

// 停用價格方案（Super Admin Only）
export async function deletePricingPlan(planId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  const me = await isAdmin();
  if (!me || !me.isAdmin || !me.canManageAdmins) {
    return { success: false, error: 'NOT_SUPER_ADMIN' };
  }
  
  try {
    // 軟刪除：設為非活躍
    const { error } = await ctx.client
      .from('pricing_plans')
      .update({ is_active: false })
      .eq('id', planId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

// 重新啟用價格方案（Super Admin Only）
export async function reactivatePricingPlan(planId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  const me = await isAdmin();
  if (!me || !me.isAdmin || !me.canManageAdmins) {
    return { success: false, error: 'NOT_SUPER_ADMIN' };
  }
  
  try {
    const { error } = await ctx.client
      .from('pricing_plans')
      .update({ is_active: true })
      .eq('id', planId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

// 更新推薦獎勵（檢查推薦人數並更新獎勵天數）
export async function updateMyReferralBonus() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false };
  
  try {
    // 取得推薦人數
    const result = await getMyReferralCount();
    const referralCount = result.count || 0;
    
    // 計算獎勵天數（每人 30 天）
    const bonusDays = referralCount * 30;
    
    // 更新訂閱記錄
    const { error } = await ctx.client
      .from('subscriptions')
      .update({
        referral_bonus_days: bonusDays,
        last_referral_check: referralCount
      })
      .eq('user_id', ctx.userId);
    
    if (error) {
      console.error('[Subscription] 更新推薦獎勵失敗:', error);
      return { success: false, error };
    }
    
    return { success: true, bonusDays, referralCount };
  } catch (e) {
    return { success: false, error: e };
  }
}

// 建立 Stripe Checkout Session
export async function createStripeCheckout(planId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  try {
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/stripe-checkout';
    
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
      },
      body: JSON.stringify({
        user_id: ctx.userId,
        plan_id: planId
      })
    }, 15000);
    
    const data = await resp.json();
    
    if (!resp.ok || !data.success) {
      return { success: false, error: data.error || 'Checkout failed' };
    }
    
    return {
      success: true,
      checkoutUrl: data.checkout_url,
      sessionId: data.session_id
    };
  } catch (e) {
    console.error('[Stripe] Checkout error:', e);
    return { success: false, error: e.message || e };
  }
}

// 建立 LINE Pay 付款
export async function createLinePayCheckout(planId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  
  try {
    const endpoint = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/linepay-checkout';
    
    const resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_JWT
      },
      body: JSON.stringify({
        user_id: ctx.userId,
        plan_id: planId
      })
    }, 15000);
    
    const data = await resp.json();
    
    if (!resp.ok || !data.success) {
      return { success: false, error: data.error || 'Checkout failed' };
    }
    
    return {
      success: true,
      paymentUrl: data.payment_url,
      transactionId: data.transaction_id
    };
  } catch (e) {
    console.error('[LINE Pay] Checkout error:', e);
    return { success: false, error: e.message || e };
  }
}
