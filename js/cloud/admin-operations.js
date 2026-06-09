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

  const me = await isAdmin();
  if (!me || !me.isAdmin) return { rows: [] };

  let query = client.from('admin_users').select('user_id,target_company');

  // 企業管理員：只能看自己公司的管理員；超級管理員：看全部
  if (me.managedCompany) {
    query = query.eq('target_company', me.managedCompany);
  }

  const { data, error } = await query;
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

// 停用員工名片（人工停用，獨立於訂閱 is_visible）
export async function disableEmployeeCard(userId, reason) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  // 企業管理員：確認員工屬於自己公司
  if (adminStatus.managedCompany) {
    const { data: targetCard } = await ctx.client
      .from('cards').select('company').eq('user_id', userId).maybeSingle();
    const targetCompany = targetCard?.company || '';
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const { error } = await ctx.client
    .from('cards')
    .update({
      admin_disabled: true,
      admin_disabled_by: ctx.userId,
      admin_disabled_at: new Date().toISOString(),
      admin_disabled_reason: String(reason || '').trim() || null
    })
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

// 重新啟用員工名片
export async function enableEmployeeCard(userId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  if (adminStatus.managedCompany) {
    const { data: targetCard } = await ctx.client
      .from('cards').select('company').eq('user_id', userId).maybeSingle();
    const targetCompany = targetCard?.company || '';
    if (!targetCompany.toLowerCase().includes(adminStatus.managedCompany.toLowerCase())) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const { error } = await ctx.client
    .from('cards')
    .update({
      admin_disabled: false,
      admin_disabled_by: null,
      admin_disabled_at: null,
      admin_disabled_reason: null
    })
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

// 更新 NFC 狀態（不動 nfc_card_id，只改 nfc_status）
// status 可為 'disabled'（停用）或 'lost'（遺失）或 'bound'（重新啟用）
export async function updateNfcStatus(userId, status) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  const allowed = ['unbound', 'bound', 'disabled', 'lost'];
  if (!allowed.includes(status)) throw new Error('INVALID_NFC_STATUS');

  const { error } = await ctx.client
    .from('cards')
    .update({ nfc_status: status })
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

// NFC 一鍵移交（離職員工 → 新員工）
export async function transferNfcCard(fromUserId, toUserId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  // 讀取來源員工的 NFC ID
  const { data: fromCard, error: readErr } = await ctx.client
    .from('cards')
    .select('nfc_card_id')
    .eq('user_id', fromUserId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (!fromCard?.nfc_card_id) throw new Error('FROM_USER_HAS_NO_NFC');

  const nfcId = fromCard.nfc_card_id;

  // 先解除來源員工的綁定
  const { error: err1 } = await ctx.client
    .from('cards')
    .update({ nfc_card_id: null, nfc_status: 'unbound' })
    .eq('user_id', fromUserId);
  if (err1) throw err1;

  // 再綁定給目標員工
  const { error: err2 } = await ctx.client
    .from('cards')
    .update({ nfc_card_id: nfcId, nfc_status: 'bound' })
    .eq('user_id', toUserId);
  if (err2) {
    // 移交失敗時回滾（把 NFC 還給原員工）
    await ctx.client
      .from('cards')
      .update({ nfc_card_id: nfcId, nfc_status: 'bound' })
      .eq('user_id', fromUserId);
    throw err2;
  }

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

/* ── 員工邀請連結 ──────────────────────────────────────────── */

// 建立邀請（超管 + 企業管理員皆可用，企業管理員的公司自動帶入）
export async function createCardInvite(data) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NOT_AUTH');
  const me = await isAdmin();
  if (!me || !me.isAdmin) throw new Error('NOT_ADMIN');

  const { data: invite, error } = await ctx.client
    .from('card_invites')
    .insert({
      created_by:     ctx.userId,
      target_company: data.company || me.managedCompany || null,
      name:           data.name   || '',
      title:          data.title  || null,
      department:     data.department || null,
      email:          data.email  || null,
      phone:          data.phone  || null,
      note:           data.note   || null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select('token')
    .single();

  if (error) throw error;
  return { token: invite.token };
}

// 領取邀請（員工登入後呼叫，自動建立名片）
export async function claimCardInvite(token) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NOT_AUTH');

  // 讀取未使用且未過期的邀請
  const { data: invite, error: readErr } = await ctx.client
    .from('card_invites')
    .select('*')
    .eq('token', token)
    .is('used_by', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (readErr) throw readErr;
  if (!invite) throw new Error('INVITE_INVALID_OR_EXPIRED');

  // 建立名片（若已有名片則略過，不覆蓋）
  const { error: insertErr } = await ctx.client
    .from('cards')
    .insert({
      user_id:       ctx.userId,
      name:          invite.name          || '',
      title:         invite.title         || '',
      company:       invite.target_company|| '',
      department:    invite.department    || '',
      email:         invite.email         || '',
      phone:         invite.phone         || '',
      profile_json:  {},
      is_visible:    true,
      nfc_status:    'unbound',
      admin_disabled: false
    });

  // 23505 = unique_violation：用戶已有名片，不報錯
  if (insertErr && insertErr.code !== '23505') throw insertErr;

  // 標記邀請為已使用
  const { error: updateErr } = await ctx.client
    .from('card_invites')
    .update({ used_by: ctx.userId, used_at: new Date().toISOString() })
    .eq('token', token);

  if (updateErr) throw updateErr;
  return { success: true };
}

// 取得邀請列表（管理員用，企業管理員只看自己公司的）
export async function getCardInvites() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { rows: [] };
  const me = await isAdmin();
  if (!me || !me.isAdmin) return { rows: [] };

  let query = ctx.client
    .from('card_invites')
    .select('token,name,title,department,target_company,email,expires_at,used_by,used_at,created_at')
    .order('created_at', { ascending: false });

  if (me.managedCompany) {
    query = query.eq('target_company', me.managedCompany);
  }

  const { data, error } = await query;
  if (error) return { rows: [] };
  return { rows: data || [] };
}
