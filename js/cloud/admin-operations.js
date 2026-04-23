import { getAuthContext } from './session.js';
import { isAdmin } from './admin-roles.js';


// 後台批次查詢：名片開啟次數與最後一次時間（card_views 聚合，含本人開啟）
export async function getCardViewSummariesForAdmin(userIds) {
  const empty = new Map();
  const ctx = await getAuthContext();
  if (!ctx.ok) return empty;

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) return empty;

  const ids = [
    ...new Set(
      (userIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  ];
  if (!ids.length) return empty;

  const { data, error } = await ctx.client.rpc('get_card_view_summaries_for_admin', {
    p_user_ids: ids
  });

  if (error) {
    console.error('[Admin] get_card_view_summaries_for_admin:', error.message || error);
    return empty;
  }

  const map = new Map();
  for (const row of data || []) {
    const uid = row.user_id;
    if (!uid) continue;
    map.set(String(uid), {
      openCount: Number(row.open_count || 0),
      lastOpenedAt: row.last_opened_at || null
    });
  }
  return map;
}

// 管理員取得所有名片（給 admin.html 用）
export async function getAllCardsAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { rows: [] };
  const client = ctx.client;
  
  // 檢查管理員權限與公司過濾
  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) return { rows: [] };

  let query = client
    .from('cards')
    .select('*')
    .order('updated_at', { ascending: false });

  // 企業管理員：只篩選該公司的名片 (ILike)
  if (adminStatus.managedCompany) {
    // 簡單的文字比對 (case-insensitive)
    query = query.ilike('company', `%${adminStatus.managedCompany}%`);
  }
    
  const { data, error } = await query;
    
  if (error) {
    console.error('List cards failed:', error);
    return { rows: [] };
  }
  return { rows: data || [] };
}

// 管理員刪除名片
export async function deleteCard(targetUserId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  // 企業管理員：再次確認刪除對象是否屬於該公司 (雙重保險)
  // 雖然前端 UI 會過濾，但後端操作前最好再檢查一次
  if (adminStatus.managedCompany) {
    const { data: targetCard } = await client
      .from('cards')
      .select('company')
      .eq('user_id', targetUserId)
      .maybeSingle();
    
    const targetCompany = targetCard?.company || '';
    // 簡單比對：若名片公司名稱不包含管理員管理的公司名稱，則拒絕
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const { error } = await client
    .from('cards')
    .delete()
    .eq('user_id', targetUserId);
  
  if (error) throw error;
  return true;
}

// 取得管理員列表 (Super Admin Only)
export async function getAdminUsers() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { rows: [] };
  const client = ctx.client;

  // 權限檢查：只有 Super Admin 能讀取完整列表 (RLS 應該要允許讀取，但 UI 層面我們只給 Super Admin 看)
  const me = await isAdmin();
  if (!me || !me.isAdmin || me.managedCompany) {
    // 非 Super Admin，回傳空或只回傳自己
    return { rows: [] };
  }

  // 只取必要欄位，避免依賴 created_at / note 等不存在欄位
  const { data, error } = await client
    .from('admin_users')
    .select('user_id,target_company');
  if (error) return { rows: [] };
  return { rows: data || [] };
}

// 新增/更新管理員 (Super Admin Only)
// 注意：admin_users 常見只有 user_id/managed_company，且我們的 RLS 未必允許 UPDATE，
// 因此這裡用「先刪除再插入」確保可用。
export async function upsertAdminUser(targetUserId, managedCompany) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const me = await isAdmin();
  if (!me || !me.isAdmin || me.managedCompany) throw new Error('NOT_SUPER_ADMIN');

  const uid = String(targetUserId || '').trim();
  if (!uid) throw new Error('MISSING_USER_ID');

  // 先刪除（若不存在也沒關係）
  await client.from('admin_users').delete().eq('user_id', uid);

  const { error } = await client
    .from('admin_users')
    .insert({
      user_id: uid,
      target_company: (String(managedCompany || '').trim() || null)
    });

  if (error) throw error;
  return true;
}

// 刪除管理員 (Super Admin Only)
export async function deleteAdminUser(targetUserId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const me = await isAdmin();
  if (!me || !me.isAdmin || me.managedCompany) throw new Error('NOT_SUPER_ADMIN');

  const { error } = await client
    .from('admin_users')
    .delete()
    .eq('user_id', targetUserId);
  
  if (error) throw error;
  return true;
}

// 管理員更新名片（給 edit.html 的 adminMode 用）
export async function adminUpdateCard(targetUserId, payload) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  const uid = String(targetUserId || '').trim();
  if (!uid) throw new Error('MISSING_TARGET_USER_ID');

  // 讀取目標名片公司以做公司權限比對
  const { data: targetCard, error: qErr } = await client
    .from('cards')
    .select('user_id,company')
    .eq('user_id', uid)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!targetCard) throw new Error('CARD_NOT_FOUND');

  if (adminStatus.managedCompany) {
    const targetCompany = String(targetCard.company || '');
    if (!targetCompany.toLowerCase().includes(String(adminStatus.managedCompany).toLowerCase())) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const updateData = {
    name: payload?.name || '',
    phone: payload?.phone || '',
    email: payload?.email || '',
    company: payload?.company || '',
    title: payload?.title || '',
    theme: Number(payload?.theme || 1),
    profile_json: payload?.profile_json || {},
    updated_at: new Date().toISOString()
  };

  const { error } = await client
    .from('cards')
    .update(updateData)
    .eq('user_id', uid);

  if (error) throw error;
  return true;
}
