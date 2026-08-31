-- ===== 恢復邱瑋浚的超級管理員身分 =====
--
-- 2026-08-27 收緊企業管理員權限時，這筆帳號被誤校正成「曜鼎科技」單一公司管理員，
-- 導致前端無法進入最大權限。依系統既有設計，兩個公司欄位同時為 null 才代表不限公司。

update public.admin_users
set role = 'super_admin',
    target_company = null,
    managed_company = null
where user_id = 'a40d3104-8c5b-4f2d-96f5-9fd5e5b05c03';

-- LINE 自訂 JWT 不一定會有 Email，因此超級管理員判方不能只查 Email 白名單。
-- 這個函式是 SECURITY DEFINER，可安全地被 admin_users 自己的 RLS policy 呼叫，不會觸發無限遞迴。
create or replace function public.is_super_admin_allowlist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.admin_allowlist a
    where a.enabled = true
      and lower(a.email) = public.current_email()
  ) or exists(
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and au.managed_company is null
      and au.target_company is null
  );
$$;

grant execute on function public.is_super_admin_allowlist() to authenticated;
