-- ===== 修正 admin_users_scoped_write 觸發無限遞迴的問題 =====
-- 上一版（20260827030000）的 admin_users_scoped_write 直接在 policy 的 USING/WITH CHECK
-- 裡查詢 admin_users 本身，Postgres 對 admin_users 的查詢一律要先套用 admin_users 自己的
-- RLS policy（含這條正在被評估的 policy），造成「政策內查自己表」的無限遞迴
-- （infinite recursion detected in policy for relation "admin_users"）。
-- 不只是擋住惡意的自我升級，連合法的企業管理員操作也會直接報錯。
--
-- 修法：比照專案裡 is_admin()／is_super_admin_allowlist() 已經驗證過可行的做法，
-- 用 SECURITY DEFINER 函式查詢（繞過呼叫時的 RLS），policy 只呼叫函式，不要在 policy
-- 本體內直接查同一張表。

create or replace function public.my_admin_managed_company()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select managed_company
  from public.admin_users
  where user_id = auth.uid()::text
  limit 1;
$$;

drop policy if exists "admin_users_scoped_write" on public.admin_users;
create policy "admin_users_scoped_write" on public.admin_users
for all to authenticated
using (
  public.my_admin_managed_company() is not null
  and public.my_admin_managed_company() = admin_users.managed_company
)
with check (
  managed_company is not null
  and target_company is not null
  and managed_company = target_company
  and public.my_admin_managed_company() is not null
  and public.my_admin_managed_company() = admin_users.managed_company
);
