-- 平台使用者主要以 LINE 登入（自訂 JWT），user_id 並不存在於 Supabase 內建的 auth.users 表。
-- directory_contacts.owner_user_id 若仍保留指向 auth.users(id) 的外鍵限制，
-- 會導致幾乎所有「+新增好友」的寫入都被資料庫擋下（23503 外鍵違反錯誤）。
-- supabase-setup.sql 裡其實已經有這行移除限制的語句，但從未實際套用到正式資料庫，
-- 這裡用 migration 方式正式套用。
alter table public.directory_contacts drop constraint if exists directory_contacts_owner_user_id_fkey;
