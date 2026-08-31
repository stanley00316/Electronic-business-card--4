import { getAuthContext } from './session.js';


export async function isAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.ok) return false;
  const client = ctx.client;

  // 超級管理員必須以資料庫底層判定為準，不再由瀏覽器拿 Email 自行猜測。
  // 這樣 LINE 登入沒有 Email，或舊公司欄位曾經留有資料時，都不會誤把超級管理員降級。
  const [superResult, adminUserResult] = await Promise.all([
    client.rpc('is_super_admin_allowlist'),
    client
      .from('admin_users')
      .select('user_id, target_company')
      .eq('user_id', ctx.userId)
      .maybeSingle()
  ]);

  const isSuperAdmin = !superResult.error && superResult.data === true;
  const adminUser = adminUserResult.data || null;

  if (!isSuperAdmin && (adminUserResult.error || !adminUser)) return false;

  return {
    isAdmin: true,
    managedCompany: isSuperAdmin ? null : (adminUser.target_company || null),
    canManageAdmins: isSuperAdmin
  };
}
