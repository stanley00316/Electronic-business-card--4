import { getAuthContext } from './session.js';
import { isAdmin } from './admin-roles.js';
import { uploadRawAsset } from './search-storage.js';
import { getPublicClient } from './clients.js';

function cleanText(value, maxLength = 160) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function parseProfileJson(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      return {};
    }
  }
  return value && typeof value === 'object' ? value : {};
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function cardBelongsToManagedCompany(card, managedCompany) {
  if (!managedCompany) return true;
  const targetCompany = String(card?.company || '').toLowerCase();
  const myCompany = String(managedCompany || '').toLowerCase();
  return !targetCompany || targetCompany.includes(myCompany);
}

function normalizeInviteNote(note) {
  if (!note) return {};
  if (typeof note === 'object') return note;
  try {
    const parsed = JSON.parse(String(note));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_e) {
    return {};
  }
}

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
      lastOpenedAt: row.last_opened_at || null,
      nfcScanCount: Number(row.nfc_scan_count || 0),
      lastNfcScannedAt: row.last_nfc_scanned_at || null
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

// 管理員設定名片的貼紙「製作方式」：材質（PVC／金屬水晶貼）與顏色，供量產出貨統計、提供給印刷廠商用
export async function setCardStickerOption(userId, material, color) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'Not authenticated' };

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) return { success: false, error: 'Not admin' };

  try {
    const { error } = await ctx.client
      .from('cards')
      .update({ sticker_material: material || null, sticker_color: color || null })
      .eq('user_id', userId);

    if (error) {
      console.error('[Admin] 設定貼紙材質/顏色失敗:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
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
  if (!me || !me.isAdmin) throw new Error('NOT_ADMIN');

  const uid = String(targetUserId || '').trim();
  if (!uid) throw new Error('MISSING_USER_ID');

  const targetCompany = String(managedCompany || '').trim() || null;

  // 企業管理員只能新增本公司的管理員，不能新增超管（targetCompany 不得為 null）
  if (me.managedCompany) {
    if (!targetCompany || targetCompany !== me.managedCompany) {
      throw new Error('企業管理員只能新增本公司的管理員');
    }
  }

  // 先刪除（若不存在也沒關係）
  await client.from('admin_users').delete().eq('user_id', uid);

  const { error } = await client
    .from('admin_users')
    .insert({ user_id: uid, target_company: targetCompany });

  if (error) throw error;
  return true;
}

// 刪除管理員（企業管理員可刪除本公司管理員，超管可刪除任何人）
export async function deleteAdminUser(targetUserId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const me = await isAdmin();
  if (!me || !me.isAdmin) throw new Error('NOT_ADMIN');

  // 企業管理員：確認被刪除的管理員屬於本公司
  if (me.managedCompany) {
    const { data: target } = await client
      .from('admin_users')
      .select('target_company')
      .eq('user_id', targetUserId)
      .maybeSingle();
    if (!target || target.target_company !== me.managedCompany) {
      throw new Error('企業管理員只能刪除本公司的管理員');
    }
  }

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
    .select('user_id,company,profile_json,theme')
    .eq('user_id', uid)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!targetCard) throw new Error('CARD_NOT_FOUND');

  if (adminStatus.managedCompany) {
    const targetCompany = String(targetCard.company || '').toLowerCase();
    const myCompany     = String(adminStatus.managedCompany).toLowerCase();
    // 允許：目標名片公司與管理員公司相符，或目標名片公司尚未填寫（新建立的邀請名片）
    if (targetCompany && !targetCompany.includes(myCompany)) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const baseProfileJson = hasOwn(payload, 'profile_json')
    ? parseProfileJson(payload?.profile_json)
    : parseProfileJson(targetCard.profile_json);

  const updateData = {
    name:       payload?.name       || '',
    phone:      payload?.phone      || '',
    email:      payload?.email      || '',
    company:    payload?.company    || '',
    title:      payload?.title      || '',
    department: payload?.department ?? null,
    theme:      Number(payload?.theme || targetCard.theme || 1),
    profile_json: baseProfileJson,
    updated_at: new Date().toISOString()
  };

  const { error } = await client
    .from('cards')
    .update(updateData)
    .eq('user_id', uid);

  if (error) throw error;
  return true;
}

// 企業後台批次修改員工資料。這裡只改管理員指定的欄位，保留原本名片樣式、Logo、聯絡按鈕與個人內容。
export async function batchUpdateEmployeeCards(userIds, updates = {}) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  const ids = [
    ...new Set(
      (userIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  ].slice(0, 200);
  if (!ids.length) throw new Error('NO_SELECTED_EMPLOYEES');

  const { data: cards, error: readErr } = await ctx.client
    .from('cards')
    .select('user_id,company,profile_json,theme')
    .in('user_id', ids);
  if (readErr) throw readErr;

  const allowedCards = (cards || []).filter((card) => cardBelongsToManagedCompany(card, adminStatus.managedCompany));
  const allowedIds = new Set(allowedCards.map((card) => String(card.user_id)));
  const skipped = ids.length - allowedIds.size;
  const results = [];

  for (const card of allowedCards) {
    const profileJson = parseProfileJson(card.profile_json);
    const row = { updated_at: new Date().toISOString() };

    if (hasOwn(updates, 'title')) row.title = cleanText(updates.title, 100);
    if (hasOwn(updates, 'department')) row.department = cleanText(updates.department, 100) || null;
    if (hasOwn(updates, 'company')) row.company = cleanText(updates.company, 120);
    if (hasOwn(updates, 'email')) row.email = cleanText(updates.email, 180);
    if (hasOwn(updates, 'phone')) row.phone = cleanText(updates.phone, 60);

    if (updates.status === 'disabled') {
      row.admin_disabled = true;
      row.admin_disabled_by = ctx.userId;
      row.admin_disabled_at = new Date().toISOString();
      row.admin_disabled_reason = cleanText(updates.reason, 160) || '批次停用';
    }
    if (updates.status === 'active') {
      row.admin_disabled = false;
      row.admin_disabled_by = null;
      row.admin_disabled_at = null;
      row.admin_disabled_reason = null;
    }

    if (hasOwn(updates, 'phoneExtension')) {
      profileJson.phoneExtension = cleanText(updates.phoneExtension, 30);
    }
    if (hasOwn(updates, 'companyAddress')) {
      profileJson.companyAddressZh = cleanText(updates.companyAddress, 220);
      profileJson.companyAddressEn = profileJson.companyAddressEn || '';
    }

    if (hasOwn(updates, 'phoneExtension') || hasOwn(updates, 'companyAddress')) {
      row.profile_json = profileJson;
    }

    const { error } = await ctx.client
      .from('cards')
      .update(row)
      .eq('user_id', card.user_id);

    results.push({
      userId: card.user_id,
      success: !error,
      error: error ? (error.message || String(error)) : ''
    });
  }

  return {
    success: results.every((r) => r.success),
    updated: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    skipped,
    results
  };
}

// 管理員代替其他使用者上傳大頭貼／Logo（給 edit.html 的 adminMode 用）
// 權限範圍跟 adminUpdateCard 完全一致：超級管理員不限公司，企業管理員只能傳自己公司員工的圖片。
// 這裡的前端檢查是第一層保護，真正的防線是 Supabase Storage 的 card_assets_*_admin RLS policy（見 admin-upload-storage-rls.sql）。
export async function adminUploadAsset(targetUserId, kind, blob, opts) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  const uid = String(targetUserId || '').trim();
  if (!uid) throw new Error('MISSING_TARGET_USER_ID');
  if (!blob) throw new Error('NO_FILE');

  // 讀取目標名片公司以做公司權限比對
  const { data: targetCard, error: qErr } = await client
    .from('cards')
    .select('user_id,company')
    .eq('user_id', uid)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!targetCard) throw new Error('CARD_NOT_FOUND');

  if (adminStatus.managedCompany) {
    const targetCompany = String(targetCard.company || '').toLowerCase();
    const myCompany     = String(adminStatus.managedCompany).toLowerCase();
    if (targetCompany && !targetCompany.includes(myCompany)) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const bucket = (opts && opts.bucket) ? String(opts.bucket) : 'card-assets';
  const ext = (opts && opts.ext) ? String(opts.ext).replace(/^\./, '') : 'webp';
  const contentType = (opts && opts.contentType) ? String(opts.contentType) : 'image/webp';
  const path = `${uid}/${kind}.${ext}`;

  return await uploadRawAsset(ctx, path, blob, { bucket, contentType });
}

// 設定／清除某張名片的「列印用向量 LOGO」路徑（profile_json.logoVectorPath）。
// 只動這一個欄位，不動 profile_json 其他內容，也不動 name/phone/email 等欄位，
// 避免批次操作時不小心覆蓋掉員工自己填的其他資料。
export async function adminSetLogoVectorPath(targetUserId, vectorPath) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');
  const client = ctx.client;

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) throw new Error('NOT_ADMIN');

  const uid = String(targetUserId || '').trim();
  if (!uid) throw new Error('MISSING_TARGET_USER_ID');

  const { data: targetCard, error: qErr } = await client
    .from('cards')
    .select('user_id,company,profile_json')
    .eq('user_id', uid)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!targetCard) throw new Error('CARD_NOT_FOUND');

  if (adminStatus.managedCompany) {
    const targetCompany = String(targetCard.company || '').toLowerCase();
    const myCompany = String(adminStatus.managedCompany).toLowerCase();
    if (targetCompany && !targetCompany.includes(myCompany)) {
      throw new Error('PERMISSION_DENIED_COMPANY_MISMATCH');
    }
  }

  const pj = parseProfileJson(targetCard.profile_json);
  if (vectorPath) {
    pj.logoVectorPath = String(vectorPath);
  } else {
    delete pj.logoVectorPath;
  }

  const { error } = await client
    .from('cards')
    .update({ profile_json: pj })
    .eq('user_id', uid);
  if (error) throw error;

  return { success: true, logoVectorPath: pj.logoVectorPath || '' };
}

