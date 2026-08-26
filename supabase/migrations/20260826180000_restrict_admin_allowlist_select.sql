-- ===== 收回 admin_allowlist 過度開放的讀取權限 =====
-- 問題：fix-subscription-rls.sql 曾新增 allowlist_authenticated_select（USING (true)），
-- 讓任何登入用戶都能讀到完整管理員名單（含真實 Email）。這條寬鬆規則蓋掉了
-- supabase-setup.sql 原本就有、限縮給管理員的 allowlist_admin_select 規則
-- （Postgres RLS 是「多條規則只要有一條允許就放行」，寬鬆的那條讓嚴格的形同虛設）。
--
-- 前端 js/cloud/admin-roles.js 實際只需要「查自己的 email 在不在名單裡」，
-- 不需要整包資料；RLS 會依查詢者身分自動把回傳的列數過濾成只剩允許看的部分，
-- 前端既有的查詢方式不用改，換一條窄的規則後行為不會壞掉。

drop policy if exists "allowlist_authenticated_select" on public.admin_allowlist;

drop policy if exists "allowlist_own_or_admin_select" on public.admin_allowlist;
create policy "allowlist_own_or_admin_select" on public.admin_allowlist
for select to authenticated
using (
  email = public.current_email()
  or public.is_admin()
);
