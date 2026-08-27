-- ===== 補建 apple_identities（修正正式環境缺表，Apple 登入目前完全無法運作）=====
-- 盤點根目錄未整併的 SQL 檔案時發現：supabase/functions/apple-auth/index.ts 會實際查詢
-- public.apple_identities（Apple userId → 我們系統的 user_id 對照表，跟 google_identities
-- 是一樣的登入身份對照做法），但這張表從來沒有在正式環境真的建立過（oauth-providers-setup.sql
-- 這份檔案雖然存在於 repo，但從未被執行）。目前 Apple 登入金鑰尚未在正式環境設定，
-- 所以這個缺口還沒有實際造成使用者端錯誤，但只要金鑰一設定上去，Apple 登入會直接查詢
-- 一張不存在的表而完全失敗。這裡先把表建起來，避免之後設定金鑰時才發現。

create table if not exists public.apple_identities (
  apple_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 只給 service role（Edge Function）維護；一般前端不需要直接讀取，跟 google_identities 一致。
alter table public.apple_identities enable row level security;
