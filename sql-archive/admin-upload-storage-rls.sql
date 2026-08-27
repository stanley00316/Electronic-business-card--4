-- ===== 開放管理員代替他人上傳大頭貼／Logo（Storage RLS）=====
-- 背景：admin.html「編輯」功能（edit.html?adminMode=true）原本可以改姓名/電話/Email 等欄位，
--       但「換照片」這件事因為 Storage 安全規則寫死「只能寫到自己的資料夾」而被擋住。
-- 這個檔案新增管理員例外規則，權限範圍跟現有的 cards_admin_update 完全一致：
--   - 超級管理員（admin_users.managed_company / target_company 都是空）：任何人的圖片都能傳
--   - 企業管理員（有填公司）：只能傳「自己公司」員工的圖片
-- 執行方式：複製整份貼到 Supabase Dashboard → SQL Editor，按 Run 執行一次即可（可重複執行）。

-- 寫入（換新圖）：管理員例外規則
drop policy if exists "card_assets_write_admin" on storage.objects;
create policy "card_assets_write_admin" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        coalesce(au.managed_company, au.target_company) is null
        or (c.company is not null and c.company ilike ('%' || coalesce(au.managed_company, au.target_company) || '%'))
      )
  )
);

-- 更新（覆蓋既有圖）：管理員例外規則
drop policy if exists "card_assets_update_admin" on storage.objects;
create policy "card_assets_update_admin" on storage.objects
for update to authenticated
using (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        coalesce(au.managed_company, au.target_company) is null
        or (c.company is not null and c.company ilike ('%' || coalesce(au.managed_company, au.target_company) || '%'))
      )
  )
)
with check (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        coalesce(au.managed_company, au.target_company) is null
        or (c.company is not null and c.company ilike ('%' || coalesce(au.managed_company, au.target_company) || '%'))
      )
  )
);

-- 刪除（清除照片）：管理員例外規則
drop policy if exists "card_assets_delete_admin" on storage.objects;
create policy "card_assets_delete_admin" on storage.objects
for delete to authenticated
using (
  bucket_id = 'card-assets'
  and exists (
    select 1
    from public.admin_users au
    left join public.cards c on c.user_id::text = split_part(storage.objects.name, '/', 1)
    where au.user_id::text = auth.uid()::text
      and (
        coalesce(au.managed_company, au.target_company) is null
        or (c.company is not null and c.company ilike ('%' || coalesce(au.managed_company, au.target_company) || '%'))
      )
  )
);
