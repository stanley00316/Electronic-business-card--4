-- ===== 修復 admin_users 兩個問題：欄位不同步、企業管理員可自我升級成不限公司 =====
--
-- 問題一：target_company（新增管理員介面寫入的欄位）跟 managed_company
-- （cards_admin_*／storage 權限規則實際檢查的欄位）是兩個獨立欄位，不會自動同步。
-- 用現有介面新增一個「企業管理員」，那個人實際上會變成不限公司的管理員。
--
-- 問題二：admin_users_write 這條規則是 FOR ALL USING(is_admin()) WITH CHECK(is_admin())，
-- 任何管理員（含企業管理員）都能對這張表做任意新增/修改/刪除，可以把自己的 managed_company
-- 改成 null，等於自己把自己升級成不限公司的管理員。

-- 1) 修正現有兩筆資料的公司歸屬（使用者確認過的正確對應）
update public.admin_users
set managed_company = '耀鼎科技'
where user_id = '5ca3bbbe-415c-44cc-a3fe-5429c3aba55e';

update public.admin_users
set target_company = '曜鼎科技', managed_company = '曜鼎科技'
where user_id = 'a40d3104-8c5b-4f2d-96f5-9fd5e5b05c03';

-- 2) 移除過度開放的規則
drop policy if exists "admin_users_write" on public.admin_users;

-- 3) 企業管理員（managed_company 不是 null）只能新增/修改/刪除「跟自己同一家公司」的管理員資料，
-- 新資料的 managed_company／target_company 必須等於自己的公司、兩欄位必須相等、都不能是 null
-- ——同時解決欄位不同步，也讓「升級成不限公司」這件事在資料庫層面直接被擋下，不只是前端檢查。
-- 超級管理員不受這條限制，已由既有的 admin_users_insert_super／update_super／delete_super 涵蓋。
drop policy if exists "admin_users_scoped_write" on public.admin_users;
create policy "admin_users_scoped_write" on public.admin_users
for all to authenticated
using (
  exists (
    select 1 from public.admin_users me
    where me.user_id = auth.uid()::text
      and me.managed_company is not null
      and me.managed_company = admin_users.managed_company
  )
)
with check (
  managed_company is not null
  and target_company is not null
  and managed_company = target_company
  and exists (
    select 1 from public.admin_users me
    where me.user_id = auth.uid()::text
      and me.managed_company is not null
      and me.managed_company = admin_users.managed_company
  )
);
