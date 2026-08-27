-- ===== 開放 Google 登入（身份對照表）=====
-- 背景：跟現有的 LINE 登入是一樣的做法——Supabase 官方沒有直接支援「自訂 JWT 登入」，
-- 所以用一張對照表記住「這個 Google 帳號」對應到「我們系統裡的哪個 user_id」，
-- 之後 Edge Function（supabase/functions/google-auth）會用這張表簽發跟 LINE 登入一樣格式的 JWT。
-- 執行方式：複製整份貼到 Supabase Dashboard → SQL Editor，按 Run 執行一次即可（可重複執行）。

create table if not exists public.google_identities (
  google_user_id text primary key,
  user_id uuid not null unique,
  email text,
  display_name text,
  picture text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 這張表只給 service role（Edge Function）維護；一般前端不需要直接讀取。
-- 開啟 RLS 且不建立任何政策 = 一律拒絕 anon/authenticated 存取；service_role 依慣例永遠會略過 RLS，
-- 所以 Edge Function 既有的存取行為完全不受影響，純粹多一層防護避免資料表被外部意外讀到。
alter table public.google_identities enable row level security;
