-- 目前 cards 資料表只有「使用者自己新增自己的名片」(cards_own_insert) 跟
-- 「管理員可以修改/刪除別人的名片」(cards_admin_update/cards_admin_delete) 這兩種規則，
-- 沒有「管理員可以幫別人新增一張全新的名片」的規則——這是刻意設計來防止一般使用者
-- 亂建別人的名片，但也連帶擋住了「把手動新增的通訊錄聯絡人轉成正式會員名片」這個需求。
--
-- 這裡新增管理員專屬的新增權限，範圍跟既有的 cards_admin_update 完全一致：
--   - 超級管理員（admin_users.managed_company 是空）：可以幫任何人建立名片
--   - 企業管理員（有填 managed_company）：新建立的名片 company 欄位必須符合自己管理的公司，
--     否則會被 RLS 擋下，避免企業管理員亂建別公司的名片。
create policy "cards_admin_insert"
on public.cards
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users au
    where au.user_id::text = auth.uid()::text
      and (
        au.managed_company is null
        or public.cards.company ilike ('%' || au.managed_company || '%')
      )
  )
);
