import { getAuthContext } from './session.js';
import { getCustomJwt, decodeJwtEmail } from './jwt.js';


export async function isAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return false;
  const client = ctx.client;
  
  // 檢查 admin_users 表
  const { data, error } = await client
    .from('admin_users')
    .select('user_id, target_company')
    .eq('user_id', ctx.userId)
    .maybeSingle();
    
  if (error || !data) return false;
  
  // 檢查是否為超級管理員
  // 獲取用戶 email 並查詢 admin_allowlist 表
  let canManageAdmins = false;
  try {
    // 嘗試多種方式獲取用戶 email
    let userEmail = '';
    
    // 1. 從 JWT token 中獲取
    const customJwt = getCustomJwt();
    if (customJwt) {
      userEmail = decodeJwtEmail(customJwt);
      console.log('[isAdmin] email from JWT:', userEmail);
    }
    
    // 2. 如果 JWT 中沒有，從 cards 表獲取
    if (!userEmail) {
      const { data: cardData } = await client
        .from('cards')
        .select('email')
        .eq('user_id', ctx.userId)
        .maybeSingle();
      userEmail = cardData?.email || '';
      console.log('[isAdmin] email from cards:', userEmail);
    }
    
    // 3. 如果還是沒有，用 userId 直接在 admin_users 表中檢查（無 target_company 就是 super admin）
    if (!userEmail && !data.target_company) {
      // 沒有 managed company，可能是 super admin
      canManageAdmins = true;
      console.log('[isAdmin] no target_company, assuming super admin');
    }
    
    console.log('[isAdmin] final userEmail:', userEmail);
    
    if (userEmail) {
      // 直接查詢 admin_allowlist 表
      const { data: allowlistData, error: allowlistError } = await client
        .from('admin_allowlist')
        .select('email, enabled')
        .eq('enabled', true);
      
      console.log('[isAdmin] allowlist data:', allowlistData, 'error:', allowlistError);
      
      if (!allowlistError && allowlistData) {
        // 檢查用戶 email 是否在 allowlist 中（不區分大小寫）
        const emailLower = userEmail.toLowerCase();
        canManageAdmins = allowlistData.some(item => 
          item.email && item.email.toLowerCase() === emailLower
        );
        console.log('[isAdmin] canManageAdmins:', canManageAdmins);
      }
    }
  } catch (e) {
    console.error('[isAdmin] error:', e);
  }
  
  // 回傳物件：{ isAdmin: true, managedCompany: 'Tesla' or null, canManageAdmins: boolean }
  // managedCompany: null 代表 Super Admin；有值代表 Company Admin
  // canManageAdmins: 是否有權管理其他管理員（需在 admin_allowlist 中）
  return { 
    isAdmin: true, 
    managedCompany: data.target_company || null,
    canManageAdmins: canManageAdmins
  };
}