// 把「+新增好友」手動存的私人聯絡人（directory_contacts）轉成正式會員名片：
// 建立一張真正的 cards 資料列（有自己的 card.html?id=... 網址、可綁 NFC、會出現在
// 「NFC 名片量產管理」列表），轉換完成後刪掉原本的私人聯絡人資料（避免重複列出兩筆）。
// 只能轉換「自己」新增的聯絡人（directory_contacts 的 RLS 本來就只讓你讀到自己的資料）。
export async function promoteContactToCard(contactId) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { success: false, error: 'NO_SESSION' };
  const client = ctx.client;

  const adminStatus = await isAdmin();
  if (!adminStatus || !adminStatus.isAdmin) return { success: false, error: 'NOT_ADMIN' };

  const id = String(contactId || '').trim();
  if (!id) return { success: false, error: 'MISSING_CONTACT_ID' };

  const { data: contact, error: cErr } = await client
    .from('directory_contacts')
    .select('id, contact_json')
    .eq('id', id)
    .eq('owner_user_id', ctx.userId)
    .maybeSingle();
  if (cErr) return { success: false, error: cErr };
  if (!contact) return { success: false, error: 'CONTACT_NOT_FOUND' };

  const cj = (contact.contact_json && typeof contact.contact_json === 'object') ? contact.contact_json : {};
  const name = cleanText(cj.name, 80);
  const phone = cleanText(cj.phone, 60);
  const email = cleanText(cj.email, 160);
  const company = cleanText(cj.company, 100);
  const title = cleanText(cj.position, 80);

  if (!name) return { success: false, error: 'NAME_REQUIRED' };

  // 查重：電話或 Email 已經是會員了，就不重複建立，直接連回既有名片並清掉這筆私人聯絡人。
  if (phone || email) {
    const filters = [];
    if (phone) filters.push(`phone.eq.${phone}`);
    if (email) filters.push(`email.eq.${email}`);
    const { data: existing } = await client
      .from('cards')
      .select('user_id')
      .or(filters.join(','))
      .limit(1)
      .maybeSingle();
    if (existing && existing.user_id) {
      await client.from('directory_contacts').delete().eq('id', id).eq('owner_user_id', ctx.userId);
      return { success: true, duplicate: true, user_id: existing.user_id };
    }
  }

  if (adminStatus.managedCompany) {
    const targetCompany = company.toLowerCase();
    const myCompany = String(adminStatus.managedCompany).toLowerCase();
    if (!targetCompany || !targetCompany.includes(myCompany)) {
      return { success: false, error: 'PERMISSION_DENIED_COMPANY_MISMATCH' };
    }
  }

  const newUserId = crypto.randomUUID();
  const { error: insErr } = await client.from('cards').insert({
    user_id: newUserId,
    name,
    phone,
    email,
    company,
    title,
    theme: 1,
    profile_json: {
      nameZh: name,
      titleZh: title,
      companyZh: company,
      contactLayout: 'list',
      guestSource: 'admin-promoted-contact',
      promotedFromContactId: id,
      promotedAt: new Date().toISOString()
    },
    is_visible: true,
    nfc_status: 'unbound',
    admin_disabled: false
  });
  if (insErr) return { success: false, error: insErr };

  await client.from('directory_contacts').delete().eq('id', id).eq('owner_user_id', ctx.userId);

  return { success: true, user_id: newUserId };
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

// 免登入邀請頁用：只用 token 讀取未過期、未使用的邀請，方便幫 3C 小白預填欄位。
export async function getCardInvitePublic(token) {
  const uid = String(token || '').trim();
  if (!uid) return { invite: null };

  const client = getPublicClient();
  if (!client) return { invite: null };

  const { data, error } = await client
    .from('card_invites')
    .select('token,name,title,department,target_company,email,phone,note,expires_at,used_at')
    .eq('token', uid)
    .maybeSingle();

  if (error || !data) return { invite: null, error };

  const note = normalizeInviteNote(data.note);
  return {
    invite: {
      token: data.token,
      name: data.name || '',
      title: data.title || '',
      department: data.department || '',
      company: data.target_company || '',
      email: data.email || '',
      phone: data.phone || '',
      line_url: note.line_url || note.lineUrl || '',
      phone_extension: note.phone_extension || note.phoneExtension || '',
      company_address: note.company_address || note.companyAddress || '',
      expires_at: data.expires_at || '',
      used_at: data.used_at || null
    }
  };
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

/* ── 公司設定（鎖定欄位）──────────────────────────────────── */

// 儲存公司設定（需管理員身份）
export async function saveCompanySettings(settings) {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NOT_AUTH');
  const me = await isAdmin();
  if (!me || !me.isAdmin) throw new Error('NOT_ADMIN');

  const company = settings.company || me.managedCompany;
  if (!company) throw new Error('COMPANY_REQUIRED');

  const { error } = await ctx.client
    .from('company_settings')
    .upsert({
      company_name:  company,
      locked_fields: settings.lockedFields || [],
      updated_by:    ctx.userId,
      updated_at:    new Date().toISOString()
    }, { onConflict: 'company_name' });

  if (error) throw error;
  return { success: true };
}

// 讀取公司設定（已登入用戶皆可讀，供 edit.html 套用鎖定規則）
export async function getCompanySettings(companyName) {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { lockedFields: [] };

  const { data, error } = await ctx.client
    .from('company_settings')
    .select('locked_fields')
    .eq('company_name', companyName)
    .maybeSingle();

  if (error || !data) return { lockedFields: [] };
  return { lockedFields: data.locked_fields || [] };
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

/* ── 客戶追蹤（簡易 CRM）──────────────────────────────────── */

export async function getLeadInquiriesAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return { rows: [], error: 'NO_SESSION' };

  const me = await isAdmin();
  if (!me || !me.isAdmin) return { rows: [], error: 'NOT_ADMIN' };

  let allowedIds = null;
  if (me.managedCompany) {
    const cards = await getAllCardsAdmin();
    allowedIds = new Set((cards.rows || []).map((card) => String(card.user_id)));
    if (!allowedIds.size) return { rows: [] };
  }

  let query = ctx.client
    .from('lead_inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (allowedIds) query = query.in('card_user_id', [...allowedIds]);

  const { data, error } = await query;
  if (error) {
    console.error('[Leads] 讀取待跟進名單失敗:', error.message || error);
    return { rows: [], error: error.message || String(error) };
  }
  return { rows: data || [] };
}

export async function updateLeadInquiryStatus(leadId, status, note = '') {
  const ctx = await getAuthContext();
  if (!ctx.ok) throw new Error('NO_SESSION');

  const me = await isAdmin();
  if (!me || !me.isAdmin) throw new Error('NOT_ADMIN');

  const allowed = ['new', 'contacted', 'won', 'invalid'];
  if (!allowed.includes(status)) throw new Error('INVALID_LEAD_STATUS');

  const row = {
    status,
    note: cleanText(note, 600) || null,
    updated_at: new Date().toISOString()
  };
  if (status === 'contacted') row.contacted_at = new Date().toISOString();
  if (status === 'new') row.contacted_at = null;

  const { error } = await ctx.client
    .from('lead_inquiries')
    .update(row)
    .eq('id', leadId);

  if (error) throw error;
  return { success: true };
}
